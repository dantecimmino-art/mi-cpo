// Importa la oferta de un período lectivo a Firestore, desde el PDF que publica la Facultad.
//
//   node scripts/importar.mjs --project mi-cpo data/ofertas/2027-1.pdf            (importa)
//   node scripts/importar.mjs --project mi-cpo data/ofertas/2027-1.pdf --prueba   (solo revisa, no escribe)
//   node scripts/importar.mjs --project mi-cpo data/ofertas/2026-2.json --oferta 2026-2
//
// Es el mismo proceso que el botón "Subir oferta" de public/3816.html (mismo código en
// public/js/oferta/), pero desde la terminal y sin publicar (para eso, scripts/publicar.mjs).
//
// Pasos:
//   1. PDF -> tablas (public/js/oferta/tablas-pdf.js, con pdf.js)
//   2. tablas -> oferta cruda (pdf-oferta.js). Se guarda en data/ofertas/<id>.json
//   3. validación contra el reglamento (validar.js). Con errores NO importa, salvo --forzar.
//   4. escribe ofertas/<id>, materias, profesores y cursos. Borra los cursos de esa oferta que ya
//      no están. Con --reglamento, además pisa el reglamento de la base con data/referencia.json
//      (la base es la fuente de verdad: el admin y la app lo leen de ahí).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { aColecciones } from '../public/js/oferta/modelo.js';
import { extraerTablas } from '../public/js/oferta/tablas-pdf.js';
import { interpretar } from '../public/js/oferta/pdf-oferta.js';
import { validarOferta } from '../public/js/oferta/validar.js';
import { reglamentoGeneral } from '../public/js/oferta/preparar.js';
import { args } from './lib/firestore.mjs';

const o = args();
const archivo = o._[0];
if (!archivo || !existsSync(archivo)) {
  console.error('Uso: node scripts/importar.mjs --project <ID> <archivo.pdf|archivo.json> [--oferta 2027-1] [--prueba] [--forzar] [--reglamento]');
  process.exit(1);
}
const ref = JSON.parse(readFileSync(o.referencia || 'data/referencia.json', 'utf8'));

let cruda, ofertaId = o.oferta ? String(o.oferta) : null, avisos = [];
if (extname(archivo).toLowerCase() === '.pdf') {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(archivo)), verbosity: 0 }).promise;
  const r = interpretar(await extraerTablas(pdf, pdfjs.OPS), ref.periodos, { fuente: basename(archivo) });
  if (ofertaId && ofertaId !== r.ofertaId) console.warn(`Ojo: el PDF dice ${r.ofertaId} y pediste --oferta ${ofertaId}; se usa ${ofertaId}.`);
  ofertaId ||= r.ofertaId;
  cruda = { ...r.cruda, fuente: basename(archivo), titulo: r.titulo };
  avisos = r.avisos;
  const destino = join('data/ofertas', `${ofertaId}.json`);
  writeFileSync(destino, JSON.stringify(cruda, null, 1));
  console.log(`${r.titulo || basename(archivo)}: ${r.filas} comisiones, ${cruda.courses.length} materias -> ${destino}`);
} else {
  cruda = JSON.parse(readFileSync(archivo, 'utf8'));
  ofertaId ||= basename(archivo, extname(archivo));
}
if (!/^\d{4}-[12]$/.test(ofertaId)) { console.error(`Id de oferta inválido "${ofertaId}" (formato: 2027-1)`); process.exit(1); }

// Validación: lectura del PDF + reglamento.
const informe = [...avisos, ...validarOferta(cruda, ref)];
const errores = informe.filter(x => x.tipo === 'error');
for (const x of informe) console.log(`  ${x.tipo === 'error' ? 'ERROR' : 'aviso'}  ${x.msg}${x.pagina ? ` (pág. ${x.pagina})` : ''}`);
console.log(errores.length ? `${errores.length} error(es) contra el reglamento.` : `Oferta ${ofertaId} OK contra el reglamento (${informe.length} aviso(s)).`);
if (errores.length && !o.forzar) { console.error('No se importa. Corregí el PDF o el reglamento (data/referencia.json), o usá --forzar.'); process.exit(1); }
if (o.prueba) process.exit(0);

