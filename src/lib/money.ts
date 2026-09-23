import { z } from '@hono/zod-openapi';
import { convert, type Currency, round2 } from '../core';

export const MoneySchema = z
  .object({
    amount: z.number(),
    currency: z.enum(['USD', 'DOP']),
    /** RD$ per US$ used for the conversion. */
    rate: z.number(),
  })
  .openapi('Importe', { example: { amount: 6825.6, currency: 'USD', rate: 60 } });

export type Money = z.infer<typeof MoneySchema>;

export const money = (amount: number, from: Currency, to: Currency | undefined, rate: number): Money => {
  const target = to ?? from;
  return { amount: round2(convert(amount, from, target, rate)), currency: target, rate };
};
