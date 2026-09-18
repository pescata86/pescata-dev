// Rutas de autenticacion: registro, login, logout, y "quien soy".
// Usa sesion de servidor (express-session) en vez de JWT porque es mas
// simple de revocar (contratos que caducan, bloquear una cuenta, etc).

const express = require('express');
const bcrypt = require('bcryptjs');
const usersDb = require('../db/users');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Falta email o password' });
  }
  if (usersDb.findByEmail(email)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = usersDb.createUser({ email, passwordHash });
  req.session.userId = user.id;
  res.status(201).json({ id: user.id, email: user.email });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = usersDb.findByEmail(email || '');
  if (!user) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  const ok = await bcrypt.compare(password || '', user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  req.session.userId = user.id;
  res.json({ id: user.id, email: user.email });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.get('/me', (req, res) => {
  const user = req.session.userId ? usersDb.findById(req.session.userId) : null;
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  res.json({ id: user.id, email: user.email });
});

module.exports = router;
