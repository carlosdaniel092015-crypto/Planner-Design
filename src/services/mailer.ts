export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(mail) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
      });
      if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
    },
  };
}

export function consoleMailer(): Mailer {
  return {
    async send(mail) {
      console.info(`[correo] para=${mail.to} asunto="${mail.subject}"\n${mail.text}`);
    },
  };
}

export function memoryMailer(): Mailer & { outbox: Mail[] } {
  const outbox: Mail[] = [];
  return {
    outbox,
    async send(mail) {
      outbox.push(mail);
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const html = `<!doctype html><html lang="es"><body style="font-family:system-ui,sans-serif;color:#1f2937;max-width:560px;margin:auto;padding:24px">
<h2 style="margin-top:0">${esc(title)}</h2>
${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}
${cta ? `<p><a href="${esc(cta.url)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(cta.label)}</a></p><p style="font-size:12px;color:#6b7280">Si el botón no funciona, copia este enlace: ${esc(cta.url)}</p>` : ''}
</body></html>`;
  const text = [title, '', ...paragraphs, ...(cta ? ['', `${cta.label}: ${cta.url}`] : [])].join('\n');
  return { html, text };
}

export const templates = {
  approvalRequest(p: { orgName: string; projectName: string; url: string; expiresAt: Date }) {
    return {
      subject: `${p.orgName}: revisa y aprueba tu proyecto "${p.projectName}"`,
      ...layout(
        `Tu proyecto "${p.projectName}" está listo para revisión`,
        [
          `${p.orgName} te comparte el diseño y el presupuesto de tu proyecto.`,
          `Puedes aprobarlo o solicitar cambios desde el enlace. Vence el ${p.expiresAt.toLocaleDateString('es-MX', { dateStyle: 'long' })}.`,
        ],
        { label: 'Ver proyecto', url: p.url },
      ),
    };
  },
  approvalResult(p: { projectName: string; decision: 'aprobado' | 'cambios'; signerName: string; comment?: string | null; url: string }) {
    const approved = p.decision === 'aprobado';
    return {
      subject: approved ? `Proyecto aprobado: ${p.projectName}` : `Cambios solicitados: ${p.projectName}`,
      ...layout(
        approved ? `${p.signerName} aprobó "${p.projectName}"` : `${p.signerName} solicitó cambios en "${p.projectName}"`,
        [p.comment ? `Comentario: ${p.comment}` : 'Sin comentarios.'],
        { label: 'Abrir proyecto', url: p.url },
      ),
    };
  },
  passwordReset(p: { name: string; url: string }) {
    return {
      subject: 'Restablece tu contraseña',
      ...layout(`Hola, ${p.name}`, ['Recibimos una solicitud para restablecer tu contraseña. El enlace vence en 1 hora.', 'Si no fuiste tú, ignora este correo.'], {
        label: 'Restablecer contraseña',
        url: p.url,
      }),
    };
  },
  invite(p: { name: string; orgName: string; url: string }) {
    return {
      subject: `Te invitaron a ${p.orgName}`,
      ...layout(`Hola, ${p.name}`, [`Te invitaron a colaborar en ${p.orgName}. Crea tu contraseña para entrar. El enlace vence en 7 días.`], {
        label: 'Crear contraseña',
        url: p.url,
      }),
    };
  },
};
