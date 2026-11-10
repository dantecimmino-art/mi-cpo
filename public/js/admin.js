/*
 * Administración: "Subir oferta".
 *
 * Hace en el navegador del admin el mismo proceso que los scripts de terminal
 * (mismo código, public/js/oferta/):
 *   1. lee las tablas del PDF (pdf.js)
 *   2. lee el reglamento de Firestore (orientaciones, materiasReglamento, períodos…)
 *   3. interpreta la oferta y la controla contra el reglamento → informe
 *   4. guarda ofertas/{id}, materias, profesores y cursos; borra los cursos que ya no están;
 *      compila la foto y, si se pide, la deja vigente.
 * Además permite activar cualquier oferta publicada. Solo hay UNA vigente: es la que lee la app.
 * Las reglas de Firestore solo dejan escribir esto a quien está en admins/{uid}.
 */
import * as pdfjsLib from '/vendor/pdfjs-4.10.38/pdf.min.js';
import { extraerTablas } from '/js/oferta/tablas-pdf.js';
import { prepararOferta, compilarPublicacion, referenciaDesdeColecciones } from '/js/oferta/preparar.js';
import { nombreOferta } from '/js/oferta/modelo.js';
import { initAlumnos, cargarAlumnos, cargarAvisos } from '/js/admin-alumnos.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs-4.10.38/pdf.worker.min.js';

const auth = firebase.auth();
const db = firebase.firestore();
const FV = firebase.firestore.FieldValue;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const fmt = n => Number(n || 0).toLocaleString('es-AR');
const fecha = ts => (ts && ts.toDate ? ts.toDate().toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

let USER = null;
let trabajando = false;

/* ---------- vistas y sesión ---------- */

function vista(id) {
  for (const v of ['v-login', 'v-noadmin', 'v-admin']) $(v).hidden = v !== id;
  $('boot').hidden = true;
  $('who').hidden = id === 'v-login';
}

const esGoogle = u => !!u && (u.providerData || []).some(p => p && p.providerId === 'google.com');

auth.onAuthStateChanged(async u => {
  if (u && !esGoogle(u)) { await auth.signOut(); return; }
  USER = u;
  if (!u) { vista('v-login'); return; }
  $('who-name').textContent = u.displayName || u.email || '';
  let admin = false;
  try { admin = (await db.doc('admins/' + u.uid).get()).exists; } catch (e) { admin = false; }
  if (!admin) { $('noadmin-email').textContent = u.email || u.displayName || ''; vista('v-noadmin'); return; }
  vista('v-admin');
  cargarOfertas();
  pestana((location.hash || '').slice(1));
});

async function entrar() {
  const p = new firebase.auth.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  $('login-err').hidden = true;
  try { await auth.signInWithPopup(p); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return auth.signInWithRedirect(p);
    if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
    $('login-err').textContent = 'No se pudo iniciar sesión. Probá de nuevo.';
    $('login-err').hidden = false;
  }
}
$('login').addEventListener('click', entrar);
const salir = () => { if (!trabajando || confirm('Se está publicando la oferta. ¿Salir igual?')) auth.signOut(); };
$('logout').addEventListener('click', salir);
$('logout2').addEventListener('click', salir);
window.addEventListener('beforeunload', e => { if (trabajando) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- pestañas: Ofertas · Alumnos · Avisos y fechas ---------- */

let toastT;
const toast = m => { const e = $('toast'); e.textContent = m; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { e.hidden = true; }, 3500); };
initAlumnos({ db, toast });
const cargadas = {};
function pestana(t) {
  if (!['ofertas', 'alumnos', 'avisos'].includes(t)) t = 'ofertas';
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  for (const k of ['ofertas', 'alumnos', 'avisos']) $('tab-' + k).hidden = k !== t;
  if (location.hash.slice(1) !== t) history.replaceState(null, '', t === 'ofertas' ? location.pathname : '#' + t);
  if (!cargadas[t]) { cargadas[t] = true; if (t === 'alumnos') cargarAlumnos(); if (t === 'avisos') cargarAvisos(); }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) pestana(b.dataset.tab); });

