// Acceso a usuarios. Si hay DATABASE_URL usa Postgres de verdad; si no,
// cae a un array en memoria (solo para poder arrancar en local sin BD).
// La forma de los objetos que devuelve es siempre la misma:
//   { id, email, passwordHash, role, emailVerified, verifyToken, verifyTokenExpires, createdAt }
// IMPORTANTE: con Postgres estas funciones son asincronas, asi que quien
// las llame debe usar siempre `await` (en memoria tambien funciona con await).

const { pool } = require('./pool');

// --- Fallback en memoria (sin DATABASE_URL) ---
const memoryUsers = [];
let nextMemoryId = 1;

function memoryFindByEmail(email) {
  return memoryUsers.find(u => u.email.toLowerCase() === String(email).toLowerCase());
}
function memoryCreateUser({ email, passwordHash, verifyToken, verifyExpires }) {
  const user = {
    id: nextMemoryId++,
    email,
    passwordHash,
    role: 'user',
    emailVerified: false,
    verifyToken: verifyToken || null,
    verifyTokenExpires: verifyExpires || null,
    createdAt: new Date().toISOString(),
  };
  memoryUsers.push(user);
  return user;
}
function memoryFindById(id) {
  return memoryUsers.find(u => u.id === id);
}
function memoryFindByVerifyToken(token) {
  return memoryUsers.find(u => u.verifyToken && u.verifyToken === token);
}
function memorySetVerifyToken(id, token, expires) {
  const u = memoryFindById(id);
  if (u) { u.verifyToken = token; u.verifyTokenExpires = expires; }
  return u;
}
function memoryMarkVerified(id) {
  const u = memoryFindById(id);
  if (u) { u.emailVerified = true; u.verifyToken = null; u.verifyTokenExpires = null; }
  return u;
}
function memoryUpsertAdmin({ email, passwordHash }) {
  const existing = memoryFindByEmail(email);
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'admin';
    existing.emailVerified = true;
    return existing;
  }
  const user = {
    id: nextMemoryId++,
    email,
    passwordHash,
    role: 'admin',
    emailVerified: true,
    verifyToken: null,
    verifyTokenExpires: null,
    createdAt: new Date().toISOString(),
  };
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
    .map(u => ({ id: u.id, email: u.email, role: u.role, emailVerified: u.emailVerified, createdAt: u.createdAt }))
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
    emailVerified: Boolean(row.email_verified),
    verifyToken: row.verify_token,
    verifyTokenExpires: row.verify_token_expires,
    createdAt: row.created_at,
  };
}

async function pgFindByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  return rowToUser(rows[0]);
}
async function pgCreateUser({ email, passwordHash, verifyToken, verifyExpires }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, verify_token, verify_token_expires)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [email, passwordHash, verifyToken || null, verifyExpires || null]
  );
  return rowToUser(rows[0]);
}
async function pgFindById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rowToUser(rows[0]);
}
async function pgFindByVerifyToken(token) {
  const { rows } = await pool.query('SELECT * FROM users WHERE verify_token = $1', [token]);
  return rowToUser(rows[0]);
}
async function pgSetVerifyToken(id, token, expires) {
  const { rows } = await pool.query(
    'UPDATE users SET verify_token = $1, verify_token_expires = $2 WHERE id = $3 RETURNING *',
    [token, expires, id]
  );
  return rowToUser(rows[0]);
}
async function pgMarkVerified(id) {
  const { rows } = await pool.query(
    `UPDATE users SET email_verified = true, verify_token = NULL, verify_token_expires = NULL WHERE id = $1 RETURNING *`,
    [id]
  );
  return rowToUser(rows[0]);
}
async function pgUpsertAdmin({ email, passwordHash }) {
  const existing = await pgFindByEmail(email);
  if (existing) {
    const { rows } = await pool.query(
      `UPDATE users SET password_hash = $1, role = 'admin', email_verified = true WHERE id = $2 RETURNING *`,
      [passwordHash, existing.id]
    );
    return rowToUser(rows[0]);
  }
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1, $2, 'admin', true) RETURNING *`,
    [email, passwordHash]
  );
  return rowToUser(rows[0]);
}
async function pgDemoteOtherAdmins(email) {
  await pool.query(`UPDATE users SET role = 'user' WHERE role = 'admin' AND lower(email) <> lower($1)`, [email]);
}
async function pgListUsers() {
  const { rows } = await pool.query(
    'SELECT id, email, role, email_verified, created_at FROM users ORDER BY created_at DESC LIMIT 500'
  );
  return rows.map(r => ({
    id: r.id,
    email: r.email,
    role: r.role || 'user',
    emailVerified: Boolean(r.email_verified),
    createdAt: r.created_at,
  }));
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
  findByVerifyToken: usingPostgres ? pgFindByVerifyToken : memoryFindByVerifyToken,
  setVerifyToken: usingPostgres ? pgSetVerifyToken : memorySetVerifyToken,
  markVerified: usingPostgres ? pgMarkVerified : memoryMarkVerified,
  upsertAdmin: usingPostgres ? pgUpsertAdmin : memoryUpsertAdmin,
  demoteOtherAdmins: usingPostgres ? pgDemoteOtherAdmins : memoryDemoteOtherAdmins,
  listUsers: usingPostgres ? pgListUsers : memoryListUsers,
};
