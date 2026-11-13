// Validación de una oferta contra el reglamento (Plan 2004).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarOferta, parecido } from '../public/js/oferta/validar.js';

const leer = p => JSON.parse(readFileSync(p, 'utf8'));
const ref = leer('data/referencia.json');
const o1 = leer('data/ofertas/2026-1.json');
const errores = cruda => validarOferta(cruda, ref).filter(x => x.tipo === 'error').map(x => x.msg);
const sin = (cruda, id) => ({ ...cruda, courses: cruda.courses.filter(c => `${c.dep}-${c.code}` !== id) });

test('las ofertas 2026 cumplen el reglamento', () => {
  assert.deepEqual(errores(o1), []);
  assert.deepEqual(errores(leer('data/ofertas/2026-2.json')), []);
});

test('el reglamento cubre todas las materias que usan las orientaciones', () => {
  const ids = new Set(ref.materiasReglamento.map(m => m.id));
  for (const o of ref.orientaciones) {
    for (const id of [...o.principales, ...o.gruposElegirUno.flatMap(g => g.materias), ...o.constitucional]) assert.ok(ids.has(id), `${o.id}: ${id}`);
  }
});

test('Tributario: falta Concursos (INS-968), que va en Procesal: error', () => {
  const e = errores(sin(o1, 'INS-968'));
  assert.ok(e.some(m => /Falta INS-968 "Concursos" \(procesal-obligatorio de tri\)/.test(m)), e.join('\n'));
});

test('falta una principal: error', () => {
  const e = errores(sin(o1, 'PEN-405'));
  assert.equal(e.length, 1);
  assert.match(e[0], /Falta PEN-405 "Régimen del Proceso Penal" \(principal de pen\)/);
});

test('cambió el código de una principal: error que sugiere el nuevo', () => {
  const cruda = { ...o1, courses: o1.courses.map(c => (c.dep === 'PRI' && c.code === '205' ? { ...c, code: '9Z9' } : c)) };
  const e = errores(cruda);
  assert.equal(e.length, 1);
  assert.match(e[0], /Falta PRI-205.*¿Cambió el código\? Hay: PRI-9Z9 "DERECHO ROMANO"/);
});

test('puntos distintos a los del reglamento: error', () => {
  const cruda = { ...o1, courses: o1.courses.map(c => (c.dep === 'PUB' && c.code === '631'
    ? { ...c, periods: c.periods.map(p => ({ ...p, id: 'PCUA', label: 'Primer cuatrimestre', pts: 4 })) } : c)) };
  assert.ok(errores(cruda).some(m => /PUB-631 "Contratos Administrativos" vale 3 puntos/.test(m)));
});

test('alternativas: alcanza con que se ofrezca una', () => {
  assert.deepEqual(errores(sin(o1, 'PUB-603')), []);
  assert.equal(errores(sin(sin(o1, 'PUB-603'), 'PUB-651')).length, 1);
});

test('departamentos exigidos (Métodos alternativos, Insolvencia, …)', () => {
  const e = errores({ ...o1, courses: o1.courses.filter(c => c.dep !== 'MAR') });
  assert.deepEqual(e, ['No hay ningún curso del departamento MAR, que el reglamento exige']);
});

test('parecido de nombres tolera typos del PDF', () => {
  assert.ok(parecido('Las Bases del Derecho Administrativo', 'LAS BASES DEL DERECHO ADMINISTATIVO') >= 0.6);
  assert.ok(parecido('Derecho Romano', 'DERECHO DE DAÑOS') < 0.6);
});
