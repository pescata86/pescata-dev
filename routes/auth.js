// Rutas de autenticacion: registro, login, logout, y "quien soy".
// Usa sesion de servidor (express-session) en vez de JWT porque es mas
// simple de revocar (contratos que caducan, bloquear una cuenta, etc).
//
// Todas las respuestas de error llevan { code, error }: `code` es estable y
// lo usa el frontend para mostrar el mensaje en el idioma elegido; `error`
// es un texto de respaldo en espanol.

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const usersDb = require('../db/users');

const router = express.Router();

const BCRYPT_COST = 10;
const SESSION_COOKIE = 'pescata.sid'; // debe coincidir con server.js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignora todo lo que pase de 72 bytes

// Hash de relleno: si el email no existe, comparamos igualmente contra este
// para que login tarde lo mismo exista o no la cuenta.
const DUMMY_HASH = bcrypt.hashSync('relleno-para-igualar-tiempos', BCRYPT_COST);

function fail(res, status, code, error) {
  return res.status(status).json({ code, error });
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

// Renueva el id de sesion al entrar (evita fijacion de sesion) y guarda el usuario.
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.save(saveErr => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

// Freno a fuerza bruta. Los intentos correctos de login no cuentan.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    fail(res, 429, 'RATE_LIMITED', 'Demasiados intentos. Espera unos minutos y vuelve a probar.'),
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    fail(res, 429, 'RATE_LIMITED', 'Demasiados intentos. Espera unos minutos y vuelve a probar.'),
});

router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && req.body.password;

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return fail(res, 400, 'INVALID_EMAIL', 'El email no parece valido.');
    }
    if (
      typeof password !== 'string' ||
      password.length < MIN_PASSWORD ||
      Buffer.byteLength(password) > MAX_PASSWORD_BYTES
    ) {
      return fail(res, 400, 'WEAK_PASSWORD', 'La contrasena debe tener al menos 8 caracteres.');
    }
    if (await usersDb.findByEmail(email)) {
      return fail(res, 409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    let user;
    try {
      user = await usersDb.createUser({ email, passwordHash });
    } catch (err) {
      // 23505 = unique_violation de Postgres: dos registros a la vez con el mismo email.
      if (err && err.code === '23505') {
        return fail(res, 409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
      }
      throw err;
    }

    await startSession(req, user);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';

    const user = email ? await usersDb.findByEmail(email) : undefined;
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) {
      return fail(res, 401, 'BAD_CREDENTIALS', 'Email o contrasena incorrectos.');
    }

    await startSession(req, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });
});

// Siempre 200: `user` es null si no hay sesion (asi el navegador no llena la
// consola de errores 401 en cada visita anonima).
router.get('/me', async (req, res, next) => {
  try {
    const user = req.session.userId ? await usersDb.findById(req.session.userId) : null;
    res.json({ user: user ? publicUser(user) : null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
