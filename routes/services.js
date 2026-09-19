// Historial del propio cliente: sus contratos/servicios. Solo lectura;
// crearlos y editarlos es cosa del admin (routes/admin.js) hasta que el
// checkout de Stripe quede activado del todo.

const express = require('express');
const usersDb = require('../db/users');
const servicesDb = require('../db/services');

const router = express.Router();

// El cliente NUNCA recibe las notas internas ni la configuracion tecnica
// (esas son del admin): solo lo necesario para su historial.
function publicService(s) {
  return {
    id: s.id,
    product: s.product,
    status: s.status,
    startsAt: s.startsAt,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
  };
}

router.use((req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', error: 'No has iniciado sesion' });
  }
  if (!usersDb.usingPostgres) {
    return res.status(503).json({ code: 'NOT_CONFIGURED', error: 'Historial no disponible todavia' });
  }
  next();
});

router.get('/mine', async (req, res, next) => {
  try {
    const services = await servicesDb.listForUser(req.session.userId);
    res.set('Cache-Control', 'no-store');
    res.json({ services: services.map(publicService) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
