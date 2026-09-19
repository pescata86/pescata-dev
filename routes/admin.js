// Rutas de administracion. El rol se comprueba SIEMPRE en el servidor a partir
// de la sesion y la base de datos; el navegador solo decide que mostrar.
// A cualquiera que no sea admin se le responde 404 (no se revela que existen).

const express = require('express');
const usersDb = require('../db/users');

const router = express.Router();

async function currentUser(req) {
  return req.session && req.session.userId ? usersDb.findById(req.session.userId) : null;
}

// Siempre 200: el frontend lo usa para saber si debe mostrar el panel.
router.get('/me', async (req, res, next) => {
  try {
    const user = await currentUser(req);
    res.set('Cache-Control', 'no-store');
    if (user && user.role === 'admin') return res.json({ admin: true, email: user.email });
    res.json({ admin: false });
  } catch (err) {
    next(err);
  }
});

router.use(async (req, res, next) => {
  try {
    const user = await currentUser(req);
    if (!user || user.role !== 'admin') {
      return res.status(404).json({ code: 'NOT_FOUND', error: 'No existe' });
    }
    res.set('Cache-Control', 'no-store');
    next();
  } catch (err) {
    next(err);
  }
});

// Lista de cuentas (sin hashes de contrasena).
router.get('/users', async (req, res, next) => {
  try {
    const users = await usersDb.listUsers();
    res.json({ total: users.length, users });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
