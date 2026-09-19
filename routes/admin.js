// Rutas de administracion. El rol se comprueba SIEMPRE en el servidor a partir
// de la sesion y la base de datos; el navegador solo decide que mostrar.
// A cualquiera que no sea admin se le responde 404 (no se revela que existen).

const express = require('express');
const usersDb = require('../db/users');
const servicesDb = require('../db/services');
const ticketsDb = require('../db/tickets');

const router = express.Router();

const SERVICE_STATUS = ['pendiente', 'activo', 'suspendido', 'caducado', 'cancelado'];
const TICKET_STATUS = ['abierto', 'en_curso', 'cerrado'];

async function currentUser(req) {
  return req.session && req.session.userId ? usersDb.findById(req.session.userId) : null;
}

function bad(res, code, error) {
  return res.status(400).json({ code, error });
}
function idParam(req) {
  const n = Number(req.params.id);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
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

// Verificacion manual de email: para cuentas que no pueden recibir el correo
// (Resend sin configurar, cuenta de pruebas, cliente que no lo encuentra...).
router.patch('/users/:id/verify', async (req, res, next) => {
  try {
    const id = idParam(req);
    if (!id) return bad(res, 'INVALID_ID', 'Id no valido.');
    const target = await usersDb.findById(id);
    if (!target) return res.status(404).json({ code: 'USER_NOT_FOUND', error: 'Cliente no encontrado.' });
    const updated = await usersDb.markVerified(target.id);
    res.json({ user: { id: updated.id, email: updated.email, emailVerified: updated.emailVerified } });
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
    if (!userId || typeof product !== 'string' || !product.trim()) {
      return bad(res, 'INVALID_SERVICE', 'Falta cliente o producto.');
    }
    if (status !== undefined && !SERVICE_STATUS.includes(status)) {
      return bad(res, 'INVALID_STATUS', 'Estado no valido.');
    }
    if (config !== undefined && !isPlainObject(config)) {
      return bad(res, 'INVALID_CONFIG', 'La configuracion debe ser un objeto JSON.');
    }
    const target = await usersDb.findById(Number(userId));
    if (!target) return res.status(404).json({ code: 'USER_NOT_FOUND', error: 'Cliente no encontrado.' });
    const service = await servicesDb.create({
      userId: target.id,
      product: product.trim().slice(0, 200),
      status,
      config,
      notes: typeof notes === 'string' ? notes.slice(0, 4000) : null,
      startsAt,
      expiresAt,
    });
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
});

router.patch('/services/:id', async (req, res, next) => {
  try {
    const id = idParam(req);
    if (!id) return bad(res, 'INVALID_ID', 'Id no valido.');
    const body = req.body || {};
    if (body.status !== undefined && !SERVICE_STATUS.includes(body.status)) {
      return bad(res, 'INVALID_STATUS', 'Estado no valido.');
    }
    if (body.config !== undefined && !isPlainObject(body.config)) {
      return bad(res, 'INVALID_CONFIG', 'La configuracion debe ser un objeto JSON.');
    }
    const fields = {
      status: body.status,
      config: body.config,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 4000) : undefined,
      startsAt: body.startsAt,
      expiresAt: body.expiresAt,
    };
    const service = await servicesDb.update(id, fields);
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
    const id = idParam(req);
    if (!id) return bad(res, 'INVALID_ID', 'Id no valido.');
    const body = req.body || {};
    if (body.status !== undefined && !TICKET_STATUS.includes(body.status)) {
      return bad(res, 'INVALID_STATUS', 'Estado no valido.');
    }
    const fields = {
      status: body.status,
      adminReply: typeof body.adminReply === 'string' ? body.adminReply.slice(0, 4000) : undefined,
    };
    const ticket = await ticketsDb.update(id, fields);
    if (!ticket) return res.status(404).json({ code: 'NOT_FOUND', error: 'Ticket no encontrado.' });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
