import { connect } from './client';
import { seedOrganization } from './seed-lib';

const url = process.env.DATABASE_URL;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!url || !email || !password) {
  console.error('Faltan DATABASE_URL, SEED_ADMIN_EMAIL o SEED_ADMIN_PASSWORD.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres.');
  process.exit(1);
}

const rate = Number(process.env.SEED_RATE ?? 60);
if (!Number.isFinite(rate) || rate <= 0) {
  console.error('SEED_RATE debe ser un número positivo (pesos dominicanos por dólar).');
  process.exit(1);
}
const handle = await connect(url);
try {
  const { org, admin } = await seedOrganization(handle.db, {
    orgName: process.env.SEED_ORG_NAME ?? 'Planner',
    slug: process.env.SEED_ORG_SLUG ?? 'stephanny',
    admin: { name: process.env.SEED_ADMIN_NAME ?? 'Administrador', email, password },
    rate,
    currency: process.env.SEED_CURRENCY === 'USD' ? 'USD' : 'DOP',
  });
  console.info(`Semilla lista: organización "${org.name}" (${org.slug}), admin ${admin.email}.`);
} finally {
  await handle.close();
}
