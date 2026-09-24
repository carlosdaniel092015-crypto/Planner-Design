import { createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { organizations } from '../db/schema';
import { audit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { authErrors, body, json, pick, router, security } from '../lib/openapi';
import { assertCan } from '../lib/permissions';
import { billingOn, effectivePlan, type Plan, PLANS, usage } from '../lib/plans';
import { requireAuth } from '../services/auth';
import { type StripeSubscription, stripeRequest, verifyWebhook } from '../services/stripe';
import type { Deps } from '../lib/context';

const tags = ['Plan y pagos'];
const PlanName = z.enum(['gratis', 'profesional', 'empresa']);

/** Maps a Stripe subscription onto the organisation (plan from the price, status and renewal date). */
async function applySubscription(deps: Deps, sub: StripeSubscription, orgHint?: string) {
  const prices = deps.config.billing?.prices ?? {};
  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan: Plan =
    sub.status === 'canceled' ? 'gratis' : priceId && priceId === prices.empresa ? 'empresa' : priceId && priceId === prices.profesional ? 'profesional' : ((sub.metadata?.plan as Plan) ?? 'profesional');
  const renews = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
  const [org] = orgHint
    ? await deps.db.select().from(organizations).where(eq(organizations.id, orgHint)).limit(1)
    : await deps.db.select().from(organizations).where(eq(organizations.stripeCustomerId, sub.customer)).limit(1);
  if (!org) return;
  await deps.db.transaction(async (tx) => {
    await tx
      .update(organizations)
      .set({
        plan,
        planStatus: sub.status,
        planRenewsAt: renews ? new Date(renews * 1000) : null,
        stripeCustomerId: sub.customer,
        stripeSubscriptionId: sub.status === 'canceled' ? null : sub.id,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id));
    if (plan !== org.plan || sub.status !== org.planStatus) await audit(tx, { organizationId: org.id, userId: null }, 'cambiar_plan', 'organization', org.id, { from: org.plan, to: plan, status: sub.status });
  });
}

export function billingRoutes() {
  const r = router();

  r.openapi(
    createRoute({
      method: 'get',
      path: '/billing',
      tags,
      summary: 'Plan actual, límites, uso y planes disponibles',
      description: 'Sin Stripe configurado (`enabled: false`) no se aplica ningún límite.',
      security,
      responses: {
        200: json(
          z.object({
            enabled: z.boolean(),
            plan: PlanName,
            effectivePlan: PlanName,
            status: z.string().nullable(),
            renewsAt: z.iso.datetime().nullable(),
            canManage: z.boolean(),
            usage: z.object({ users: z.number(), activeProjects: z.number() }),
            plans: z.array(
              z.object({ key: PlanName, name: z.string(), users: z.number().nullable(), activeProjects: z.number().nullable(), highlights: z.array(z.string()), price: z.string().nullable(), available: z.boolean() }),
            ),
          }),
        ),
        ...authErrors,
      },
    }),
    async (c) => {
      const a = requireAuth(c);
      const { db, config } = c.var.deps;
      const billing = config.billing;
      const priceLabel = async (id?: string) => {
        if (!billing || !id) return null;
        try {
          const p = await stripeRequest<{ unit_amount: number | null; currency: string; recurring?: { interval: string } }>(billing.secretKey, 'GET', `/prices/${id}`);
          if (p.unit_amount == null) return null;
          const amount = new Intl.NumberFormat('es-DO', { style: 'currency', currency: p.currency.toUpperCase() }).format(p.unit_amount / 100);
          return `${amount} / ${p.recurring?.interval === 'year' ? 'año' : 'mes'}`;
        } catch {
          return null;
        }
      };
      const plans = await Promise.all(
        (Object.keys(PLANS) as Plan[]).map(async (key) => ({
          key,
          name: PLANS[key].name,
          users: PLANS[key].users,
          activeProjects: PLANS[key].activeProjects,
          highlights: PLANS[key].highlights,
          price: key === 'gratis' ? 'Gratis' : await priceLabel(billing?.prices[key]),
          available: key === 'gratis' || !!billing?.prices[key],
        })),
      );
      return c.json(
        {
          enabled: billingOn(config),
          plan: a.org.plan,
          effectivePlan: billingOn(config) ? effectivePlan(a.org) : ('empresa' as Plan),
          status: a.org.planStatus,
          renewsAt: a.org.planRenewsAt?.toISOString() ?? null,
          canManage: a.user.role === 'admin',
          usage: await usage(db, a.org.id),
          plans,
        },
        200,
      );
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/billing/checkout',
      tags,
      summary: 'Pagar un plan (abre el pago seguro de Stripe)',
      security,
      request: body(z.object({ plan: z.enum(['profesional', 'empresa']) })),
      responses: { 200: json(z.object({ url: z.string() })), ...authErrors, ...pick(422) },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'billing:manage');
      const { db, config } = c.var.deps;
      const billing = config.billing;
      const { plan } = c.req.valid('json');
      const price = billing?.prices[plan];
      if (!billing || !price) throw new AppError(422, 'PAGOS_NO_CONFIGURADOS', 'Los pagos no están configurados para este plan.');
      let customer = a.org.stripeCustomerId;
      if (!customer) {
        customer = (await stripeRequest<{ id: string }>(billing.secretKey, 'POST', '/customers', { name: a.org.name, email: a.user.email, metadata: { organizationId: a.org.id } })).id;
        await db.update(organizations).set({ stripeCustomerId: customer }).where(eq(organizations.id, a.org.id));
      }
      // An active subscription changes plan in the portal (prorated); a new one goes through Checkout.
      if (a.org.stripeSubscriptionId && ['active', 'trialing', 'past_due'].includes(a.org.planStatus ?? '')) {
        const s = await stripeRequest<{ url: string }>(billing.secretKey, 'POST', '/billing_portal/sessions', { customer, return_url: `${config.frontendUrl}/admin?t=plan` });
        return c.json({ url: s.url }, 200);
      }
      const session = await stripeRequest<{ url: string }>(billing.secretKey, 'POST', '/checkout/sessions', {
        mode: 'subscription',
        customer,
        client_reference_id: a.org.id,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        subscription_data: { metadata: { organizationId: a.org.id, plan } },
        success_url: `${config.frontendUrl}/admin?t=plan&pago=ok`,
        cancel_url: `${config.frontendUrl}/admin?t=plan`,
      });
      return c.json({ url: session.url }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/billing/portal',
      tags,
      summary: 'Portal de pagos: tarjeta, facturas, cambiar o cancelar el plan',
      security,
      responses: { 200: json(z.object({ url: z.string() })), ...authErrors, ...pick(422) },
    }),
    async (c) => {
      const a = requireAuth(c);
      assertCan(a.user, 'billing:manage');
      const { config } = c.var.deps;
      if (!config.billing || !a.org.stripeCustomerId) throw new AppError(422, 'SIN_SUSCRIPCION', 'Todavía no tienes un plan de pago.');
      const s = await stripeRequest<{ url: string }>(config.billing.secretKey, 'POST', '/billing_portal/sessions', { customer: a.org.stripeCustomerId, return_url: `${config.frontendUrl}/admin?t=plan` });
      return c.json({ url: s.url }, 200);
    },
  );

  r.openapi(
    createRoute({
      method: 'post',
      path: '/billing/webhook',
      tags,
      summary: 'Avisos de Stripe (firma verificada con STRIPE_WEBHOOK_SECRET)',
      description: 'Configura en Stripe: checkout.session.completed, customer.subscription.created, customer.subscription.updated y customer.subscription.deleted.',
      responses: { 200: json(z.object({ received: z.literal(true) })), 400: json(z.object({ error: z.any() }), 'Firma no válida') },
    }),
    async (c) => {
      const { config } = c.var.deps;
      const billing = config.billing;
      const payload = await c.req.text();
      if (!billing || !verifyWebhook(payload, c.req.header('stripe-signature'), billing.webhookSecret))
        throw new AppError(400, 'FIRMA_NO_VALIDA', 'La firma del aviso de pagos no es válida.');
      const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
      const obj = event.data.object;
      if (event.type === 'checkout.session.completed' && obj.subscription) {
        const sub = await stripeRequest<StripeSubscription>(billing.secretKey, 'GET', `/subscriptions/${obj.subscription as string}`);
        await applySubscription(c.var.deps, sub, (obj.client_reference_id as string) ?? sub.metadata?.organizationId);
      } else if (event.type.startsWith('customer.subscription.')) {
        const sub = obj as unknown as StripeSubscription;
        await applySubscription(c.var.deps, event.type === 'customer.subscription.deleted' ? { ...sub, status: 'canceled' } : sub, sub.metadata?.organizationId);
      }
      return c.json({ received: true as const }, 200);
    },
  );

  return r;
}
