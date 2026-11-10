/*
 * Administración (/3816): pestañas "Alumnos" y "Avisos y fechas".
 *
 * Alumnos: lee todos los plans/{uid} (el progreso de cada alumno) y los nombres de users/{uid}
 * (mismo uid). Para mostrar nombres de cursos y comisiones usa la foto de la oferta vigente; si un
 * curso ya no está en la oferta, usa la copia guardada en el plan (n, d, pts).
 * Avisos y fechas: config/main {banner, dates, hid}. Se guardan con merge para no tocar "hid"
 * (comentarios ocultos, que se manejan desde la app).
 * Las reglas solo dejan leer los plans y escribir config/main a quien está en admins/{uid}.
 */
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const fmt = n => Number(n || 0).toLocaleString('es-AR');
const ST = { plan: 'Lo pienso cursar', anot: 'Cursando', apr: 'Aprobada' };
const niceName = n => { const s = String(n || '').toLowerCase().replace(/(^|[\s(.:\-—\/])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase()); return s.replace(/\b(De|Del|La|Las|Los|Y|E|El|En|Por|Para|Con|A|Al|O)\b/g, w => w.toLowerCase()).replace(/^./, x => x.toUpperCase()); };
const hh = s => String(s || '').replace(/\bMie\b/g, 'Mié').replace(/\bSab\b/g, 'Sáb');
const fmtDate = d => { const m = String(d).match(/^(\d{4})-(\d\d)-(\d\d)$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : d; };
const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let db, toast, $;
let CAT = null;          // {byKey, ORI, PERLBL, OBLIG, DEPN, ofertaId}
let ROWS = null;         // planes de los alumnos
let NAMES = {};          // uid -> nombre
let CFG = { banner: null, dates: [] };

export function initAlumnos(opts) { ({ db, toast } = opts); $ = id => document.getElementById(id); conectarEventos(); }

/* ---------- datos ---------- */

async function cargarCatalogo() {
  if (CAT) return CAT;
  const s = await db.collection('ofertas').where('vigente', '==', true).get();
  const o = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.version).sort((a, b) => (b.anio - a.anio) || (b.semestre - a.semestre))[0];
  let courses = [], ref = {};
  if (o) {
    const f = await db.doc(`ofertas/${o.id}/fotos/${o.version}`).get();
    if (f.exists) { const p = JSON.parse(f.data().json); courses = p.courses || []; ref = p.ref || {}; }
  }
  CAT = {
    byKey: new Map(courses.map(c => [c.dep + '-' + c.code, c])),
    ORI: ref.ORI || {}, PERLBL: ref.PERLBL || {}, OBLIG: ref.OBLIG || [], DEPN: ref.DEPN || {}, ofertaId: o ? o.id : null,
  };
  return CAT;
}

async function cargarNombres(uids) {
  const FP = firebase.firestore.FieldPath.documentId(), out = {};
  for (let i = 0; i < uids.length; i += 30) {
    const q = await db.collection('users').where(FP, 'in', uids.slice(i, i + 30)).get();
    q.docs.forEach(d => { out[d.id] = (d.data() || {}).name || ''; });
  }
  return out;
}

export async function cargarAlumnos() {
  $('al-body').innerHTML = '<p class="empty">Cargando alumnos…</p>';
  try {
    await cargarCatalogo();
    const q = await db.collection('plans').get();
    ROWS = q.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    try { NAMES = await cargarNombres(ROWS.map(r => r.id)); } catch (e) { NAMES = {}; }
    pintarAlumnos();
  } catch (e) {
    console.error(e);
    $('al-body').innerHTML = `<div class="box bad"><b>No se pudo leer la base.</b> ${esc(e.code === 'permission-denied' ? 'Tu cuenta no tiene permiso para ver los planes.' : (e.message || e))}</div>`;
  }
}

const nombre = r => NAMES[r.id] || 'Alumno ' + String(r.id).slice(0, 6);
const oriN = k => (k && CAT.ORI[k] ? CAT.ORI[k].n : '—');
function comOf(k, pid, code) { const c = CAT.byKey.get(k), p = c && (c.periods || []).find(x => x.id === pid); return (p && (p.coms || []).find(m => m[0] === code)) || null; }

// Cursos de un alumno, para la tabla y el CSV.
function cursosDe(r) {
  const out = [];
  for (const [k, e] of Object.entries(r.sel || {})) {
    const c = CAT.byKey.get(k), m = e.c ? comOf(k, e.p, e.c) : null;
    out.push({ name: niceName(c ? c.name : (e.n || k)), code: k, per: CAT.PERLBL[e.p] || '', st: ST[e.st || 'plan'] || '', com: m ? 'Com. ' + m[0] + ' · ' + m[2] + ' · ' + hh(m[3]) : (e.c ? 'Com. ' + e.c : '') });
  }
  for (const x of r.prev || []) out.push({ name: String(x.name || ''), code: x.k || '', per: (x.p && CAT.PERLBL[x.p] ? CAT.PERLBL[x.p] + ' ' : 'año ') + (x.year || ''), st: 'Aprobada (anterior)', com: '' });
  for (const x of r.pra || []) out.push({ name: 'Práctica Profesional' + (x.name ? ' · ' + String(x.name).slice(0, 60) : ''), code: '', per: (x.pts || 0) + ' pts', st: ST[x.st] || '', com: '' });
  for (const i of r.obl || []) { const o = CAT.OBLIG.find(x => x[0] === i); if (o) out.push({ name: o[1], code: 'Obligatoria', per: '', st: 'Aprobada', com: '' }); }
  if (r.idi) out.push({ name: 'Lecto-comprensión', code: 'Idioma', per: '', st: 'Aprobada', com: '' });
  return out;
}

function agregados(rows) {
  const byO = {}, byC = {}, byCom = {}, bins = [0, 0, 0, 0, 0];
  let sumA = 0, full = 0;
  for (const r of rows) {
    if (r.ori && CAT.ORI[r.ori]) byO[r.ori] = (byO[r.ori] || 0) + 1;
    const a = r.apr || 0; sumA += a; if (a >= 69) full++; bins[a >= 69 ? 4 : Math.min(3, Math.floor(a / 69 * 4))]++;
    for (const [k, e] of Object.entries(r.sel || {})) {
      const c = CAT.byKey.get(k);
      const x = byC[k] || (byC[k] = { k, name: niceName(c ? c.name : (e.n || k)), dep: k.split('-')[0], n: 0, apr: 0, anot: 0, plan: 0, coms: {} });
      x.n++; x[e.st === 'apr' ? 'apr' : e.st === 'anot' ? 'anot' : 'plan']++;
      if (e.c) {
        const q = (CAT.PERLBL[e.p] || e.p) + ' · Com. ' + e.c; x.coms[q] = (x.coms[q] || 0) + 1;
        const m = comOf(k, e.p, e.c);
        if (m) { const id = k + '|' + e.p + '|' + e.c; const y = byCom[id] || (byCom[id] = { name: x.name, per: CAT.PERLBL[e.p] || e.p, c: e.c, m, n: 0 }); y.n++; }
      }
    }
  }
  const top = Object.values(byC).sort((a, b) => b.n - a.n);
  top.forEach(x => { const q = Object.keys(x.coms).sort((a, b) => x.coms[b] - x.coms[a])[0]; x.topCom = q ? q + ' (' + x.coms[q] + ')' : '—'; });
  return { byO, bins, avg: rows.length ? sumA / rows.length : 0, full, top, coms: Object.values(byCom).sort((a, b) => b.n - a.n) };
}

/* ---------- pintar ---------- */

function pintarAlumnos() {
  const rows = ROWS;
  $('al-n').textContent = fmt(rows.length) + ' alumno' + (rows.length === 1 ? '' : 's');
  if (!rows.length) { $('al-body').innerHTML = '<p class="empty">Todavía no hay alumnos con avance guardado. Cuando alguien entre a la app y cargue algo, aparece acá.</p>'; return; }
  const g = agregados(rows), N = rows.length;
  const mx = Math.max(1, ...Object.values(g.byO)), mb = Math.max(1, ...g.bins);
  const BINS = ['0–25%', '25–50%', '50–75%', '75–99%', 'Completo'];
  let h = `<div class="stats">
    <div class="stat"><b>${fmt(N)}</b><span>alumnos</span></div>
    <div class="stat"><b>${g.avg.toFixed(1)}</b><span>pts aprobados (promedio, de 69)</span></div>
    <div class="stat"><b>${fmt(g.full)}</b><span>con los 69 completos</span></div>
    <div class="stat"><b>${fmt(g.top.length)}</b><span>cursos distintos elegidos</span></div></div>`;
  h += '<div class="dgrid"><div><h3>Alumnos por orientación</h3>' + (Object.keys(g.byO).length
    ? Object.keys(g.byO).sort((a, b) => g.byO[b] - g.byO[a]).map(k => `<div class="hbar"><span>${esc(oriN(k))}</span><i style="width:${100 * g.byO[k] / mx}%"></i><b>${g.byO[k]}</b></div>`).join('')
    : '<p class="empty">Nadie eligió orientación todavía.</p>') + '</div>';
  h += '<div><h3>Avance (puntos aprobados)</h3>' + g.bins.map((v, i) => `<div class="hbar"><span>${BINS[i]}</span><i style="width:${100 * v / mb}%"></i><b>${v}</b></div>`).join('') + '</div></div>';

  h += '<h3>Alumnos</h3><input class="buscar" id="al-q" type="search" placeholder="Buscar por nombre u orientación" autocomplete="off"><div class="tw"><table class="adm"><thead><tr><th>Alumno</th><th>Orientación</th><th>Puntos</th><th>Aprob.</th><th>Actualizado</th></tr></thead><tbody id="al-rows">';
  h += rows.map(r => {
    const cs = cursosDe(r);
    return `<tr data-q="${esc((nombre(r) + ' ' + oriN(r.ori)).toLowerCase())}"><td><b>${esc(nombre(r))}</b>${cs.length ? `<details><summary>${cs.length} materia${cs.length > 1 ? 's' : ''}</summary><ul>${cs.map(c => `<li>${esc(c.name)} <span class="mono">${esc([c.code, c.per, c.st, c.com].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul></details>` : ''}</td>
      <td>${esc(oriN(r.ori))}</td><td class="mono">${r.got || 0}/69</td><td class="mono">${r.apr || 0}</td><td>${r.updatedAt ? esc(new Date(r.updatedAt).toLocaleDateString('es-AR')) : '—'}</td></tr>`;
  }).join('') + '</tbody></table></div>';

  h += '<h3>Cursos más elegidos <span class="chip">para planificar la oferta</span></h3>' + (g.top.length
    ? '<div class="tw"><table class="adm"><thead><tr><th>Curso</th><th>Dpto.</th><th>Total</th><th>Aprob.</th><th>Cursando</th><th>Por cursar</th><th>Comisión más elegida</th></tr></thead><tbody>' +
      g.top.slice(0, 10).map(x => `<tr><td><b>${esc(x.name)}</b><div class="meta mono">${esc(x.k)}</div></td><td>${esc(x.dep)}</td><td class="mono">${x.n}</td><td class="mono">${x.apr}</td><td class="mono">${x.anot}</td><td class="mono">${x.plan}</td><td>${esc(x.topCom)}</td></tr>`).join('') + '</tbody></table></div>'
    : '<p class="empty">Todavía no hay cursos elegidos.</p>');
  if (g.coms.length) {
    h += '<h3>Comisiones más elegidas <span class="chip warn">alerta de demanda</span></h3><div class="tw"><table class="adm"><thead><tr><th>Curso y comisión</th><th>Docente y horario</th><th>Alumnos</th><th></th></tr></thead><tbody>' +
      g.coms.slice(0, 10).map(x => { const alta = N >= 4 && x.n / N >= 0.25; return `<tr><td><b>${esc(x.name)}</b><div class="meta">${esc(x.per)} · Com. ${esc(x.c)}</div></td><td>${esc(x.m[2])}<div class="meta">${esc(hh(x.m[3]))}</div></td><td class="mono">${x.n}</td><td>${alta ? '<span class="chip bad">Alta demanda</span>' : ''}</td></tr>`; }).join('') + '</tbody></table></div>';
  }
  $('al-body').innerHTML = h;
}

/* ---------- CSV ---------- */

function descargar(nombreArchivo, texto) {
  const u = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = u; a.download = nombreArchivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 3000);
}
const csv = filas => filas.map(f => f.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n') + '\n';
function csvAlumnos() {
  if (!ROWS || !ROWS.length) return toast('No hay alumnos para exportar.');
  descargar('alumnos-cpo.csv', csv([['Nombre', 'Id', 'Orientación', 'Desde', 'Puntos cargados', 'Puntos aprobados', 'Actualizado', 'Materias']].concat(ROWS.map(r => [
    nombre(r), r.id, oriN(r.ori), r.desde || '', r.got || 0, r.apr || 0, r.updatedAt ? new Date(r.updatedAt).toLocaleString('es-AR') : '',
    cursosDe(r).map(c => c.name + ' (' + [c.code, c.per, c.st, c.com].filter(Boolean).join(', ') + ')').join(' | '),
  ]))));
}
function csvCursos() {
  if (!ROWS || !ROWS.length) return toast('No hay datos para exportar.');
  const g = agregados(ROWS);
  descargar('cursos-mas-elegidos-cpo.csv', csv([['Curso', 'Código', 'Departamento', 'Total alumnos', 'Aprobada', 'Cursando', 'Por cursar', 'Comisión más elegida']].concat(
    g.top.map(x => [x.name, x.k, CAT.DEPN[x.dep] || x.dep, x.n, x.apr, x.anot, x.plan, x.topCom]))));
}

/* ---------- avisos y fechas (config/main) ---------- */

export async function cargarAvisos() {
  try {
    const s = await db.doc('config/main').get(), d = s.exists ? s.data() : {};
    CFG = { banner: d.banner && d.banner.text ? d.banner : null, dates: Array.isArray(d.dates) ? d.dates : [] };
  } catch (e) { CFG = { banner: null, dates: [] }; }
  $('av-banner').value = CFG.banner ? CFG.banner.text : '';
  pintarFechas();
}
function pintarFechas() {
  $('av-actual').innerHTML = CFG.banner ? `<div class="box info"><b>Aviso publicado:</b> ${esc(CFG.banner.text)}${CFG.banner.at ? ` <span class="meta">· ${esc(new Date(CFG.banner.at).toLocaleDateString('es-AR'))}</span>` : ''}</div>` : '<p class="empty">No hay ningún aviso publicado.</p>';
  $('av-fechas').innerHTML = CFG.dates.length
    ? CFG.dates.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map(x => `<li><span><b>${esc(x.label)}</b> · ${esc(fmtDate(x.date))}</span><button class="btn" type="button" data-fdel="${esc(x.id)}">Quitar</button></li>`).join('')
    : '<li class="empty">Todavía no cargaste fechas.</li>';
}
async function guardarCfg(datos, ok) {
  try { await db.doc('config/main').set(JSON.parse(JSON.stringify(datos)), { merge: true }); Object.assign(CFG, datos); pintarFechas(); toast(ok); }
  catch (e) { console.error(e); toast(e.code === 'permission-denied' ? 'Tu cuenta no tiene permiso para cambiar esto.' : 'No se pudo guardar. Probá de nuevo.'); }
}

function conectarEventos() {
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'al-reload') cargarAlumnos();
    else if (t.id === 'al-csv') csvAlumnos();
    else if (t.id === 'al-csvc') csvCursos();
    else if (t.id === 'av-pub') { const x = $('av-banner').value.trim().slice(0, 400); guardarCfg({ banner: x ? { text: x, at: Date.now() } : null }, x ? 'Aviso publicado.' : 'Aviso quitado.'); }
    else if (t.id === 'av-quitar') { $('av-banner').value = ''; guardarCfg({ banner: null }, 'Aviso quitado.'); }
    else if (t.id === 'av-add') {
      const l = $('av-dl').value.trim().slice(0, 80), d = $('av-dd').value;
      if (!l || !/^\d{4}-\d\d-\d\d$/.test(d)) return toast('Poné un nombre y una fecha.');
      if (CFG.dates.length >= 30) return toast('Llegaste al máximo de 30 fechas: quitá alguna vieja.');
      guardarCfg({ dates: CFG.dates.concat([{ id: newId(), label: l, date: d }]) }, 'Fecha agregada.').then(() => { $('av-dl').value = ''; $('av-dd').value = ''; });
    } else if (t.dataset.fdel) guardarCfg({ dates: CFG.dates.filter(x => x.id !== t.dataset.fdel) }, 'Fecha quitada.');
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'al-q') return;
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#al-rows tr').forEach(tr => { tr.hidden = !!q && !tr.dataset.q.includes(q); });
  });
}