/* ---------- ofertas publicadas ---------- */

let OFERTAS = [];
async function cargarOfertas() {
  const s = await db.collection('ofertas').get();
  OFERTAS = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.id.localeCompare(a.id));
  const vig = OFERTAS.filter(o => o.vigente && o.version);
  // La app usa una sola: si por error hay más de una vigente, toma la más reciente (igual que runtime.js).
  const usada = [...vig].sort((a, b) => (b.anio - a.anio) || (b.semestre - a.semestre))[0];
  $('ofs-n').textContent = usada ? 'Vigente: ' + usada.id : 'Ninguna vigente';
  $('ofs-n').className = 'chip ' + (vig.length === 1 ? 'ok' : 'warn');
  const aviso = !vig.length ? '<li class="empty"><b>No hay ninguna oferta vigente:</b> la app no puede cargar. Activá una.</li>'
    : vig.length > 1 ? `<li class="empty"><b>Hay ${vig.length} ofertas marcadas como vigentes.</b> La app muestra solo ${esc(usada.id)}. Activá la que corresponda para dejar una sola.</li>` : '';
  $('ofs').innerHTML = aviso + (OFERTAS.length ? OFERTAS.map(o => {
    const est = o === usada ? '<span class="chip ok">Vigente · la ve la app</span>'
      : o.vigente ? '<span class="chip warn">Marcada vigente, no se usa</span>'
      : `<span class="chip">${esc({ importada: 'Importada, sin publicar', publicada: 'Publicada, no vigente', reemplazada: 'No vigente' + (o.reemplazadaPor ? ' · la reemplazó ' + o.reemplazadaPor : ''), retirada: 'Retirada' }[o.estado] || o.estado || '')}</span>`;
    const accion = o.version && (o !== usada || vig.length > 1)
      ? `<button class="btn" type="button" data-activar="${esc(o.id)}">${o === usada ? 'Dejar solo esta' : 'Activar'}</button>` : '';
    return `<li><div><b>${esc(o.nombre || nombreOferta(o.id))}</b> <span class="mono meta">${esc(o.id)}</span>
      <div class="meta">${fmt(o.materias)} materias · ${fmt(o.cursos)} comisiones${o.publicadaEn ? ' · publicada el ' + fecha(o.publicadaEn) : ''}${o.fuente ? ' · ' + esc(o.fuente) : ''}</div></div><div class="ofs-a">${est}${accion}</div></li>`;
  }).join('') : '<li class="empty">Todavía no hay ofertas cargadas.</li>');
}

// Deja vigente una oferta y saca "vigente" a todas las demás, en un solo lote (nunca quedan dos).
function marcarVigente(b, id, otras) {
  b.update(db.doc('ofertas/' + id), { vigente: true, estado: 'publicada', activadaEn: FV.serverTimestamp(), activadaPor: USER.email || USER.uid });
  const retiradas = [];
  for (const d of otras.docs) if (d.id !== id) { b.update(d.ref, { vigente: false, estado: 'reemplazada', reemplazadaPor: id }); retiradas.push(d.id); }
  return retiradas;
}

async function activar(id) {
  const o = OFERTAS.find(x => x.id === id);
  if (!o || !o.version || trabajando) return;
  if (!confirm(`¿Activar la oferta ${id} (${o.nombre || nombreOferta(id)})?\n\nVa a ser la única vigente: la app deja de mostrar cualquier otra oferta y los alumnos ven esta al recargar.`)) return;
  trabajando = true;
  document.querySelectorAll('[data-activar]').forEach(b => { b.disabled = true; });
  try {
    const foto = await db.doc(`ofertas/${id}/fotos/${o.version}`).get();
    if (!foto.exists) throw new Error(`a ${id} le falta la oferta compilada (${o.version}). Volvé a subir su PDF.`);
    const otras = await db.collection('ofertas').where('vigente', '==', true).get();
    const b = db.batch();
    marcarVigente(b, id, otras);
    await b.commit();
  } catch (e) {
    console.error(e);
    alert('No se pudo activar: ' + (e && e.code === 'permission-denied' ? 'tu cuenta no tiene permiso.' : (e.message || e)));
  } finally {
    trabajando = false;
    cargarOfertas();
  }
}

