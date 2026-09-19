require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const path = require('path');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);

const { pool, ensureSchema } = require('./db/pool');
const { seedAdmin } = require('./db/seedAdmin');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const checkoutRouter = require('./routes/checkout');
const servicesRouter = require('./routes/services');
const supportRouter = require('./routes/support');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const SESSION_COOKIE = 'pescata.sid'; // debe coincidir con routes/auth.js

// Render pone un proxy delante: sin esto Express cree que la conexion es HTTP
// y no envia la cookie de sesion "secure" (el login no se mantendria).
app.set('trust proxy', 1);
app.disable('x-powered-by');

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn('SESSION_SECRET no esta definida: se usa un secreto aleatorio y las sesiones se pierden en cada reinicio. Def\u00ednela en Render.');
  sessionSecret = crypto.randomBytes(32).toString('hex');
}

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

// El webhook de Stripe necesita el body en crudo, asi que se monta ANTES
// del express.json() global (ver routes/checkout.js, usa express.raw ahi mismo).
app.use('/api/checkout/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10kb' }));
app.use(session({
  name: SESSION_COOKIE,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  // Con Postgres las sesiones sobreviven a reinicios y a que Render duerma el
  // servicio gratuito; sin base de datos (desarrollo local) queda en memoria.
  store: pool ? new PgStore({ pool, createTableIfMissing: true }) : undefined,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
  },
}));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/services', servicesRouter);
app.use('/api/support', supportRouter);

// Paginas de vuelta de Stripe: de momento aterrizan en el panel.
app.get(['/checkout/exito', '/checkout/cancelado'], (req, res) => res.redirect('/#app'));

// Portada = index.html + extras. Al arrancar se monta asi:
//  - public/tema.css se enlaza al final del <head> (con hash para evitar cache vieja)
//  - la seccion <section class="hero"> de index.html se sustituye por public/hero.html
//  - public/admin.js (panel de admin, solo visible para el admin) se carga al final del <body>
// Si falta alguno de esos ficheros, se sirve lo demas tal cual (sin romper la web).
function fileHash(buf) {
  return crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
}
function buildIndex() {
  let page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  try {
    const css = fs.readFileSync(path.join(__dirname, 'public', 'tema.css'));
    page = page.replace('</head>', () => '<link rel="stylesheet" href="/tema.css?v=' + fileHash(css) + '">\n</head>');
    const hero = fs.readFileSync(path.join(__dirname, 'public', 'hero.html'), 'utf8');
    page = page.replace(/<section class="hero">[\s\S]*?<\/section>/, () => hero);
  } catch (err) {
    console.warn('No se pudo aplicar el tema (public/tema.css o public/hero.html):', err.message);
  }
  try {
    const js = fs.readFileSync(path.join(__dirname, 'public', 'admin.js'));
    page = page.replace('</body>', () => '<script src="/admin.js?v=' + fileHash(js) + '" defer></script>\n</body>');
  } catch (err) {
    console.warn('No se pudo cargar public/admin.js:', err.message);
  }
  return page;
}
const INDEX_HTML = buildIndex();

// Solo se publica lo que se sirve aqui: la portada y lo que haya en /public.
// (Antes se servia toda la raiz del repo y server.js, db/ y routes/ eran descargables.)
app.get(['/', '/index.html'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(INDEX_HTML);
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Endpoint de salud para que Render (u otro monitor) compruebe que el servicio esta vivo
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', (req, res) => res.status(404).json({ code: 'NOT_FOUND', error: 'No existe' }));
app.use((req, res) => res.status(404).type('text').send('404 - No encontrado'));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'BAD_REQUEST', error: 'JSON invalido' });
  }
  console.error(err);
  res.status(500).json({ code: 'SERVER_ERROR', error: 'Error interno del servidor' });
});

process.on('unhandledRejection', err => console.error('unhandledRejection:', err));

// Orden de arranque: esquema de BD -> cuenta admin -> aceptar peticiones.
ensureSchema()
  .catch(err => console.error('No se pudo preparar el esquema de la base de datos:', err))
  .then(() => seedAdmin())
  .catch(err => console.error('No se pudo preparar la cuenta de administrador:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`pescata-dev escuchando en el puerto ${PORT}`);
    });
  });
