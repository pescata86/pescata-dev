// Rutas de administracion. El rol se comprueba SIEMPRE en el servidor a partir
// de la sesion y la base de datos; el navegador solo decide que mostrar.
// A cualquiera que no sea admin se le responde 404 (no se revela que existen).

const express = require('express');
const usersDb = require('../db/users');
const servicesDb = require('../db/services');
const ticketsDb = require('../db/tickets');

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
    if (!usersDb.usingPostgres) {
      return res.status(503).json({ code: 'NOT_CONFIGURED', error: 'Falta configurar la base de datos' });
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

// Contratos/servicios de todos los clientes: estado, configuracion, fechas.
router.get('/services', async (req, res, next) => {
  try {
    const services = await servicesDb.listAll();
    res.json({ services });
  } catch (err) {
    next(err);
  }
});

router.post('/services', async (req, res, next) => {
  try {
    const { userId, product, status, config, notes, startsAt, expiresAt } = req.body || {};
    if (!userId || !product) {
      return res.status(400).json({ code: 'INVALID_SERVICE', error: 'Falta userId o product.' });
    }
    const target = await usersDb.findById(Number(userId));
    if (!target) return res.status(404).json({ code: 'USER_NOT_FOUND', error: 'Cliente no encontrado.' });
    const service = await servicesDb.create({ userId: target.id, product, status, config, notes, startsAt, expiresAt });
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
});

router.patch('/services/:id', async (req, res, next) => {
  try {
    const service = await servicesDb.update(Number(req.params.id), req.body || {});
    if (!service) return res.status(404).json({ code: 'NOT_FOUND', error: 'Servicio no encontrado.' });
    res.json({ service });
  } catch (err) {
    next(err);
  }
});

// Tickets de soporte de todos los clientes.
router.get('/tickets', async (req, res, next) => {
  try {
    const tickets = await ticketsDb.listAll();
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

router.patch('/tickets/:id', async (req, res, next) => {
  try {
    const ticket = await ticketsDb.update(Number(req.params.id), req.body || {});
    if (!ticket) return res.status(404).json({ code: 'NOT_FOUND', error: 'Ticket no encontrado.' });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
