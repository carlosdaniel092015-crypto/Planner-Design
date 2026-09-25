import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------- enums ----------
export const currencyEnum = pgEnum('currency', ['USD', 'DOP']);
export const roleEnum = pgEnum('user_role', ['admin', 'disenador', 'taller', 'lectura']);
export const projectTypeEnum = pgEnum('project_type', ['cocina', 'closet']);
export const projectStatusEnum = pgEnum('project_status', ['borrador', 'diseno', 'enviado', 'cambios_solicitados', 'aprobado']);
export const moduleSourceEnum = pgEnum('module_source', ['parametrico', 'modelo3d']);
export const materialKindEnum = pgEnum('material_kind', ['madera', 'solido', 'piedra', 'metal', 'vidrio']);
export const grainEnum = pgEnum('grain', ['v', 'h', 'ninguna']);
export const materialSourceEnum = pgEnum('material_source', ['estandar', 'subido']);
export const fileKindEnum = pgEnum('file_kind', ['render', 'pdf', 'dxf', 'csv', 'textura', 'modelo3d', 'hdri', 'miniatura', 'otro']);
export const decisionEnum = pgEnum('approval_decision', ['aprobado', 'cambios']);
export const tokenPurposeEnum = pgEnum('token_purpose', ['reset', 'invite']);
export const shareAccessEnum = pgEnum('share_access', ['ver', 'editar']);

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const timestamps = {
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
const id = () => uuid('id').primaryKey().defaultRandom();
const orgId = () =>
  uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });

// ---------- organizations & users ----------
export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  brandColor: text('brand_color'),
  baseCurrency: currencyEnum('base_currency').notNull().default('USD'),
  exchangeRateDopPerUsd: numeric('exchange_rate_dop_per_usd', { precision: 12, scale: 4, mode: 'number' }).notNull().default(60),
  rateUpdatedAt: ts('rate_updated_at'),
  taxName: text('tax_name').notNull().default('ITBIS'),
  taxRate: numeric('tax_rate', { precision: 5, scale: 4, mode: 'number' }).notNull().default(0.18),
  pricesIncludeTax: boolean('prices_include_tax').notNull().default(false),
  wasteRate: numeric('waste_rate', { precision: 5, scale: 4, mode: 'number' }).notNull().default(0.15),
  marginRate: numeric('margin_rate', { precision: 5, scale: 4, mode: 'number' }).notNull().default(0),
  rounding: text('rounding', { enum: ['ninguno', 'unidad', 'decena', 'centena'] }).notNull().default('ninguno'),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  /** Subscription plan (src/lib/plans.ts). Limits only apply when billing (Stripe) is configured. */
  plan: text('plan', { enum: ['gratis', 'profesional', 'empresa'] }).notNull().default('gratis'),
  /** Stripe subscription status: active, trialing, past_due, canceled… (null = never subscribed). */
  planStatus: text('plan_status'),
  planRenewsAt: ts('plan_renews_at'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  ...timestamps,
});

export const users = pgTable(
  'users',
  {
    id: id(),
    organizationId: orgId(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    role: roleEnum('role').notNull().default('disenador'),
    active: boolean('active').notNull().default(true),
    lastLoginAt: ts('last_login_at'),
    ...timestamps,
  },
  (t) => [index('users_org_idx').on(t.organizationId)],
);

/** Auth tables (own implementation, see README "Decisiones"). */
export const userCredentials = pgTable('user_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
});

/** Sign-in with Google / Microsoft (OpenID Connect): the provider's stable subject id → our user. */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['google', 'microsoft'] }).notNull(),
    /** `sub` claim: stable per user and app for both providers. */
    subject: text('subject').notNull(),
    email: text('email'),
    lastLoginAt: ts('last_login_at'),
    ...timestamps,
  },
  (t) => [uniqueIndex('user_identities_provider_subject_uq').on(t.provider, t.subject), index('user_identities_user_idx').on(t.userId)],
);

/** Self-service sign-up waiting for the 6-digit code sent by email; the account is created only once the code is confirmed. */
export const pendingSignups = pgTable('pending_signups', {
  id: id(),
  /** Lower-cased; one pending sign-up per address (a new request replaces the code). */
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  orgName: text('org_name'),
  passwordHash: text('password_hash').notNull(),
  /** HMAC of the code with AUTH_SECRET; the code itself is never stored. */
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
  ...timestamps,
});

