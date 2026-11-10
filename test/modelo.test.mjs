// npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aColecciones, compilarFoto, parseHorario, slug, nombreOferta } from '../public/js/oferta/modelo.js';

const leer = p => JSON.parse(readFileSync(p, 'utf8'));
const ref = leer('data/referencia.json');
const o1 = leer('data/ofertas/2026-1.json'); // generado desde data/ofertas/2026-1.pdf
const o2 = leer('data/ofertas/2026-2.json');
const col = aColecciones(o1, ref, '2026-1');

test('las colecciones de 2026-1 tienen los totales del PDF', () => {
  assert.equal(Object.keys(col.materias).length, 607);
  assert.equal(Object.keys(col.cursos).length, 1227);
  assert.equal(Object.keys(col.orientaciones).length, 8);
  assert.equal(Object.keys(col.departamentos).length, 12);
  assert.equal(Object.keys(col.periodos).length, 10);
  assert.equal(Object.keys(col.obligatorias).length, 5);
  assert.deepEqual(col.ofertas['2026-1'].anio, 2026);
  assert.deepEqual(col.ofertas['2026-1'].semestre, 1);
  assert.equal(col.ofertas['2026-1'].nombre, 'Primer período lectivo 2026');
});

test('ida y vuelta: colecciones -> foto devuelve exactamente la oferta original', () => {
  for (const [id, cruda] of [['2026-1', o1], ['2026-2', o2]]) {
    const foto = compilarFoto(aColecciones(cruda, ref, id), id);
    assert.deepEqual(foto.courses, cruda.courses, id);
    assert.equal(foto.oferta, cruda.oferta);
  }
});

test('2026-1 solo tiene períodos del primer semestre y 2026-2 solo del segundo', () => {
  const sem = Object.fromEntries(ref.periodos.map(p => [p.id, p.semestre]));
  assert.ok(o1.courses.every(c => c.periods.every(p => sem[p.id] === 1)));
  assert.ok(o2.courses.every(c => c.periods.every(p => sem[p.id] === 2)));
});

test('la foto trae el reglamento que usa app.js', () => {
  const foto = compilarFoto(col, '2026-1');
  assert.deepEqual(foto.ref.RESERVED, [...ref.materiasReservadas].sort());
  assert.equal(foto.ref.ORI.emp.ch[0].length, 3);
  assert.deepEqual(foto.ref.PSPAN.CBIM, [2, 4]);
  assert.equal(foto.ref.PSEM.SCUA, 2);
  assert.equal(foto.ref.DEPN.PRI, 'Derecho Privado');
  assert.deepEqual(foto.ref.OBLIG[2], ['DFS', 'Derecho de Familia y Sucesiones', '72 h', 6]);
  assert.equal(foto.ref.TEMA['ECN-5X3'], 'CONTRATACIÓN MERCANTIL');
  assert.equal(foto.anio, 2026);
});

test('un curso queda consultable por profesor, día y turno', () => {
  const c = col.cursos['2026-1_PRI-205_PCUA_0620'];
  assert.equal(c.profesorId, 'lococo-julio');
  assert.deepEqual(c.dias, [1, 4]);
  assert.deepEqual(c.turnos, ['M']);
  assert.equal(c.modalidad, 'presencial');
  assert.ok(col.profesores['lococo-julio'].materias.includes('PRI-205'));
});

test('ningún documento tiene arrays anidados (Firestore no los admite)', () => {
  const anidado = v => Array.isArray(v) ? v.some(x => Array.isArray(x) || anidado(x)) : (v && typeof v === 'object' ? Object.values(v).some(anidado) : false);
  for (const [nombre, docs] of Object.entries(col)) for (const [id, d] of Object.entries(docs)) assert.ok(!anidado(d), `${nombre}/${id}`);
});

test('helpers', () => {
  assert.deepEqual(parseHorario('Sab 18:30–20:00').map(h => [h.dia, h.desdeMin]), [[6, 1110]]);
  assert.equal(slug('Di Pietro Alfredo H.'), 'di-pietro-alfredo-h');
  assert.equal(nombreOferta('2027-2'), 'Segundo período lectivo 2027');
});

test('una materia en dos ofertas: cada foto usa sus propios datos (no los de la última importación)', () => {
  // Simula Firestore: materias fusionadas (merge) con 2026-1 y después 2026-2.
  const c1 = aColecciones(o1, ref, '2026-1'), c2 = aColecciones(o2, ref, '2026-2');
  const materias = { ...c1.materias };
  for (const [id, m] of Object.entries(c2.materias)) {
    materias[id] = { ...(materias[id] || {}), ...m, porOferta: { ...(materias[id]?.porOferta || {}), ...m.porOferta } };
  }
  const foto1 = compilarFoto({ ...c1, materias, cursos: { ...c1.cursos, ...c2.cursos }, ofertas: { ...c1.ofertas, ...c2.ofertas } }, '2026-1');
  assert.deepEqual(foto1.courses, o1.courses);
});
