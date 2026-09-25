import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { smtpMailer } from '../src/services/mailer';

describe('correo por SMTP (Gmail)', () => {
  it('sale desde la cuenta de Gmail con el nombre de la organización y responde a quien envía', async () => {
    const sent: any[] = [];
    const json = createTransport({ jsonTransport: true });
    const mailer = smtpMailer({ host: 'smtp.gmail.com', port: 465, user: 'planner@gmail.com', pass: 'x' }, 'Planner <planner@gmail.com>', {
      sendMail: async (m: any) => {
        const info = await json.sendMail(m);
        sent.push(JSON.parse(String(info.message)));
        return info;
      },
    } as any);
    await mailer.send({ to: 'cliente@x.test', subject: 'Hola', html: '<p>Hola</p>', text: 'Hola', fromName: 'Acentos Deco', replyTo: 'carlos@x.test' });
    expect(sent[0].from).toEqual({ address: 'planner@gmail.com', name: 'Acentos Deco' });
    expect(sent[0].replyTo).toEqual([{ address: 'carlos@x.test', name: '' }]);
    expect(sent[0].to).toEqual([{ address: 'cliente@x.test', name: '' }]);
  });
});
