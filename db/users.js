// Acceso a usuarios. Si hay DATABASE_URL usa Postgres de verdad; si no,
// cae a un array en memoria (solo para poder arrancar en local sin BD).
// La forma de los objetos que devuelve es siempre la misma:
//   { id, email, passwordHash, role, createdAt }
// IMPORTANTE: con Postgres estas funciones son asincronas, asi que quien
// las llame debe usar siempre `await` (en memoria tambien funciona con await).

const { pool } = require('./pool');

// --- Fallback en memoria (sin DATABASE_URL) ---
const memoryUsers = [];
let nextMemoryId = 1;

function memoryFindByEmail(email) {
  return memoryUsers.find(u => u.email.toLowerCase() === String(email).toLowerCase());
}
function memoryCreateUser({ email, passwordHash }) {
  const user = { id: nextMemoryId++, email, passwordHash, role: 'user', createdAt: new Date().toISOString() };
  memoryUsers.push(user);
  return user;
}
function memoryFindById(id) {
  return memoryUsers.find(u => u.id === id);
}
function memoryUpsertAdmin({ email, passwordHash }) {
  const existing = memoryFindByEmail(email);
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'admin';
    return existing;
  }
  const user = { id: nextMemoryId++, email, passwordHash, role: 'admin', createdAt: new Date().toISOString() };
  memoryUsers.push(user);
  return user;
}
function memoryDemoteOtherAdmins(email) {
  memoryUsers.forEach(u => {
    if (u.role === 'admin' && u.email.toLowerCase() !== String(email).toLowerCase()) u.role = 'user';
  });
}
function memoryListUsers() {
  return memoryUsers
    .map(u => ({ id: u.id, email: u.email, role: u.role, createdAt: u.createdAt }))
    .reverse();
}

// --- Postgres real ---
function rowToUser(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role || 'user',
    createdAt: row.created_at,
  };
}

async function pgFindByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  return rowToUser(rows[0]);
}
async function pgCreateUser({ email, passwordHash }) {
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
    [email, passwordHash]
  );
  return rowToUser(rows[0]);
}
async function pgFindById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rowToUser(rows[0]);
}
async function pgUpsertAdmin({ email, passwordHash }) {
  const existing = await pgFindByEmail(email);
  if (existing) {
    const { rows } = await pool.query(
      `UPDATE users SET password_hash = $1, role = 'admin' WHERE id = $2 RETURNING *`,
      [passwordHash, existing.id]
    );
    return rowToUser(rows[0]);
  }
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin') RETURNING *`,
    [email, passwordHash]
  );
  return rowToUser(rows[0]);
}
async function pgDemoteOtherAdmins(email) {
  await pool.query(`UPDATE users SET role = 'user' WHERE role = 'admin' AND lower(email) <> lower($1)`, [email]);
}
async function pgListUsers() {
  const { rows } = await pool.query(
    'SELECT id, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 500'
  );
  return rows.map(r => ({ id: r.id, email: r.email, role: r.role || 'user', createdAt: r.created_at }));
}

const usingPostgres = Boolean(pool);
if (!usingPostgres) {
  console.warn('[db/users] DATABASE_URL no esta definida: usando almacenamiento en memoria (se pierde al reiniciar). Solo valido para desarrollo local.');
}

module.exports = {
  usingPostgres,
  findByEmail: usingPostgres ? pgFindByEmail : memoryFindByEmail,
  createUser: usingPostgres ? pgCreateUser : memoryCreateUser,
  findById: usingPostgres ? pgFindById : memoryFindById,
  upsertAdmin: usingPostgres ? pgUpsertAdmin : memoryUpsertAdmin,
  demoteOtherAdmins: usingPostgres ? pgDemoteOtherAdmins : memoryDemoteOtherAdmins,
  listUsers: usingPostgres ? pgListUsers : memoryListUsers,
};
