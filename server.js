// Servidor web para pescata-dev.
// De momento solo sirve el sitio estatico (index.html y assets), pero al ser
// un web service (no un static site) ya queda listo para anadir encima las
// rutas de auth, catalogo dinamico y pagos (Stripe) sin volver a migrar nada.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Sirve todos los ficheros estaticos de la raiz del repo (index.html, css, js, imagenes...)
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Endpoint de salud para que Render (u otro monitor) compruebe que el servicio esta vivo
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// A partir de aqui se iran anadiendo las rutas de la tienda:
//   app.use('/api/auth', authRouter);
//   app.use('/api/checkout', checkoutRouter);
//   app.use('/api/catalogo', catalogoRouter);

app.listen(PORT, () => {
  console.log(`pescata-dev escuchando en el puerto ${PORT}`);
});
