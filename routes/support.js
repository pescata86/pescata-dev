// Tickets de soporte de un cliente: crearlos y ver los propios. Responderlos
// y cerrarlos es cosa del admin (routes/admin.js).

const express = require('express');
const usersDb = require('../db/users');
const ticketsDb = require('../db/tickets');

const router = express.Router();

router.use((req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'No has iniciado sesion' });
  }
  if (!usersDb.usingPostgres) {
    return res.status(503).json({ code: 'NOT_CONFIGURED', error: 'Soporte no disponible todavia' });
  }
  next();
});

router.get('/tickets', async (req, res, next) => {
  try {
    const tickets = await ticketsDb.listForUser(req.session.userId);
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

router.post('/tickets', async (req, res, next) => {
  try {
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim().slice(0, 200) : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 4000) : '';
    if (!subject || !message) {
      return res.status(400).json({ code: 'INVALID_TICKET', error: 'Escribe un asunto y un mensaje.' });
    }
    const ticket = await ticketsDb.create({ userId: req.session.userId, subject, message });
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
