import { and, eq, lt, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { z } from '@hono/zod-openapi';
import { badRequest } from './errors';

export const paginationQuery = {
  cursor: z.string().optional().openapi({ description: 'Cursor opaco devuelto en `nextCursor`.' }),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};

interface Cursor {
  t: string;
  id: string;
}

export const encodeCursor = (t: Date, id: string) => Buffer.from(JSON.stringify({ t: t.toISOString(), id } satisfies Cursor)).toString('base64url');

export function decodeCursor(cursor: string | undefined): { t: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const c = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Cursor;
    const t = new Date(c.t);
    if (Number.isNaN(t.getTime()) || typeof c.id !== 'string') throw new Error();
    return { t, id: c.id };
  } catch {
    throw badRequest('El cursor no es válido.');
  }
}

/** Keyset condition for `ORDER BY time DESC, id DESC`. */
export function afterCursor(timeCol: PgColumn, idCol: PgColumn, cursor: string | undefined): SQL | undefined {
  const c = decodeCursor(cursor);
  if (!c) return undefined;
  return or(lt(timeCol, c.t), and(eq(timeCol, c.t), lt(idCol, c.id)));
}

/** Fetch `limit + 1` rows, then call this to split page and next cursor. */
export function page<T>(rows: T[], limit: number, key: (row: T) => { t: Date; id: string }) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(key(last).t, key(last).id) : null };
}