// Escritura en Firestore.
const { conectar } = await import('./lib/firestore.mjs');
const { FieldValue } = await import('firebase-admin/firestore');
const col = aColecciones(cruda, ref, ofertaId);
const db = conectar(o.project);
const ahora = FieldValue.serverTimestamp();
const w = db.bulkWriter();
let escrituras = 0;
const set = (ruta, data, merge = false) => { escrituras++; w.set(db.doc(ruta), data, { merge }); };

// 1) Reglamento: solo con --reglamento (se pisa completo con data/referencia.json).
if (o.reglamento) for (const nombre of ['departamentos', 'periodos', 'obligatorias', 'orientaciones']) {
  for (const [id, d] of Object.entries(col[nombre])) set(`${nombre}/${id}`, { ...d, actualizadoEn: ahora });
}
if (o.reglamento) for (const { id, ...d } of ref.materiasReglamento || []) set(`materiasReglamento/${id}`, { ...d, actualizadoEn: ahora });
if (o.reglamento) set('config/reglamento', { ...reglamentoGeneral(ref), actualizadoEn: ahora });

// 2) Oferta (merge: no toca vigente/version, que los maneja publicar.mjs).
set(`ofertas/${ofertaId}`, {
  ...col.ofertas[ofertaId],
  fuente: cruda.fuente || basename(archivo),
  avisos: informe.map(x => x.msg).slice(0, 50),
  importadaEn: ahora,
}, true);

// 3) Materias y profesores: se fusionan (pueden figurar en varias ofertas).
for (const [id, { ofertas, ...d }] of Object.entries(col.materias)) {
  set(`materias/${id}`, { ...d, ofertas: FieldValue.arrayUnion(ofertaId), actualizadoEn: ahora }, true);
}
for (const [id, { ofertas, materias, cursos, ...d }] of Object.entries(col.profesores)) {
  set(`profesores/${id}`, {
    ...d,
    ofertas: FieldValue.arrayUnion(ofertaId),
    materias: FieldValue.arrayUnion(...materias),
    cursosPorOferta: { [ofertaId]: cursos },
    actualizadoEn: ahora,
  }, true);
}

// 4) Cursos (comisiones) de esta oferta.
for (const [id, d] of Object.entries(col.cursos)) set(`cursos/${id}`, { ...d, actualizadoEn: ahora });

// 5) Limpieza de lo que ya no está en esta oferta.
let borrados = 0, desvinculados = 0;
const viejos = await db.collection('cursos').where('ofertaId', '==', ofertaId).select().get();
for (const d of viejos.docs) if (!col.cursos[d.id]) { w.delete(d.ref); borrados++; }
for (const [coleccion, nuevos] of [['materias', col.materias], ['profesores', col.profesores]]) {
  const q = await db.collection(coleccion).where('ofertas', 'array-contains', ofertaId).select().get();
  for (const d of q.docs) if (!nuevos[d.id]) {
    w.update(d.ref, coleccion === 'materias'
      ? { ofertas: FieldValue.arrayRemove(ofertaId), [`porOferta.${ofertaId}`]: FieldValue.delete() }
      : { ofertas: FieldValue.arrayRemove(ofertaId), [`cursosPorOferta.${ofertaId}`]: FieldValue.delete() });
    desvinculados++;
  }
}

await w.close();
const t = col.ofertas[ofertaId];
console.log(`Oferta ${ofertaId} importada: ${t.materias} materias, ${t.cursos} cursos, ${t.profesores} profesores (${escrituras} escrituras).`);
if (borrados || desvinculados) console.log(`Limpieza: ${borrados} cursos borrados, ${desvinculados} materias/profesores desvinculados de la oferta.`);
console.log(`Siguiente paso: npm run publicar -- --project ${o.project} --oferta ${ofertaId}`);
