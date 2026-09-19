// Tickets de soporte abiertos por los clientes. Igual que db/services.js,
// vive solo en Postgres.

const { pool } = require('./pool');

function rowToTicket(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    userId: row.user_id,
    subject: row.subject,
    message: row.message,
    status: row.status,
    adminReply: row.admin_reply,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listForUser(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows.map(rowToTicket);
}

async function listAll() {
  const { rows } = await pool.query(
    `SELECT support_tickets.*, users.email AS user_email
     FROM support_tickets JOIN users ON users.id = support_tickets.user_id
     ORDER BY (status = 'abierto') DESC, support_tickets.created_at DESC LIMIT 500`
  );
  return rows.map(r => Object.assign(rowToTicket(r), { userEmail: r.user_email }));
}

async function create({ userId, subject, message }) {
  const { rows } = await pool.query(
    'INSERT INTO support_tickets (user_id, subject, message) VALUES ($1, $2, $3) RETURNING *',
    [userId, subject, message]
  );
  return rowToTicket(rows[0]);
}

async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM support_tickets WHERE id = $1', [id]);
  return rowToTicket(rows[0]);
}

async function update(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  if (fields.status !== undefined) { sets.push(`status = $${i++}`); values.push(fields.status); }
  if (fields.adminReply !== undefined) { sets.push(`admin_reply = $${i++}`); values.push(fields.adminReply); }
  if (!sets.length) return findById(id);
  sets.push('updated_at = now()');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE support_tickets SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rowToTicket(rows[0]);
}

module.exports = { listForUser, listAll, create, findById, update };
