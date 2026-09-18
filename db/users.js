// Store de usuarios en memoria: SOLO como placeholder de arranque.
// Se pierde al reiniciar el servicio. Antes de tener clientes reales hay que
// sustituir esto por una tabla en Postgres (Render Postgres, por ejemplo) y
// usar DATABASE_URL. La forma de los objetos (id, email, passwordHash,
// createdAt) es la que deberia tener esa tabla.

const users = [];
let nextId = 1;

function findByEmail(email) {
  return users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
}

function createUser({ email, passwordHash }) {
  const user = { id: nextId++, email, passwordHash, createdAt: new Date().toISOString() };
  users.push(user);
  return user;
}

function findById(id) {
  return users.find(u => u.id === id);
}

module.exports = { findByEmail, createUser, findById };