/** Invitation for someone who already has an account in another organisation: accepting it moves them here. */
export const orgJoinRequests = pgTable(
  'org_join_requests',
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: ts('expires_at').notNull(),
    acceptedAt: ts('accepted_at'),
    ...timestamps,
  },
  (t) => [index('org_join_requests_user_idx').on(t.userId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: ts('expires_at').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    ...timestamps,
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const verificationTokens = pgTable('verification_tokens', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  purpose: tokenPurposeEnum('purpose').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  ...timestamps,
});

// ---------- clients & projects ----------
export const clients = pgTable(
  'clients',
  {
    id: id(),
    organizationId: orgId(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    notes: text('notes'),
    deletedAt: ts('deleted_at'),
    ...timestamps,
  },
  (t) => [index('clients_org_idx').on(t.organizationId, t.name)],
);

export const projects = pgTable(
  'projects',
  {
    id: id(),
    organizationId: orgId(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    type: projectTypeEnum('type').notNull(),
    status: projectStatusEnum('status').notNull().default('borrador'),
    phase: smallint('phase').notNull().default(1),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    currency: currencyEnum('currency').notNull().default('USD'),
    estimate: numeric('estimate', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
    estimateCurrency: currencyEnum('estimate_currency').notNull().default('USD'),
    moduleCount: integer('module_count').notNull().default(0),
    version: integer('version').notNull().default(1),
    coverUrl: text('cover_url'),
    /** Version whose pricing snapshot freezes the amounts once approved (FK added in SQL to avoid a cycle). */
    approvedVersionId: uuid('approved_version_id'),
    /** Id the browser gave a project created offline; makes the create idempotent when the sync retries. */
    clientRef: text('client_ref'),
    deletedAt: ts('deleted_at'),
    ...timestamps,
  },
  (t) => [
    index('projects_org_updated_idx').on(t.organizationId, t.updatedAt.desc()),
    index('projects_org_status_idx').on(t.organizationId, t.status),
    index('projects_data_gin_idx').using('gin', t.data),
    uniqueIndex('projects_org_client_ref_uq').on(t.organizationId, t.clientRef),
  ],
);

/** A project is private to its owner; these rows give other users of the same organisation access to it. */
export const projectShares = pgTable(
  'project_shares',
  {
    id: id(),
    organizationId: orgId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    access: shareAccessEnum('access').notNull().default('ver'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('project_shares_project_user_uq').on(t.projectId, t.userId), index('project_shares_user_idx').on(t.userId)],
);

export const projectVersions = pgTable(
  'project_versions',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    estimate: numeric('estimate', { precision: 14, scale: 2, mode: 'number' }).notNull(),
    estimateCurrency: currencyEnum('estimate_currency').notNull(),
    pricingSnapshot: jsonb('pricing_snapshot').$type<Record<string, unknown>>().notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('project_versions_project_idx').on(t.projectId, t.createdAt.desc())],
);

// ---------- catalogue ----------
export const files = pgTable(
  'files',
  {
    id: id(),
    organizationId: orgId(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    kind: fileKindEnum('kind').notNull(),
    variants: jsonb('variants').$type<{ thumb?: string; view2k?: string; original?: string }>().notNull().default({}),
    width: integer('width'),
    height: integer('height'),
    name: text('name').notNull(),
    blobUrl: text('blob_url').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('files_org_idx').on(t.organizationId, t.kind), index('files_project_idx').on(t.projectId)],
);

export const moduleDefinitions = pgTable(
  'module_definitions',
  {
    id: id(),
    organizationId: orgId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    projectType: projectTypeEnum('project_type').notNull(),
    source: moduleSourceEnum('source').notNull().default('parametrico'),
    /** Prototype module type: base | upper | tall | fridge | hood. */
    row: text('row', { enum: ['base', 'upper', 'tall', 'fridge', 'hood'] }).notNull(),
    category: text('category').notNull(),
    kind: text('kind').notNull(),
    minW: numeric('min_w', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    maxW: numeric('max_w', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    defW: numeric('def_w', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    fixedH: numeric('fixed_h', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    fixedD: numeric('fixed_d', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    doors: smallint('doors').notNull().default(0),
    drawers: smallint('drawers').notNull().default(0),
    recipe: jsonb('recipe').$type<Record<string, unknown> | null>(),
    modelFileId: uuid('model_file_id').references(() => files.id, { onDelete: 'set null' }),
    footprint: jsonb('footprint').$type<Record<string, unknown> | null>(),
    anchor: jsonb('anchor').$type<Record<string, unknown> | null>(),
    materialSlots: jsonb('material_slots').$type<Record<string, string> | null>(),
    unitPrice: money('unit_price').notNull().default(0),
    priceCurrency: currencyEnum('price_currency').notNull().default('USD'),
    useInAutolayout: boolean('use_in_autolayout').notNull().default(true),
    thumbnailUrl: text('thumbnail_url'),
    version: integer('version').notNull().default(1),
    description: text('description'),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('module_definitions_org_code_uq').on(t.organizationId, t.code)],
);

export const materials = pgTable(
  'materials',
  {
    id: id(),
    organizationId: orgId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    kind: materialKindEnum('kind').notNull(),
    /** Display type shown in the editor, e.g. 'Melamina texturizada' (category holds the grouping). */
    typeLabel: text('type_label').notNull().default(''),
    color: text('color').notNull().default('#b0a898'),
    uses: text('uses').array().notNull().default(sql`'{}'::text[]`),
    baseColorFileId: uuid('base_color_file_id').references(() => files.id, { onDelete: 'set null' }),
    normalFileId: uuid('normal_file_id').references(() => files.id, { onDelete: 'set null' }),
    roughnessFileId: uuid('roughness_file_id').references(() => files.id, { onDelete: 'set null' }),
    aoFileId: uuid('ao_file_id').references(() => files.id, { onDelete: 'set null' }),
    metalnessFileId: uuid('metalness_file_id').references(() => files.id, { onDelete: 'set null' }),
    thumbnailUrl: text('thumbnail_url'),
    sizeWcm: numeric('size_w_cm', { precision: 8, scale: 2, mode: 'number' }),
    sizeHcm: numeric('size_h_cm', { precision: 8, scale: 2, mode: 'number' }),
    grain: grainEnum('grain').notNull().default('ninguna'),
    rotation: numeric('rotation', { precision: 6, scale: 2, mode: 'number' }).notNull().default(0),
    thickness: numeric('thickness', { precision: 6, scale: 2, mode: 'number' }).notNull().default(1.8),
    roughness: numeric('roughness', { precision: 4, scale: 3, mode: 'number' }),
    clearcoat: numeric('clearcoat', { precision: 4, scale: 3, mode: 'number' }),
    priceM2: money('price_m2').notNull().default(0),
    priceCurrency: currencyEnum('price_currency').notNull().default('USD'),
    supplierCode: text('supplier_code'),
    source: materialSourceEnum('source').notNull().default('estandar'),
    version: integer('version').notNull().default(1),
    active: boolean('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('materials_org_code_uq').on(t.organizationId, t.code)],
);

export const hardwarePrices = pgTable(
  'hardware_prices',
  {
    id: id(),
    organizationId: orgId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    unitPrice: money('unit_price').notNull().default(0),
    priceCurrency: currencyEnum('price_currency').notNull().default('USD'),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('hardware_prices_org_code_uq').on(t.organizationId, t.code)],
);

// ---------- approvals ----------
export const approvalLinks = pgTable(
  'approval_links',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => projectVersions.id),
    tokenHash: text('token_hash').notNull().unique(),
    recipientEmail: text('recipient_email').notNull(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    openedAt: ts('opened_at'),
    usedAt: ts('used_at'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('approval_links_project_idx').on(t.projectId)],
);

/** Append-only: the app never updates or deletes rows (a trigger enforces it, see migration 0001). */
export const approvals = pgTable(
  'approvals',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    versionId: uuid('version_id')
      .notNull()
      .references(() => projectVersions.id),
    linkId: uuid('link_id').references(() => approvalLinks.id),
    decision: decisionEnum('decision').notNull(),
    signerName: text('signer_name').notNull(),
    signerEmail: text('signer_email'),
    comment: text('comment'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    snapshotSha256: text('snapshot_sha256').notNull(),
    /** Handwritten signature as a PNG data URL (evidence, optional). */
    signaturePng: text('signature_png'),
    pdfFileId: uuid('pdf_file_id').references(() => files.id),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('approvals_project_idx').on(t.projectId)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    organizationId: orgId(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('audit_log_org_idx').on(t.organizationId, t.createdAt.desc())],
);

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: id(),
    organizationId: orgId(),
    dopPerUsd: numeric('dop_per_usd', { precision: 12, scale: 4, mode: 'number' }).notNull(),
    validFrom: ts('valid_from').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('exchange_rates_org_idx').on(t.organizationId, t.validFrom.desc())],
);
