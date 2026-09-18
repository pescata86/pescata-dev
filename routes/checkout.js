// Rutas de pago con Stripe.
// De momento define un catalogo de "planes" (dias de Sistema activo) muy
// simple en el propio codigo como placeholder: cuando exista el catalogo
// real de Sistema/Modelos 3D en base de datos, PRICES debe salir de ahi.

const express = require('express');
const Stripe = require('stripe');

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// TODO: sustituir por precios reales creados en el dashboard de Stripe
const PRICES = {
  sistema_30d: { name: 'Sistema - 30 dias', unitAmount: 0, currency: 'eur' },
};

router.post('/create-checkout-session', requireAuth, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe no esta configurado todavia (falta STRIPE_SECRET_KEY)' });
  }
  const { plan } = req.body || {};
  const priceInfo = PRICES[plan];
  if (!priceInfo) {
    return res.status(400).json({ error: 'Plan desconocido' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: priceInfo.currency,
        product_data: { name: priceInfo.name },
        unit_amount: priceInfo.unitAmount,
      },
      quantity: 1,
    }],
    success_url: `${req.protocol}://${req.get('host')}/checkout/exito?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${req.protocol}://${req.get('host')}/checkout/cancelado`,
    metadata: { userId: String(req.session.userId), plan },
  });

  res.json({ url: session.url });
});

// Webhook de Stripe: aqui es donde, cuando el pago se confirme, se debe
// disparar la activacion real (crear instancia del producto, canales de
// Discord, fecha de caducidad). De momento solo deja el punto de entrada.
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Webhook no configurado todavia');
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Firma invalida: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    // TODO: activar el producto para event.data.object.metadata.userId
    // (crear instancia del panel, canales de Discord, marcar caducidad)
  }

  res.json({ received: true });
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  next();
}

module.exports = router;
