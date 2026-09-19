// Pool de conexion a Postgres (Render Postgres). Si no hay DATABASE_URL
// (por ejemplo en local sin base de datos configurada todavia), pool es
// null y db/users.js cae al modo en memoria en vez de fallar.

const { Pool } = require('pg');

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Render Postgres exige SSL desde fuera de su propia red interna; con
    // rejectUnauthorized:false evitamos tener que gestionar el CA a mano.
    ssl: { rejectUnauthorized: false },
  });
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // role: 'user' (por defecto) o 'admin'. El admin lo fija db/seedAdmin.js
  // a partir de variables de entorno; nadie puede hacerse admin desde la web.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';`);
  // Verificacion de email: hasta que email_verified sea true, login se bloquea.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires TIMESTAMPTZ;`);
  // Un mismo email no puede existir dos veces aunque cambie la capitalizacion.
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS users_verify_token_idx ON users (verify_token);'
  );

  // Contratos/servicios de cada cliente (Sistema, Modelos 3D, etc). El admin
  // los gestiona desde el panel sin tocar codigo: estado, configuracion
  // (ip de servidor, guild de Discord, plan Nitrado...), fechas y notas
  // internas.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendiente',
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT,
      starts_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS services_user_id_idx ON services (user_id);');

  // Tickets de soporte abiertos por los clientes; el admin responde y cierra.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'abierto',
      admin_reply TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON support_tickets (user_id);');
}

module.exports = { pool, ensureSchema };
