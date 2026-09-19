// Contratos/servicios de cada cliente (Sistema, Modelos 3D, etc). Vive solo
// en Postgres: sin base de datos no tiene sentido simular contratos en
// memoria (se perderian en cada reinicio).

const { pool } = require('./pool');

function rowToService(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    userId: row.user_id,
    product: row.product,
    status: row.status,
    config: row.config || {},
    notes: row.notes,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listForUser(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM services WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows.map(rowToService);
}

async function listAll() {
  const { rows } = await pool.query(
    `SELECT services.*, users.email AS user_email
     FROM services JOIN users ON users.id = services.user_id
     ORDER BY services.created_at DESC LIMIT 500`
  );
  return rows.map(r => Object.assign(rowToService(r), { userEmail: r.user_email }));
}

async function create({ userId, product, status, config, notes, startsAt, expiresAt }) {
  const { rows } = await pool.query(
    `INSERT INTO services (user_id, product, status, config, notes, starts_at, expires_at)
     VALUES ($1, $2, COALESCE($3, 'pendiente'), COALESCE($4, '{}'::jsonb), $5, $6, $7)
     RETURNING *`,
    [
      userId,
      product,
      status || null,
      config ? JSON.stringify(config) : null,
      notes || null,
      startsAt || null,
      expiresAt || null,
    ]
  );
  return rowToService(rows[0]);
}

async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM services WHERE id = $1', [id]);
  return rowToService(rows[0]);
}

async function update(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  if (fields.status !== undefined) { sets.push(`status = $${i++}`); values.push(fields.status); }
  if (fields.config !== undefined) { sets.push(`config = $${i++}`); values.push(JSON.stringify(fields.config)); }
  if (fields.notes !== undefined) { sets.push(`notes = $${i++}`); values.push(fields.notes); }
  if (fields.startsAt !== undefined) { sets.push(`starts_at = $${i++}`); values.push(fields.startsAt); }
  if (fields.expiresAt !== undefined) { sets.push(`expires_at = $${i++}`); values.push(fields.expiresAt); }
  if (!sets.length) return findById(id);
  sets.push('updated_at = now()');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE services SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rowToService(rows[0]);
}

module.exports = { listForUser, listAll, create, findById, update };
