// Proceso completo con el PDF real: lo mismo que hace el botón "Subir oferta" del admin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extraerTablas } from '../public/js/oferta/tablas-pdf.js';
import { prepararOferta, compilarPublicacion, referenciaDesdeColecciones, reglamentoGeneral } from '../public/js/oferta/preparar.js';
import { aColecciones, compilarFoto } from '../public/js/oferta/modelo.js';

const ref = JSON.parse(readFileSync('data/referencia.json', 'utf8'));
const esperado = JSON.parse(readFileSync('data/ofertas/2026-1.json', 'utf8'));
const sha = async s => createHash('sha256').update(s).digest('hex');
const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync('data/ofertas/2026-1.pdf')), verbosity: 0 }).promise;
const raw = await extraerTablas(pdf, pdfjs.OPS);

test('pdf.js lee el PDF real: 1.227 comisiones, idénticas al JSON guardado', () => {
  const p = prepararOferta(raw, ref, { fuente: '2026-1.pdf' });
  assert.equal(p.ofertaId, '2026-1');
  assert.equal(p.titulo, 'PRIMER PERÍODO LECTIVO 2026 - CPO');
  assert.equal(p.filas, 1227);
  assert.deepEqual(p.errores, []);
  assert.deepEqual(p.cruda.courses, esperado.courses);
});

test('la foto que arma el admin es la misma que arma publicar.mjs', async () => {
  const p = prepararOferta(raw, ref);
  const pub = await compilarPublicacion(p.col, p.ofertaId, ref, sha);
  const cli = compilarFoto(aColecciones(esperado, ref, '2026-1'), '2026-1');
  assert.deepEqual(JSON.parse(pub.json).courses, cli.courses);
  assert.deepEqual(JSON.parse(pub.json).ref, cli.ref);
  assert.match(pub.version, /^v-[0-9a-f]{12}$/);
});

test('el reglamento leído de Firestore equivale a data/referencia.json', () => {
  const porId = l => Object.fromEntries(l.map(({ id, ...d }) => [id, { ...d, actualizadoEn: 'x' }]));
  const r2 = referenciaDesdeColecciones({
    departamentos: porId(ref.departamentos), periodos: porId(ref.periodos), obligatorias: porId(ref.obligatorias),
    orientaciones: porId(ref.orientaciones), materiasReglamento: porId(ref.materiasReglamento), general: reglamentoGeneral(ref),
  });
  for (const k of ['departamentos', 'periodos', 'obligatorias', 'orientaciones', 'materiasReglamento', 'materiasReservadas', 'temaClave', 'departamentosRequeridos']) {
    assert.deepEqual(r2[k], ref[k], k);
  }
});

test('un PDF que no es de oferta da error y no arma colecciones', () => {
  const p = prepararOferta({ titulo: 'OTRA COSA', eventos: [{ t: 'seccion', texto: 'HOLA' }] }, ref);
  assert.ok(p.errores.length > 0);
  assert.equal(p.col, null);
});
