require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');

const { ensureSchema } = require('./db/pool');
const authRouter = require('./routes/auth');
const checkoutRouter = require('./routes/checkout');

const app = express();
const PORT = process.env.PORT || 3000;

// El webhook de Stripe necesita el body en crudo, asi que se monta ANTES
// del express.json() global (ver routes/checkout.js, usa express.raw ahi mismo).
app.use('/api/checkout/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
  },
}));

app.use('/api/auth', authRouter);
app.use('/api/checkout', checkoutRouter);

// Sirve todos los ficheros estaticos de la raiz del repo (index.html, css, js, imagenes...)
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Endpoint de salud para que Render (u otro monitor) compruebe que el servicio esta vivo
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

ensureSchema()
  .catch(err => console.error('No se pudo preparar el esquema de la base de datos:', err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`pescata-dev escuchando en el puerto ${PORT}`);
    });
  });
