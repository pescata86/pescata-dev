// Panel de administracion: solo aparece si el servidor confirma que la sesion
// actual es la del admin. Se engancha al bloque #cuenta de la portada (que ya
// se muestra/oculta al entrar y salir) sin tocar el resto de la web.
(function () {
  'use strict';
  var cuenta = document.getElementById('cuenta');
  if (!cuenta || !window.fetch) return;

  var style = document.createElement('style');
  style.textContent =
    '#admin .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:20px}' +
    '#admin .stat{background:var(--bg-panel);padding:18px}' +
    '#admin .stat b{display:block;font-size:1.8rem;color:var(--amber)}' +
    '#admin .stat span{color:var(--muted);font-size:.82rem}' +
    '#admin .tbl{overflow-x:auto;border:1px solid var(--line);background:var(--bg-panel);margin-bottom:16px}' +
    '#admin table{width:100%;border-collapse:collapse;font-size:.88rem}' +
    '#admin th{text-align:left;color:var(--muted);font-weight:500;padding:10px 12px;border-bottom:1px solid var(--line)}' +
    '#admin td{padding:10px 12px;border-bottom:1px solid var(--line);word-break:break-all}' +
    '#admin tr:last-child td{border-bottom:0}' +
    '#admin .role{font-family:\'IBM Plex Mono\',monospace;color:var(--muted)}' +
    '#admin .role.adm{color:var(--teal)}' +
    '@media (max-width:560px){#admin .stats{grid-template-columns:1fr}}';
  document.head.appendChild(style);

  var box = null;

  function get(path) {
    return fetch('/api/admin' + path, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  // Todo el texto va con textContent: los emails los escriben usuarios externos.
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmt(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function remove() {
    if (box) { box.remove(); box = null; }
  }

  function render(me, data) {
    var users = data.users || [];
    var startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    var weekAgo = Date.now() - 7 * 86400000;
    var today = 0;
    var week = 0;
    users.forEach(function (u) {
      var t = new Date(u.createdAt).getTime();
      if (t >= startToday.getTime()) today++;
      if (t >= weekAgo) week++;
    });

    var sec = make('section');
    sec.id = 'admin';
    var wrap = make('div', 'wrap');
    sec.appendChild(wrap);

    var head = make('div', 'sec-head');
    head.appendChild(make('span', 'k', '// ADMIN'));
    head.appendChild(make('h2', null, 'Panel de administración'));
    head.appendChild(make('p', null, 'Solo visible para ti · sesión de ' + me.email));
    wrap.appendChild(head);

    var stats = make('div', 'stats');
    [[data.total, 'cuentas en total'], [today, 'registradas hoy'], [week, 'últimos 7 días']].forEach(function (s) {
      var card = make('div', 'stat');
      card.appendChild(make('b', null, String(s[0])));
      card.appendChild(make('span', null, s[1]));
      stats.appendChild(card);
    });
    wrap.appendChild(stats);

    var holder = make('div', 'tbl');
    var table = make('table');
    var thead = make('thead');
    var hr = make('tr');
    ['Email', 'Rol', 'Alta'].forEach(function (h) { hr.appendChild(make('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = make('tbody');
    users.forEach(function (u) {
      var tr = make('tr');
      tr.appendChild(make('td', null, u.email));
      tr.appendChild(make('td', 'role' + (u.role === 'admin' ? ' adm' : ''), u.role));
      tr.appendChild(make('td', null, fmt(u.createdAt)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    holder.appendChild(table);
    wrap.appendChild(holder);

    var btn = make('button', 'btn btn-ghost btn-sm', 'Actualizar');
    btn.type = 'button';
    btn.addEventListener('click', refresh);
    wrap.appendChild(btn);

    if (box) box.replaceWith(sec);
    else cuenta.parentNode.insertBefore(sec, cuenta.nextSibling);
    box = sec;
  }

  function refresh() {
    if (cuenta.hidden) { remove(); return; }
    get('/me').then(function (me) {
      if (!me || !me.admin) { remove(); return; }
      get('/users').then(function (data) {
        if (!data) { remove(); return; }
        render(me, data);
      });
    });
  }

  new MutationObserver(refresh).observe(cuenta, { attributes: true, attributeFilter: ['hidden'] });
  setInterval(function () { if (box) refresh(); }, 30000);
  refresh();
})();
