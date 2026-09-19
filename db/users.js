// Acceso a usuarios. Si hay DATABASE_URL usa Postgres de verdad; si no,
// cae a un array en memoria (solo para poder arrancar en local sin BD).
// La forma de los objetos que devuelve es siempre la misma:
//   { id, email, passwordHash, createdAt }
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
  const user = { id: nextMemoryId++, email, passwordHash, createdAt: new Date().toISOString() };
  memoryUsers.push(user);
  return user;
}
function memoryFindById(id) {
  return memoryUsers.find(u => u.id === id);
}

// --- Postgres real ---
function rowToUser(row) {
  if (!row) return undefined;
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
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

const usingPostgres = Boolean(pool);
if (!usingPostgres) {
  console.warn('[db/users] DATABASE_URL no esta definida: usando almacenamiento en memoria (se pierde al reiniciar). Solo valido para desarrollo local.');
}

module.exports = {
  usingPostgres,
  findByEmail: usingPostgres ? pgFindByEmail : memoryFindByEmail,
  createUser: usingPostgres ? pgCreateUser : memoryCreateUser,
  findById: usingPostgres ? pgFindById : memoryFindById,
};
