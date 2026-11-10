// Compila la oferta de un período lectivo (colecciones -> foto) y la deja vigente para los alumnos.
//
//   node scripts/publicar.mjs --project mi-cpo --oferta 2027-1
//   node scripts/publicar.mjs --project mi-cpo --oferta 2027-1 --sin-activar (publica, no la activa)
//   node scripts/publicar.mjs --project mi-cpo --oferta 2026-2 --activar     (solo la activa, sin recompilar)
//
// Escribe:
//   ofertas/{id}/fotos/{version}   {json}: cursos + reglamento compilados (1 lectura por visita)
//   ofertas/{id}                   version, previous, vigente: true, estado: 'publicada'
// y saca "vigente" a TODAS las demás: solo hay una oferta vigente y es la única que lee la app.
// (Lo mismo hace el botón "Activar" de /3816.)
//
// Volver atrás: en ofertas/{id}, poner en "version" el valor de "previous".
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { compilarFoto } from '../public/js/oferta/modelo.js';
import { args, conectar, leer } from './lib/firestore.mjs';

const o = args();
const ofertaId = String(o.oferta || '');
if (!/^\d{4}-[12]$/.test(ofertaId)) { console.error('Falta --oferta (ej.: 2027-1)'); process.exit(1); }
const db = conectar(o.project);
const ofRef = db.doc(`ofertas/${ofertaId}`);

// Deja vigente esta oferta y saca "vigente" a todas las demás, en un solo lote.
async function activar() {
  const otras = await db.collection('ofertas').where('vigente', '==', true).get();
  const b = db.batch();
  b.update(ofRef, { vigente: true, estado: 'publicada', activadaEn: FieldValue.serverTimestamp() });
  for (const d of otras.docs) if (d.id !== ofertaId) {
    b.update(d.ref, { vigente: false, estado: 'reemplazada', reemplazadaPor: ofertaId });
    console.log(`Oferta ${d.id} deja de estar vigente (la reemplaza ${ofertaId}).`);
  }
  await b.commit();
  console.log(`Oferta vigente: ${ofertaId}. Los alumnos la ven al recargar la app.`);
}

if (o.activar) {
  const d = (await ofRef.get()).data();
  if (!d || !d.version || !(await ofRef.collection('fotos').doc(d.version).get()).exists) {
    console.error(`ofertas/${ofertaId} no tiene oferta compilada: publicala primero (sin --activar).`); process.exit(1);
  }
  await activar();
  process.exit(0);
}

const [departamentos, periodos, obligatorias, orientaciones, oferta, materias, cursos] = await Promise.all([
  leer(db.collection('departamentos')),
  leer(db.collection('periodos')),
  leer(db.collection('obligatorias')),
  leer(db.collection('orientaciones')),
  ofRef.get(),
  leer(db.collection('materias').where('ofertas', 'array-contains', ofertaId)),
  leer(db.collection('cursos').where('ofertaId', '==', ofertaId)),
]);
if (!oferta.exists) { console.error(`No existe ofertas/${ofertaId}. Corré primero npm run importar.`); process.exit(1); }

// Las reservadas/temaClave pueden ser de materias sin cursos en esta oferta: se leen todas las marcadas.
const extra = await leer(db.collection('materias').where('reservada', '==', true));
const extra2 = await leer(db.collection('materias').where('temaClave', '!=', null));
const foto = compilarFoto({
  departamentos, periodos, obligatorias, orientaciones,
  ofertas: { [ofertaId]: oferta.data() },
  materias: { ...extra, ...extra2, ...materias },
  cursos,
}, ofertaId);

const json = JSON.stringify({ courses: foto.courses, ref: foto.ref, oferta: foto.oferta, anio: foto.anio, semestre: foto.semestre });
if (Buffer.byteLength(json) > 1_000_000) throw new Error('La foto supera ~1 MB: hay que partirla en varios documentos');
const version = 'v-' + createHash('sha256').update(json).digest('hex').slice(0, 12);
const actual = oferta.data();

if (actual.version !== version || o.force) {
  await ofRef.collection('fotos').doc(version).set({ json, materias: foto.courses.length, creadoEn: FieldValue.serverTimestamp() });
}
await ofRef.set({
  version,
  previous: actual.version && actual.version !== version ? actual.version : (actual.previous || null),
  vigente: !!actual.vigente,
  estado: 'publicada',
  materiasPublicadas: foto.courses.length,
  publicadaEn: FieldValue.serverTimestamp(),
}, { merge: true });

console.log(`Publicada ofertas/${ofertaId}/fotos/${version}: ${foto.courses.length} materias, ${Object.keys(cursos).length} cursos, ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB.`);
if (actual.version && actual.version !== version) console.log(`Versión anterior (para volver atrás): ${actual.version}`);
if (o['sin-activar']) console.log(actual.vigente ? 'Sigue siendo la vigente.' : 'No se activó: la app sigue mostrando la oferta vigente actual.');
else await activar();
