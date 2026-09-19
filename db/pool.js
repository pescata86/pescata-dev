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
  // Un mismo email no puede existir dos veces aunque cambie la capitalizacion.
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));'
  );
}

module.exports = { pool, ensureSchema };
