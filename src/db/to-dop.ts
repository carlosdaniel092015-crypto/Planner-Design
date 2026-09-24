import { connect } from './client';
import { organizations } from './schema';
import { convertOrgToDop } from './to-dop-lib';

// Converts every organisation still in USD to DOP (see to-dop-lib.ts). Run once: node dist/to-dop.js
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}
const handle = await connect(url);
try {
  for (const org of await handle.db.select().from(organizations)) {
    const r = await convertOrgToDop(handle.db, org.id);
    console.info(r.changed ? `"${org.name}": precios convertidos a RD$ con tasa ${r.rate}; ${r.projects} proyecto(s) actualizados.` : `"${org.name}": ya estaba en RD$.`);
  }
} finally {
  await handle.close();
}