/* ---------- pasos ---------- */

function paso(k, st, detalle) {
  const li = document.querySelector(`#steps li[data-k="${k}"]`);
  li.dataset.st = st;
  li.querySelector('.dot').textContent = st === 'ok' ? '✓' : st === 'bad' ? '!' : li.querySelector('.dot').dataset.n || li.querySelector('.dot').textContent;
  if (detalle !== undefined) li.querySelector('[data-d]').textContent = detalle;
}
document.querySelectorAll('#steps .dot').forEach(d => { d.dataset.n = d.textContent; });

function reiniciar() {
  $('paso-archivo').hidden = false;
  $('steps').hidden = true;
  $('resumen').hidden = true; $('resumen').innerHTML = '';
  $('progreso').hidden = true;
  $('final').hidden = true; $('final').innerHTML = '';
  document.querySelectorAll('#steps li').forEach(li => { li.dataset.st = 'wait'; li.querySelector('.dot').textContent = li.querySelector('.dot').dataset.n; li.querySelector('[data-d]').textContent = ''; });
  $('file').value = '';
}

function fallo(k, msg) {
  paso(k, 'bad');
  $('final').hidden = false;
  $('final').innerHTML = `<div class="box bad"><b>No se pudo completar.</b> ${esc(msg)}</div><div class="actions"><button class="btn" type="button" data-reiniciar>Elegir otro archivo</button></div>`;
}

/* ---------- 1-3: leer, interpretar, validar ---------- */

const leerColeccion = async nombre => Object.fromEntries((await db.collection(nombre).get()).docs.map(d => [d.id, d.data()]));

async function leerReglamento() {
  const [departamentos, periodos, obligatorias, orientaciones, materiasReglamento, general] = await Promise.all([
    leerColeccion('departamentos'), leerColeccion('periodos'), leerColeccion('obligatorias'),
    leerColeccion('orientaciones'), leerColeccion('materiasReglamento'), db.doc('config/reglamento').get(),
  ]);
  if (!general.exists) throw new Error('Falta config/reglamento en la base. Corré una vez scripts/importar.mjs desde la terminal.');
  return referenciaDesdeColecciones({ departamentos, periodos, obligatorias, orientaciones, materiasReglamento, general: general.data() });
}

let PREP = null, REF = null, ARCHIVO = '';

async function procesar(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { alert('El archivo tiene que ser un PDF.'); return; }
  ARCHIVO = file.name;
  $('paso-archivo').hidden = true;
  $('steps').hidden = false;

  let raw;
  paso('pdf', 'run', file.name);
  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    raw = await extraerTablas(pdf, pdfjsLib.OPS, (n, t) => paso('pdf', 'run', `${file.name} · página ${n} de ${t}`));
    paso('pdf', 'ok', `${file.name} · ${pdf.numPages} páginas`);
  } catch (e) { console.error(e); return fallo('pdf', 'El archivo no se pudo leer como PDF.'); }

  paso('ref', 'run');
  try { REF = await leerReglamento(); paso('ref', 'ok', `${REF.orientaciones.length} orientaciones · ${REF.materiasReglamento.length} materias exigidas`); }
  catch (e) { console.error(e); return fallo('ref', e.message || 'No se pudo leer el reglamento.'); }

  paso('val', 'run');
  PREP = prepararOferta(raw, REF, { fuente: file.name });
  paso('val', PREP.errores.length ? 'bad' : 'ok', PREP.errores.length ? `${PREP.errores.length} error(es)` : 'cumple el reglamento');
  mostrarResumen();
}

