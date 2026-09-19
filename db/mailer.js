// Envio de correo transaccional via Resend (https://resend.com). Solo
// necesita RESEND_API_KEY en las variables de entorno de Render (nunca en
// el repo). Sin esa variable, avisa por consola y no rompe el flujo que la
// llame (el registro no se cae si falta configurar esto todavia).

const RESEND_API_URL = 'https://api.resend.com/emails';
// onboarding@resend.dev no requiere verificar un dominio propio; sirve para
// arrancar. Para produccion real, verifica tu dominio en Resend y cambia
// RESEND_FROM en Render (por ejemplo 'Pescata Dev <no-reply@tudominio.com>').
const DEFAULT_FROM = 'Pescata Dev <onboarding@resend.dev>';

async function sendMail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[mailer] RESEND_API_KEY no esta definida: no se envia el correo a ${to} (asunto: "${subject}").`);
    return { sent: false, reason: 'NOT_CONFIGURED' };
  }
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[mailer] Resend respondio ${res.status} al enviar a ${to}: ${body}`);
      return { sent: false, reason: 'PROVIDER_ERROR' };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[mailer] Error de red enviando a ${to}:`, err.message);
    return { sent: false, reason: 'NETWORK_ERROR' };
  }
}

module.exports = { sendMail };
