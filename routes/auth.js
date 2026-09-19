// Rutas de autenticacion: registro, login, logout, verificacion de email y
// "quien soy". Usa sesion de servidor (express-session) en vez de JWT
// porque es mas simple de revocar (contratos que caducan, bloquear una
// cuenta, etc).
//
// Todas las respuestas de error llevan { code, error }: `code` es estable y
// lo usa el frontend para mostrar el mensaje en el idioma elegido; `error`
// es un texto de respaldo en espanol.

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const usersDb = require('../db/users');
const mailer = require('../db/mailer');

const router = express.Router();

const BCRYPT_COST = 10;
const SESSION_COOKIE = 'pescata.sid'; // debe coincidir con server.js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignora todo lo que pase de 72 bytes
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function verifyEmailHtml(link) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0b1220">
      <h2 style="margin:0 0 16px">Confirma tu cuenta en Pescata Dev</h2>
      <p>Pulsa el siguiente enlace para validar tu email y activar tu cuenta:</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#4da3ff;color:#06111f;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">
          Confirmar mi cuenta
        </a>
      </p>
      <p style="color:#62759a;font-size:13px">Si no has sido tu, ignora este correo. El enlace caduca en 24 horas.</p>
    </div>
  `;
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
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    fail(res, 429, 'RATE_LIMITED', 'Demasiados intentos. Espera unos minutos y vuelve a probar.'),
});

async function sendVerificationEmail(req, user, token) {
  const link = `${baseUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await mailer.sendMail({
    to: user.email,
    subject: 'Confirma tu cuenta en Pescata Dev',
    html: verifyEmailHtml(link),
  });
}

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
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

    let user;
    try {
      user = await usersDb.createUser({ email, passwordHash, verifyToken, verifyExpires });
    } catch (err) {
      // 23505 = unique_violation de Postgres: dos registros a la vez con el mismo email.
      if (err && err.code === '23505') {
        return fail(res, 409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
      }
      throw err;
    }

    await sendVerificationEmail(req, user, verifyToken);

    // No se abre sesion todavia: hace falta confirmar el email primero.
    res.status(201).json({ pending: true, email: user.email });
  } catch (err) {
    next(err);
  }
});

router.get('/verify', async (req, res, next) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const user = token ? await usersDb.findByVerifyToken(token) : undefined;

    if (!user || (user.verifyTokenExpires && new Date(user.verifyTokenExpires) < new Date())) {
      return res.redirect('/?verificacion=invalida');
    }

    await usersDb.markVerified(user.id);
    await startSession(req, user);
    res.redirect('/?verificacion=ok#app');
  } catch (err) {
    next(err);
  }
});

router.post('/resend-verification', resendLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    // Respuesta generica siempre (no revelar si el email existe o no).
    if (EMAIL_RE.test(email)) {
      const user = await usersDb.findByEmail(email);
      if (user && !user.emailVerified) {
        const verifyToken = crypto.randomBytes(32).toString('hex');
        const verifyExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
        await usersDb.setVerifyToken(user.id, verifyToken, verifyExpires);
        await sendVerificationEmail(req, user, verifyToken);
      }
    }
    res.json({ sent: true });
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
    if (!user.emailVerified) {
      return fail(res, 403, 'EMAIL_NOT_VERIFIED', 'Confirma tu email antes de acceder. Revisa tu bandeja de entrada.');
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