function mostrarResumen() {
  const p = PREP, id = p.ofertaId, valido = /^\d{4}-[12]$/.test(String(id)) && p.col;
  const porPer = {};
  for (const c of p.cruda.courses) for (const per of c.periods) porPer[per.label] = (porPer[per.label] || 0) + per.coms.length;
  const existe = OFERTAS.find(o => o.id === id);
  const reemplaza = OFERTAS.filter(o => o.vigente && o.id !== id);

  let h = '';
  if (valido) {
    h += `<div class="card-h" style="margin-top:18px"><h2>${esc(nombreOferta(id))} <span class="mono chip">${esc(id)}</span></h2></div>`;
    if (p.titulo) h += `<div class="prog">Título del PDF: ${esc(p.titulo)}</div>`;
    h += `<div class="stats">
      <div class="stat"><b>${fmt(p.cruda.courses.length)}</b><span>materias</span></div>
      <div class="stat"><b>${fmt(p.filas)}</b><span>comisiones</span></div>
      <div class="stat"><b>${fmt(Object.keys(p.col.profesores).length)}</b><span>docentes</span></div>
      <div class="stat"><b>${fmt(Object.keys(porPer).length)}</b><span>períodos</span></div></div>`;
    h += `<div class="pers">${Object.entries(porPer).map(([k, v]) => `<span class="chip">${esc(k)} · ${fmt(v)}</span>`).join('')}</div>`;
  }

  if (p.errores.length) {
    h += `<div class="box bad"><b>La oferta no cumple el reglamento (${p.errores.length}).</b> Revisá el PDF; si el plan de estudios cambió, hay que actualizar el reglamento antes de publicar.<ul>${p.errores.map(x => `<li>${esc(x.msg)}${x.pagina ? ` <span class="mono">(pág. ${x.pagina})</span>` : ''}</li>`).join('')}</ul></div>`;
  } else {
    h += `<div class="box ok"><b>Cumple el reglamento.</b> Están las ${REF.materiasReglamento.length} materias que exige el plan (o al menos una de cada alternativa), con sus puntos, y hay cursos de todos los departamentos obligatorios.</div>`;
  }
  if (p.avisos.length) h += `<details class="av"><summary>${p.avisos.length} aviso(s) para revisar</summary><ul>${p.avisos.map(x => `<li>${esc(x.msg)}</li>`).join('')}</ul></details>`;

  if (valido) {
    const que = [];
    if (existe) que.push(`Ya hay una oferta <b>${esc(id)}</b>${existe.publicadaEn ? ' publicada el ' + fecha(existe.publicadaEn) : ''}: se va a <b>reemplazar</b> por esta.`);
    que.push('Sus materias aprobadas se conservan aunque ya no estén en la oferta.');
    const yaVigente = existe && existe.vigente;
    h += `<div class="box info"><ul style="margin:0">${que.map(x => `<li>${x}</li>`).join('')}</ul>
      <label class="force" style="margin-top:10px"><input type="checkbox" id="activar" ${yaVigente ? 'checked disabled' : !reemplaza.length ? 'checked' : ''}>
        Dejarla vigente al publicar (la app muestra una sola oferta${reemplaza.length ? `: deja de mostrar <b>${esc(reemplaza.map(o => o.id).join(', '))}</b>` : ''})</label>
      <div class="meta" style="margin-top:4px">Si no la activás ahora, queda publicada y la podés activar después desde "Ofertas publicadas".</div></div>`;
    if (p.errores.length) h += `<label class="force"><input type="checkbox" id="forzar"> Publicar igual, aunque no cumpla el reglamento</label>`;
  }

  h += `<div class="actions">${valido ? `<button class="btn primary big" type="button" id="publicar" ${p.errores.length ? 'disabled' : ''}>Publicar oferta ${esc(id)}</button>` : ''}<button class="btn big" type="button" data-reiniciar>Cancelar</button></div>`;
  $('resumen').innerHTML = h;
  $('resumen').hidden = false;
  const f = $('forzar');
  if (f) f.addEventListener('change', () => { $('publicar').disabled = !f.checked; });
  if ($('publicar')) $('publicar').addEventListener('click', publicar);
}

