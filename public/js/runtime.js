/*
 * Runtime de la app sobre Firebase (Google Cloud).
 *
 * La app original corría como artifact de Claude y pedía sus servicios con
 * window.claude.use('user' | 'db' | 'downloads'). Este archivo provee la misma
 * interfaz (window.RT.use) implementada con Firebase Auth + Cloud Firestore,
 * así la lógica de la app (public/js/app.js) casi no cambia.
 *
 * Orden de arranque:
 *   1. /__/firebase/init.js ya inicializó Firebase con la config del proyecto.
 *   2. En paralelo: se empieza a cargar el catálogo (caché local por versión) y
 *      se espera el estado de la sesión.
 *   3. Sin sesión → pantalla de ingreso (#login), solo con cuenta de Google.
 *      Con sesión de Google → se inyecta app.js, que llama a boot().
 */
(function () {
  'use strict';

  const CATALOG_CACHE_KEY = 'cpo-oferta-v2';
  try { ['cpo-catalog-cache', 'cpo-ofertas-v1'].forEach(k => localStorage.removeItem(k)); } catch (e) { /* formatos viejos */ }
  const auth = firebase.auth();
  const db = firebase.firestore();
  const $ = id => document.getElementById(id);

  /* ---------- autenticación (solo Google) ---------- */

  const isGoogleUser = u => !!u && (u.providerData || []).some(p => p && p.providerId === 'google.com');

  // Primer estado de sesión conocido (usuario de Google o null).
  const firstAuthState = new Promise(resolve => {
    const off = auth.onAuthStateChanged(u => { off(); resolve(isGoogleUser(u) ? u : null); });
  });

  let appStarted = false, lastUid;
  auth.onAuthStateChanged(async u => {
    if (u && !isGoogleUser(u)) { // defensa: cualquier sesión que no sea de Google se cierra
      await auth.signOut();
      showLoginError('Solo se puede entrar con una cuenta de Google.');
      return;
    }
    const uid = u ? u.uid : null;
    if (lastUid === undefined) { lastUid = uid; return; } // evento inicial: lo maneja start()
    if (uid === lastUid) return;
    lastUid = uid;
    if (appStarted) location.reload(); // salió o cambió de cuenta con la app abierta
    else if (u) enterApp();            // acaba de entrar desde la pantalla de ingreso
  });

  const AUTH_ERRORS = {
    'auth/popup-closed-by-user': null,
    'auth/cancelled-popup-request': null,
    'auth/network-request-failed': 'No hay conexión. Revisá tu internet y probá de nuevo.',
    'auth/operation-not-allowed': 'El ingreso con Google todavía no está habilitado. Avisale a quien administra el fixture.',
    'auth/configuration-not-found': 'El ingreso con Google todavía no está habilitado. Avisale a quien administra el fixture.',
    'auth/unauthorized-domain': 'Este dominio no está autorizado para iniciar sesión.',
    'auth/user-disabled': 'Tu cuenta fue deshabilitada. Consultá con quien administra el fixture.',
    'auth/too-many-requests': 'Demasiados intentos. Esperá un momento y probá de nuevo.',
  };

  function showLoginError(msg) {
    const e = $('login-err');
    if (!e) return;
    e.textContent = msg || '';
    e.hidden = !msg;
  }

  async function signIn() {
    const btn = $('login-google');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    showLoginError('');
    if (btn) btn.disabled = true;
    try {
      await auth.signInWithPopup(provider);
    } catch (e) {
      const code = e && e.code;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await auth.signInWithRedirect(provider);
        return;
      }
      const msg = code in AUTH_ERRORS ? AUTH_ERRORS[code] : 'No se pudo iniciar sesión. Probá de nuevo.';
      if (msg) { console.error(e); showLoginError(msg); }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function signOut() {
    if (!confirm('¿Cerrar sesión? Tu avance queda guardado en tu cuenta.')) return;
    await auth.signOut(); // onAuthStateChanged recarga y aparece la pantalla de ingreso
  }

  // Errores que vuelven de un ingreso por redirección (cuando el navegador bloqueó el popup).
  auth.getRedirectResult().catch(e => {
    const msg = e && e.code in AUTH_ERRORS ? AUTH_ERRORS[e.code] : 'No se pudo iniciar sesión. Probá de nuevo.';
    if (msg) showLoginError(msg);
  });

  // Perfil público mínimo (solo el nombre) para mostrar autores de comentarios
  // y la lista de alumnos del panel de administración.
  async function upsertProfile(u) {
    try {
      await db.doc('users/' + u.uid).set({
        name: String(u.displayName || '').slice(0, 80),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) { console.warn('No se pudo guardar el perfil', e); }
  }

  const currentUser = () => (isGoogleUser(auth.currentUser) ? auth.currentUser : null);

  const userCapability = {
    async me() {
      await firstAuthState;
      const u = currentUser();
      if (!u) return null;
      upsertProfile(u);
      return { id: u.uid, name: u.displayName || '' };
    },
    // "canEdit" = es administrador/a: existe admins/{uid} (se crea solo desde la consola o con scripts/set-admin.mjs).
    async canEdit() {
      await firstAuthState;
      const u = currentUser();
      if (!u) return false;
      try { return (await db.doc('admins/' + u.uid).get()).exists; } catch (e) { return false; }
    },
    // Devuelve {uid: {name}} para una lista de uids. Firestore permite hasta 30 ids por consulta "in".
    async profiles(uids) {
      const ids = [...new Set((uids || []).filter(Boolean))];
      const out = {};
      const FP = firebase.firestore.FieldPath.documentId();
      for (let i = 0; i < ids.length; i += 30) {
        const q = await db.collection('users').where(FP, 'in', ids.slice(i, i + 30)).get();
        q.docs.forEach(d => { out[d.id] = { name: (d.data() || {}).name || '' }; });
      }
      return out;
    },
    signIn, signOut,
  };

  window.RT = {
    use(name) {
      if (name === 'user') return Promise.resolve(userCapability);
      if (name === 'db') return Promise.resolve(db);
      return Promise.resolve(null); // 'downloads': la app usa la descarga estándar del navegador
    },
    signIn, signOut,
    ofertasAnteriores: () => ofertasAnteriores(),
    materiasAnteriores: ids => materiasAnteriores(ids),
  };

  // Botones de login/logout (pantalla de ingreso y los que renderiza la app).
  document.addEventListener('click', ev => {
    const t = ev.target.closest && ev.target.closest('#login-google,[data-login],[data-logout]');
    if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    if (t.hasAttribute('data-logout')) signOut(); else signIn();
  }, true);

  /* ---------- oferta de cursos ---------- */

  // La app lee SIEMPRE una sola oferta: la vigente de la colección "ofertas" (el admin la elige
  // en /3816; solo puede haber una). Cada oferta publicada tiene su foto compilada:
  //   ofertas/{id}                  = { vigente, version, anio, semestre, ... }   (consulta chica)
  //   ofertas/{id}/fotos/{version}  = { json: "<{courses, ref, oferta}>" }        (1 lectura por versión)
  // La foto se guarda en localStorage por versión, así una visita sin cambios cuesta 1 lectura.
  const fotoValida = c => !!c && Array.isArray(c.courses) && !!c.ref && !!c.ref.ORI;
  function readCache() {
    try { const c = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null'); return c && c.foto ? c : {}; } catch (e) { return {}; }
  }
  function writeCache(c) {
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(c)); } catch (e) { /* sin espacio o bloqueado: no pasa nada */ }
  }
  const catalogo = f => { vigenteId = f.id; return { courses: f.courses, ref: f.ref, oferta: f.oferta, anio: f.anio, semestre: f.semestre, ofertaId: f.id }; };

  async function loadCatalog() {
    const cache = readCache();
    try {
      const snap = await db.collection('ofertas').where('vigente', '==', true).get();
      // Debería haber una sola; si por error hay más, se usa la más reciente (año, semestre).
      const o = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(o => o.version)
        .sort((a, b) => (b.anio - a.anio) || (b.semestre - a.semestre))[0];
      if (!o) throw new Error('No hay ninguna oferta vigente: activá una en /3816');
      const c = cache.foto;
      if (c && c.id === o.id && c.version === o.version && fotoValida(c)) return catalogo(c);
      const f = await db.doc('ofertas/' + o.id + '/fotos/' + o.version).get();
      if (!f.exists) throw new Error('Falta ofertas/' + o.id + '/fotos/' + o.version);
      const p = JSON.parse(f.data().json);
      const foto = { id: o.id, version: o.version, anio: o.anio, semestre: o.semestre, oferta: p.oferta || o.descripcion || '', courses: p.courses, ref: p.ref };
      if (!fotoValida(foto)) throw new Error('ofertas/' + o.id + ' no tiene el formato esperado');
      writeCache({ foto });
      return catalogo(foto);
    } catch (e) {
      console.error('Error cargando la oferta', e);
      if (fotoValida(cache.foto)) return catalogo(cache.foto); // modo sin conexión
      throw e;
    }
  }

  /* ---------- ofertas anteriores (para cargar materias ya cursadas) ---------- */

  // Las ofertas publicadas ANTES de la vigente (las que el admin subió sin activar, o las que
  // estuvieron vigentes antes). Solo se leen cuando el alumno abre "Materias de años anteriores".
  // Se guarda una versión liviana de cada una (código, nombre, depto, períodos y puntos), por versión.
  const PASADAS_KEY = 'cpo-pasadas-v1';
  let vigenteId = null;
  async function ofertasAnteriores() {
    const s = await db.collection('ofertas').get();
    return s.docs.map(d => Object.assign({ id: d.id }, d.data()))
      .filter(o => o.version && /^\d{4}-[12]$/.test(o.id) && (!vigenteId || o.id < vigenteId))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(o => ({ id: o.id, version: o.version, anio: o.anio, semestre: o.semestre, nombre: o.nombre || '' }));
  }
  async function materiasAnteriores(ofertas) {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(PASADAS_KEY) || '{}') || {}; } catch (e) { cache = {}; }
    const out = await Promise.all(ofertas.map(async o => {
      const c = cache[o.id];
      if (c && c.version === o.version && Array.isArray(c.courses)) return c;
      const f = await db.doc('ofertas/' + o.id + '/fotos/' + o.version).get();
      if (!f.exists) return null;
      const p = JSON.parse(f.data().json);
      return {
        id: o.id, version: o.version, anio: o.anio, semestre: o.semestre,
        courses: (p.courses || []).map(x => ({ dep: x.dep, code: x.code, name: x.name, tema: x.tema || [], periods: (x.periods || []).map(q => ({ id: q.id, pts: q.pts, label: q.label })) })),
      };
    }));
    const ok = out.filter(Boolean);
    try { localStorage.setItem(PASADAS_KEY, JSON.stringify(Object.fromEntries(ok.map(x => [x.id, x])))); } catch (e) { /* sin espacio: se vuelve a leer */ }
    return ok;
  }

  /* ---------- arranque ---------- */

  const catalogReady = loadCatalog(); // se descarga mientras el alumno inicia sesión
  catalogReady.catch(() => {});

  function showLogin() {
    document.body.classList.add('auth-gate');
    $('login').hidden = false;
    const b = $('login-google'); if (b) b.focus();
  }

  async function enterApp() {
    if (appStarted) return;
    appStarted = true;
    document.body.classList.remove('auth-gate');
    $('login').hidden = true;
    try {
      window.CATALOG = await catalogReady;
    } catch (e) {
      const b = $('boot');
      if (b) b.innerHTML = 'No se pudo cargar la oferta de cursos. Revisá tu conexión y <a href="">volvé a intentar</a>.';
      return;
    }
    const s = document.createElement('script');
    s.src = '/js/app.js';
    document.body.appendChild(s);
  }

  firstAuthState.then(u => { if (u) enterApp(); else showLogin(); });
})();
