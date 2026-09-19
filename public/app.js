// Area de cliente: se activa cuando la portada avisa (evento pescata:user) de
// que hay sesion. Panel lateral con Catalogo, Perfil, Historial y Soporte; y,
// solo si el servidor dice que es admin, sus vistas de gestion. El rol lo
// decide siempre el servidor: aqui solo se decide que mostrar.
(function () {
  'use strict';
  var app = document.getElementById('app');
  if (!app || !window.fetch) return;

  var html = document.documentElement;
  var wide = window.matchMedia ? window.matchMedia('(min-width:900px)') : { matches: true };
  var user = null;
  var view = 'catalogo';
  var pendingUserId = null;
  var uid = 0;

  var SERVICE_STATUS = ['pendiente', 'activo', 'suspendido', 'caducado', 'cancelado'];
  var TICKET_STATUS = ['abierto', 'en_curso', 'cerrado'];

  var I = {
    es: {
      who_admin: 'Administrador', who_user: 'Cliente',
      loading: 'Cargando…',
      error: 'No se ha podido cargar. Vuelve a probar en un momento.',
      na: 'Esta sección aún no está disponible.',
      yes: 'Sí', no: 'No',
      f_email: 'Email', f_since: 'Miembro desde', f_verified: 'Email verificado', f_type: 'Tipo de cuenta',
      h_empty: 'Todavía no tienes ninguna contratación.',
      h_empty_p: 'Cuando contrates un servicio aparecerá aquí con su estado y los días que le quedan.',
      h_catalog: 'Ver el catálogo',
      started: 'Inicio', expires: 'Caduca', left: 'Días restantes', expired: 'Caducado', none: '—',
      st_pendiente: 'Pendiente', st_activo: 'Activo', st_suspendido: 'Suspendido', st_caducado: 'Caducado', st_cancelado: 'Cancelado',
      tk_abierto: 'Abierto', tk_en_curso: 'En curso', tk_cerrado: 'Cerrado',
      tk_none: 'Todavía no has abierto ningún ticket.',
      tk_reply: 'Respuesta', tk_wait: 'Pendiente de respuesta',
      tk_sent: 'Ticket enviado. Te responderé aquí.', tk_invalid: 'Escribe un asunto y un mensaje.'
    },
    en: {
      who_admin: 'Administrator', who_user: 'Customer',
      loading: 'Loading…',
      error: 'Could not load. Please try again in a moment.',
      na: 'This section is not available yet.',
      yes: 'Yes', no: 'No',
      f_email: 'Email', f_since: 'Member since', f_verified: 'Email verified', f_type: 'Account type',
      h_empty: 'You have not hired anything yet.',
      h_empty_p: 'Once you hire a service it will show up here with its status and remaining days.',
      h_catalog: 'See the catalog',
      started: 'Start', expires: 'Expires', left: 'Days left', expired: 'Expired', none: '—',
      st_pendiente: 'Pending', st_activo: 'Active', st_suspendido: 'Suspended', st_caducado: 'Expired', st_cancelado: 'Cancelled',
      tk_abierto: 'Open', tk_en_curso: 'In progress', tk_cerrado: 'Closed',
      tk_none: 'You have not opened any ticket yet.',
      tk_reply: 'Reply', tk_wait: 'Waiting for a reply',
      tk_sent: 'Ticket sent. I will reply here.', tk_invalid: 'Write a subject and a message.'
    }
  };

  function lang() { return html.getAttribute('data-lang') === 'en' ? 'en' : 'es'; }
  function t(k) { return I[lang()][k] || k; }
  function $(id) { return document.getElementById(id); }
  function isAdmin() { return !!user && user.role === 'admin'; }

  // Todo el texto va con textContent: emails, asuntos y mensajes los escriben usuarios.
  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (kids || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function fmtDate(iso, withTime) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return t('none');
    return d.toLocaleString(lang() === 'en' ? 'en-GB' : 'es-ES', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
  }
  function label(prefix, key) { return I[lang()][prefix + key] || key; }
  function badge(status, prefix) { return h('span', { class: 'badge b-' + status, text: label(prefix, status) }); }
  function say(el, text, isErr) { el.textContent = text; el.className = 'msg' + (isErr ? ' err' : ''); }
  function loading(box) { clear(box); box.appendChild(h('p', { class: 'muted', text: t('loading') })); }
  function fail(box) {
    return function (e) {
      clear(box);
      box.appendChild(h('p', { class: 'msg err', text: e && e.code === 'NOT_CONFIGURED' ? t('na') : t('error') }));
    };
  }
  function field(text, control) {
    var id = 'f' + (++uid);
    control.id = id;
    return h('div', { class: 'field' }, [h('label', { for: id, text: text }), control]);
  }

  function call(method, path, body) {
    var init = { method: method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch(path, init).then(
      function (r) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return null; }).then(function (d) {
          if (!r.ok) {
            var e = new Error('api');
            e.code = (d && d.code) || 'SERVER_ERROR';
            e.status = r.status;
            throw e;
          }
          return d;
        });
      },
      function () { var e = new Error('net'); e.code = 'NETWORK'; throw e; }
    );
  }

  /* ---------- cliente: perfil ---------- */
  function renderPerfil() {
    var box = $('perfil-body');
    clear(box);
    if (!user) return;
    var rows = [
      [t('f_email'), user.email],
      [t('f_since'), fmtDate(user.createdAt)],
      [t('f_verified'), user.emailVerified ? t('yes') : t('no')],
      [t('f_type'), isAdmin() ? t('who_admin') : t('who_user')]
    ];
    var dl = h('dl');
    rows.forEach(function (r) { dl.appendChild(h('div', null, [h('dt', { text: r[0] }), h('dd', { text: r[1] })])); });
    box.appendChild(h('div', { class: 'card' }, [dl]));
  }

  /* ---------- cliente: historial ---------- */
  function serviceCard(s) {
    var rows = [
      [t('started'), s.startsAt ? fmtDate(s.startsAt) : t('none')],
      [t('expires'), s.expiresAt ? fmtDate(s.expiresAt) : t('none')]
    ];
    if (s.expiresAt && s.status === 'activo') {
      var d = Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / 86400000);
      if (!isNaN(d)) rows.push([t('left'), d > 0 ? String(d) : t('expired')]);
    }
    var dl = h('dl');
    rows.forEach(function (r) { dl.appendChild(h('div', null, [h('dt', { text: r[0] }), h('dd', { text: r[1] })])); });
    return h('div', { class: 'card' }, [h('div', { class: 'card-head' }, [h('h3', { text: s.product }), badge(s.status, 'st_')]), dl]);
  }
  function loadHistorial() {
    var box = $('historial-body');
    loading(box);
    call('GET', '/api/services/mine').then(function (d) {
      clear(box);
      var list = (d && d.services) || [];
      if (!list.length) {
        box.appendChild(h('div', { class: 'empty-state' }, [
          h('strong', { text: t('h_empty') }),
          h('p', { text: t('h_empty_p') }),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t('h_catalog'), onclick: function () { show('catalogo'); } })
        ]));
        return;
      }
      list.forEach(function (s) { box.appendChild(serviceCard(s)); });
    }).catch(fail(box));
  }

  /* ---------- cliente: soporte ---------- */
  function ticketCard(tk, adminView) {
    var kids = [
      h('div', { class: 'card-head' }, [h('h3', { text: tk.subject }), badge(tk.status, 'tk_')]),
      h('p', { class: 'muted', text: (adminView && tk.userEmail ? tk.userEmail + ' · ' : '') + fmtDate(tk.createdAt, true) }),
      h('p', { class: 'pre', text: tk.message })
    ];
    if (!adminView) {
      if (tk.adminReply) kids.push(h('div', { class: 'reply' }, [h('b', { text: t('tk_reply') }), h('p', { class: 'pre', text: tk.adminReply })]));
      else if (tk.status !== 'cerrado') kids.push(h('p', { class: 'muted', text: t('tk_wait') }));
    }
    return h('div', { class: 'card' }, kids);
  }
  function loadSoporte() {
    var box = $('soporte-list');
    loading(box);
    call('GET', '/api/support/tickets').then(function (d) {
      clear(box);
      var list = (d && d.tickets) || [];
      if (!list.length) { box.appendChild(h('p', { class: 'muted', text: t('tk_none') })); return; }
      list.forEach(function (tk) { box.appendChild(ticketCard(tk, false)); });
    }).catch(fail(box));
  }
  $('tk-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var subject = $('tk-subject').value.trim();
    var message = $('tk-message').value.trim();
    var msg = $('tk-msg');
    if (!subject || !message) return say(msg, t('tk_invalid'), true);
    var btn = $('tk-send');
    btn.disabled = true;
    call('POST', '/api/support/tickets', { subject: subject, message: message }).then(function () {
      $('tk-subject').value = '';
      $('tk-message').value = '';
      say(msg, t('tk_sent'), false);
      loadSoporte();
    }).catch(function (err) {
      say(msg, err && err.code === 'INVALID_TICKET' ? t('tk_invalid') : t('error'), true);
    }).then(function () { btn.disabled = false; });
  });

  /* ---------- admin (solo espanol) ---------- */
  function table(headers, rows) {
    var head = h('thead', null, [h('tr', null, headers.map(function (x) { return h('th', { text: x }); }))]);
    return h('div', { class: 'tbl' }, [h('table', null, [head, h('tbody', null, rows)])]);
  }

  function loadAdmClientes() {
    var box = $('adm-clientes-body');
    loading(box);
    call('GET', '/api/admin/users').then(function (d) {
      clear(box);
      var users = (d && d.users) || [];
      var startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      var weekAgo = Date.now() - 7 * 86400000;
      var today = 0, week = 0, unverified = 0;
      users.forEach(function (u) {
        var ts = new Date(u.createdAt).getTime();
        if (ts >= startToday.getTime()) today++;
        if (ts >= weekAgo) week++;
        if (!u.emailVerified) unverified++;
      });
      var stats = h('div', { class: 'stats' });
      [[users.length, 'cuentas en total'], [week, 'últimos 7 días (' + today + ' hoy)'], [unverified, 'pendientes de aprobar']].forEach(function (s) {
        stats.appendChild(h('div', { class: 'stat' }, [h('b', { text: String(s[0]) }), h('span', { text: s[1] })]));
      });
      box.appendChild(stats);

      var rows = users.map(function (u) {
        var actions = h('div', { class: 'actions' });
        if (!u.emailVerified) {
          var vb = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Aprobar cuenta' });
          vb.addEventListener('click', function () {
            vb.disabled = true;
            call('PATCH', '/api/admin/users/' + u.id + '/verify').then(loadAdmClientes).catch(function () {
              vb.disabled = false;
              vb.textContent = 'Error, reintenta';
            });
          });
          actions.appendChild(vb);
        }
        actions.appendChild(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Nuevo contrato', onclick: function () { pendingUserId = u.id; show('adm-contratos'); } }));
        return h('tr', null, [
          h('td', { text: u.email }),
          h('td', { text: u.role }),
          h('td', { text: u.emailVerified ? 'Sí' : 'No' }),
          h('td', { text: fmtDate(u.createdAt, true) }),
          h('td', null, [actions])
        ]);
      });
      box.appendChild(table(['Email', 'Rol', 'Aprobada', 'Alta', ''], rows));
    }).catch(fail(box));
  }

  function contractForm(s, users, done) {
    var isNew = !s;
    var f = h('form', { class: 'card cform', novalidate: true });
    var msg = h('p', { class: 'msg', role: 'status' });
    var userSel = null, prodInp = null;

    if (isNew) {
      userSel = h('select');
      users.forEach(function (u) { userSel.appendChild(h('option', { value: String(u.id), text: u.email })); });
      if (pendingUserId) userSel.value = String(pendingUserId);
      f.appendChild(field('Cliente', userSel));
      prodInp = h('input', { type: 'text', maxlength: '200', list: 'dl-products', autocomplete: 'off' });
      f.appendChild(field('Producto', prodInp));
    } else {
      f.appendChild(h('div', { class: 'card-head' }, [h('h3', { text: s.product }), badge(s.status, 'st_')]));
      f.appendChild(h('p', { class: 'muted', text: s.userEmail || '' }));
    }

    var stSel = h('select');
    SERVICE_STATUS.forEach(function (x) { stSel.appendChild(h('option', { value: x, text: label('st_', x) })); });
    stSel.value = s ? s.status : 'pendiente';
    var d1 = h('input', { type: 'date' });
    d1.value = s && s.startsAt ? String(s.startsAt).slice(0, 10) : '';
    var d2 = h('input', { type: 'date' });
    d2.value = s && s.expiresAt ? String(s.expiresAt).slice(0, 10) : '';
    var cfg = h('textarea', { rows: '4', spellcheck: 'false', class: 'mono-ta' });
    cfg.value = JSON.stringify(s ? (s.config || {}) : {}, null, 2);
    var notes = h('textarea', { rows: '3' });
    notes.value = s && s.notes ? s.notes : '';

    f.appendChild(field('Estado', stSel));
    f.appendChild(h('div', { class: 'row2' }, [field('Inicio', d1), field('Caduca', d2)]));
    f.appendChild(field('Configuración del servicio (JSON: IP, guild de Discord, plan Nitrado…)', cfg));
    f.appendChild(field('Notas internas (el cliente no las ve)', notes));
    f.appendChild(msg);
    var btn = h('button', { class: 'btn btn-primary btn-sm', type: 'submit', text: isNew ? 'Crear contrato' : 'Guardar cambios' });
    f.appendChild(btn);

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var cfgObj;
      try {
        cfgObj = cfg.value.trim() ? JSON.parse(cfg.value) : {};
        if (cfgObj === null || typeof cfgObj !== 'object' || Array.isArray(cfgObj)) throw new Error('x');
      } catch (x) {
        return say(msg, 'La configuración debe ser un JSON válido (un objeto entre llaves).', true);
      }
      var body = { status: stSel.value, config: cfgObj, notes: notes.value, startsAt: d1.value || null, expiresAt: d2.value || null };
      var req;
      if (isNew) {
        if (!userSel.value) return say(msg, 'No hay clientes todavía.', true);
        if (!prodInp.value.trim()) return say(msg, 'Escribe el producto.', true);
        body.userId = Number(userSel.value);
        body.product = prodInp.value.trim();
        req = call('POST', '/api/admin/services', body);
      } else {
        req = call('PATCH', '/api/admin/services/' + s.id, body);
      }
      btn.disabled = true;
      req.then(function () {
        if (isNew) { pendingUserId = null; done(); }
        else say(msg, 'Guardado.', false);
      }).catch(function () {
        say(msg, 'No se ha podido guardar. Revisa los datos.', true);
      }).then(function () { btn.disabled = false; });
    });
    return f;
  }

  function loadAdmContratos() {
    var box = $('adm-contratos-body');
    loading(box);
    Promise.all([call('GET', '/api/admin/users'), call('GET', '/api/admin/services')]).then(function (res) {
      clear(box);
      var users = (res[0] && res[0].users) || [];
      var list = (res[1] && res[1].services) || [];
      var details = h('details', { class: 'new-contract' }, [h('summary', { text: 'Nuevo contrato' }), contractForm(null, users, loadAdmContratos)]);
      if (pendingUserId) details.setAttribute('open', '');
      box.appendChild(details);
      if (!list.length) box.appendChild(h('p', { class: 'muted', text: 'Todavía no hay contratos.' }));
      list.forEach(function (s) { box.appendChild(contractForm(s, users, loadAdmContratos)); });
    }).catch(fail(box));
  }

  function adminTicket(tk) {
    var st = h('select');
    TICKET_STATUS.forEach(function (x) { st.appendChild(h('option', { value: x, text: label('tk_', x) })); });
    st.value = tk.status;
    var rep = h('textarea', { rows: '3' });
    rep.value = tk.adminReply || '';
    var msg = h('p', { class: 'msg', role: 'status' });
    var btn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Guardar respuesta' });
    btn.addEventListener('click', function () {
      btn.disabled = true;
      call('PATCH', '/api/admin/tickets/' + tk.id, { status: st.value, adminReply: rep.value }).then(function () {
        say(msg, 'Guardado.', false);
      }).catch(function () {
        say(msg, 'No se ha podido guardar.', true);
      }).then(function () { btn.disabled = false; });
    });
    var card = ticketCard(tk, true);
    card.appendChild(h('div', { class: 'cform', style: 'margin-top:16px' }, [field('Estado', st), field('Respuesta al cliente', rep), msg, btn]));
    return card;
  }
  function loadAdmTickets() {
    var box = $('adm-tickets-body');
    loading(box);
    call('GET', '/api/admin/tickets').then(function (d) {
      clear(box);
      var list = (d && d.tickets) || [];
      if (!list.length) { box.appendChild(h('p', { class: 'muted', text: 'No hay tickets.' })); return; }
      list.forEach(function (tk) { box.appendChild(adminTicket(tk)); });
    }).catch(fail(box));
  }

  /* ---------- navegacion y panel lateral ---------- */
  var loaders = {
    catalogo: null,
    perfil: renderPerfil,
    historial: loadHistorial,
    soporte: loadSoporte,
    'adm-clientes': loadAdmClientes,
    'adm-contratos': loadAdmContratos,
    'adm-tickets': loadAdmTickets
  };

  function setDrawer(open) {
    app.classList.toggle('drawer-open', !!open);
    $('app-menu').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function show(name) {
    if (name.indexOf('adm-') === 0 && !isAdmin()) name = 'catalogo';
    view = name;
    app.querySelectorAll('.app-view').forEach(function (v) { v.hidden = v.id !== 'view-' + name; });
    app.querySelectorAll('.nav-btn').forEach(function (b) {
      if (b.getAttribute('data-view') === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (loaders[name]) loaders[name]();
    if (!wide.matches) setDrawer(false);
    window.scrollTo(0, 0);
  }

  app.querySelectorAll('.nav-btn').forEach(function (b) {
    b.addEventListener('click', function () { pendingUserId = null; show(b.getAttribute('data-view')); });
  });
  $('app-menu').addEventListener('click', function () { setDrawer(!app.classList.contains('drawer-open')); });
  $('app-scrim').addEventListener('click', function () { setDrawer(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !wide.matches) setDrawer(false);
  });
  if (wide.addEventListener) wide.addEventListener('change', function () { setDrawer(wide.matches); });

  $('app-logout').addEventListener('click', function () {
    call('POST', '/api/auth/logout').catch(function () {}).then(function () {
      document.dispatchEvent(new CustomEvent('pescata:logout'));
    });
  });

  document.addEventListener('pescata:lang', function () { if (user) show(view); });

  function handleUser(u) {
    user = u || null;
    app.hidden = !user;
    if (!user) return;
    $('app-who').textContent = user.email;
    $('nav-admin').hidden = !isAdmin();
    setDrawer(wide.matches);
    show('catalogo');
  }
  document.addEventListener('pescata:user', function (e) { handleUser(e.detail && e.detail.user); });
  // La portada puede haber terminado de comprobar la sesion antes de cargar este script.
  if (window.pescataUser) handleUser(window.pescataUser);
})();