/* ---------- 4: guardar y publicar ---------- */

const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

function progreso(hechas, total, texto) {
  const pct = total ? Math.round(100 * hechas / total) : 0;
  $('bar').firstElementChild.style.width = pct + '%';
  $('bar').setAttribute('aria-valuenow', String(pct));
  $('prog-txt').textContent = texto + (total ? ` · ${fmt(hechas)} de ${fmt(total)}` : '');
}

// Escribe en lotes de hasta 450 operaciones (límite de Firestore: 500 por lote).
async function escribir(ops, etiqueta, acum) {
  for (let i = 0; i < ops.length; i += 450) {
    const b = db.batch();
    for (const op of ops.slice(i, i + 450)) op(b);
    await b.commit();
    acum.hechas += Math.min(450, ops.length - i);
    progreso(acum.hechas, acum.total, etiqueta);
  }
}

async function publicar() {
  if (trabajando || !PREP || !PREP.col) return;
  const p = PREP, id = p.ofertaId, col = p.col;
  const activa = $('activar').checked;
  if (!confirm(activa ? `¿Publicar la oferta ${id} y dejarla vigente? Va a ser la única que muestra la app; los alumnos la ven al recargar.`
    : `¿Publicar la oferta ${id} sin activarla? La app sigue mostrando la oferta vigente actual.`)) return;
  trabajando = true;
  $('publicar').disabled = true;
  $('resumen').querySelectorAll('button,input').forEach(b => { b.disabled = true; });
  $('progreso').hidden = false;
  paso('pub', 'run');

  const ahora = FV.serverTimestamp();
  const ref = path => db.doc(path);
  try {
    // Lo que hay hoy de esta oferta (para borrar lo que ya no está).
    progreso(0, 0, 'Revisando lo que ya está cargado');
    const [viejosCursos, viejasMaterias, viejosProfes] = await Promise.all([
      db.collection('cursos').where('ofertaId', '==', id).get(),
      db.collection('materias').where('ofertas', 'array-contains', id).get(),
      db.collection('profesores').where('ofertas', 'array-contains', id).get(),
    ]);

    const ops = [];
    ops.push(b => b.set(ref('ofertas/' + id), {
      ...col.ofertas[id], fuente: ARCHIVO, avisos: p.informe.map(x => x.msg).slice(0, 50),
      importadaEn: ahora, importadaPor: USER.email || USER.uid,
    }, { merge: true }));
    for (const [mid, { ofertas, ...d }] of Object.entries(col.materias)) {
      ops.push(b => b.set(ref('materias/' + mid), { ...d, ofertas: FV.arrayUnion(id), actualizadoEn: ahora }, { merge: true }));
    }
    for (const [pid, { ofertas, materias, cursos, ...d }] of Object.entries(col.profesores)) {
      ops.push(b => b.set(ref('profesores/' + pid), {
        ...d, ofertas: FV.arrayUnion(id), materias: FV.arrayUnion(...materias),
        cursosPorOferta: { [id]: cursos }, actualizadoEn: ahora,
      }, { merge: true }));
    }
    for (const [cid, d] of Object.entries(col.cursos)) ops.push(b => b.set(ref('cursos/' + cid), { ...d, actualizadoEn: ahora }));
    let borrados = 0;
    for (const d of viejosCursos.docs) if (!col.cursos[d.id]) { borrados++; ops.push(b => b.delete(d.ref)); }
    for (const d of viejasMaterias.docs) if (!col.materias[d.id]) ops.push(b => b.update(d.ref, { ofertas: FV.arrayRemove(id), ['porOferta.' + id]: FV.delete() }));
    for (const d of viejosProfes.docs) if (!col.profesores[d.id]) ops.push(b => b.update(d.ref, { ofertas: FV.arrayRemove(id), ['cursosPorOferta.' + id]: FV.delete() }));

    const acum = { hechas: 0, total: ops.length + 2 };
    await escribir(ops, 'Guardando materias, docentes y comisiones', acum);

    // Publicar: foto compilada y, si se pidió, vigente (y todas las demás dejan de estarlo).
    progreso(acum.hechas, acum.total, 'Publicando');
    const pub = await compilarPublicacion(col, id, REF, sha256hex);
    if (pub.bytes > 1_000_000) throw new Error('La oferta compilada supera 1 MB: avisale a quien mantiene el fixture.');
    const actual = (await ref('ofertas/' + id).get()).data() || {};
    const b = db.batch();
    b.set(ref(`ofertas/${id}/fotos/${pub.version}`), { json: pub.json, materias: pub.foto.courses.length, creadoEn: ahora });
    b.set(ref('ofertas/' + id), {
      version: pub.version,
      previous: actual.version && actual.version !== pub.version ? actual.version : (actual.previous || null),
      vigente: !!actual.vigente, estado: 'publicada', materiasPublicadas: pub.foto.courses.length,
      publicadaEn: ahora, publicadaPor: USER.email || USER.uid,
    }, { merge: true });
    let retiradas = [];
    if (activa) retiradas = marcarVigente(b, id, await db.collection('ofertas').where('vigente', '==', true).get());
    await b.commit();
    progreso(acum.total, acum.total, 'Listo');
    paso('pub', 'ok', pub.version);

    $('final').hidden = false;
    const vigTxt = activa ? `Es la oferta vigente${retiradas.length ? ` (${esc(retiradas.join(', '))} dejó de mostrarse)` : ''}: los alumnos la ven al recargar la app.`
      : actual.vigente ? 'Sigue siendo la vigente: los alumnos ven los cambios al recargar la app.'
      : 'No está vigente: la app sigue mostrando la oferta actual. Activala desde "Ofertas publicadas" cuando corresponda.';
    $('final').innerHTML = `<div class="box ok"><b>Oferta ${esc(id)} publicada.</b> ${fmt(Object.keys(col.materias).length)} materias y ${fmt(Object.keys(col.cursos).length)} comisiones${borrados ? `; se borr${borrados === 1 ? 'ó 1 comisión' : 'aron ' + fmt(borrados) + ' comisiones'} que ya no está${borrados === 1 ? '' : 'n'}` : ''}. ${vigTxt}</div>
      <div class="actions"><a class="btn primary" href="/">Ver la app</a><button class="btn" type="button" data-reiniciar>Subir otra oferta</button></div>`;
    $('resumen').hidden = true;
    cargarOfertas();
  } catch (e) {
    console.error(e);
    const permiso = e && e.code === 'permission-denied';
    fallo('pub', permiso ? 'Tu cuenta no tiene permiso para escribir en la base.'
      : 'Se cortó mientras se guardaba (' + (e.message || e) + '). Lo que ven los alumnos no cambió hasta el paso de publicar: podés volver a subir el mismo PDF sin problema.');
  } finally {
    trabajando = false;
  }
}

/* ---------- eventos de la carga ---------- */

$('file').addEventListener('change', e => procesar(e.target.files[0]));
const drop = $('drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => procesar(e.dataTransfer.files[0]));
document.addEventListener('click', e => {
  if (e.target.closest('[data-reiniciar]') && !trabajando) reiniciar();
  const a = e.target.closest('[data-activar]'); if (a) activar(a.dataset.activar);
});
