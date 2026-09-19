// Crea o actualiza la cuenta de administrador al arrancar, a partir de dos
// variables de entorno que SOLO viven en Render (nunca en el repo):
//   ADMIN_EMAIL     email del admin
//   ADMIN_PASSWORD  contrasena (minimo 12 caracteres)
// Solo puede haber un admin: el resto de cuentas con rol admin pasan a user.
// Como esto ocurre antes de que el servidor acepte peticiones, nadie puede
// registrar ese email desde la web antes que el dueno.

const bcrypt = require('bcryptjs');
const usersDb = require('./users');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_ADMIN_PASSWORD = 12;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignora lo que pase de 72 bytes

async function seedAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email && !password) return; // no configurado: no hay admin

  if (!EMAIL_RE.test(email)) {
    console.warn('[admin] ADMIN_EMAIL no es un email valido: no se crea el administrador.');
    return;
  }
  if (password.length < MIN_ADMIN_PASSWORD || Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    console.warn('[admin] ADMIN_PASSWORD debe tener al menos 12 caracteres (y no pasar de 72 bytes): no se crea el administrador.');
    return;
  }

  const existing = await usersDb.findByEmail(email);
  const upToDate = existing && existing.role === 'admin' && (await bcrypt.compare(password, existing.passwordHash));
  if (!upToDate) {
    await usersDb.upsertAdmin({ email, passwordHash: await bcrypt.hash(password, 12) });
  }
  await usersDb.demoteOtherAdmins(email);
  console.log('[admin] Cuenta de administrador lista.');
}

module.exports = { seedAdmin };
