// Interpretación de las tablas del PDF (sin Python: se usan filas de muestra copiadas del PDF real).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actividadDe, docenteDe, horarioDe, interpretar, periodoDe, seccionADepto } from '../public/js/oferta/pdf-oferta.js';

const ref = JSON.parse(readFileSync('data/referencia.json', 'utf8'));
const H = ['Período lectivo', 'Actividad', 'Comisión', 'Modalidad', 'Docente', 'Horario'];
const fila = celdas => ({ t: 'fila', celdas, pagina: 1 });
const sec = texto => ({ t: 'seccion', texto });

test('actividad: código, departamento, nombre limpio y marcas', () => {
  assert.deepEqual(actividadDe('205 (PRI) - DERECHO ROMANO ***'),
    { code: '205', depCodigo: 'PRI', name: 'DERECHO ROMANO', intdp: false, area: null, destacada: true });
  const a = actividadDe('4V4 (ECN) - DERECHO AMBIENTAL NOTARIAL _INTDP+B246');
  assert.equal(a.name, 'DERECHO AMBIENTAL NOTARIAL'); assert.equal(a.intdp, true);
  const b = actividadDe('78X (PRI) - ACCIDENTES DE TRÁNSITO _ÁREA DAÑ');
  assert.equal(b.name, 'ACCIDENTES DE TRÁNSITO'); assert.equal(b.area, 'DAÑ');
  assert.equal(actividadDe('6R5 (ECN) - DOCTRINA JUDICIAL AMBIENTAL_INTDP').name, 'DOCTRINA JUDICIAL AMBIENTAL');
  assert.equal(actividadDe('basura'), null);
});

test('horario, docente, período y sección', () => {
  assert.equal(horarioDe('Lun 07:00 a 08:30 - Jue 07:00 a 08:30'), 'Lun 07:00–08:30 · Jue 07:00–08:30');
  assert.equal(horarioDe('Sab 08:00 a 11:00'), 'Sab 08:00–11:00');
  assert.equal(docenteDe('NEGRO - CROLLA MATÍAS'), 'Negro-Crolla Matías');
  assert.equal(docenteDe('DI PIETRO ALFREDO H.'), 'Di Pietro Alfredo H.');
  assert.equal(periodoDe('SEGUNDO BIMESTRE ABOGACÍA 2026', ref.periodos).periodo.id, 'SBIM');
  assert.equal(periodoDe('PRIMER CUATRIMESTRE ABOGACÍA 2026', ref.periodos).anio, 2026);
  assert.equal(seccionADepto('*** MÉTODOS ALTERNATIVOS DE RESOLUCIÓN DE CONFLICTOS ***'), 'MAR');
  assert.equal(seccionADepto('*** PROCEDIM.DE PREVENCIÓN Y RESOLUCIÓN DE LA INSOLVENCIA ***'), 'INS');
  assert.equal(seccionADepto('ORIENTACIÓN EN DERECHO NOTARIAL, REGISTRAL E INMOBILIARIO'), 'NOT');
  assert.equal(seccionADepto('DEPARTAMENTO DE DERECHO ECONÓMICO Y EMPRESARIAL'), 'ECN');
});

test('interpretar: agrupa por materia y período, el departamento sale de la sección', () => {
  const raw = { titulo: 'PRIMER PERÍODO LECTIVO 2026 - CPO', eventos: [
    sec('DEPARTAMENTO DE DERECHO'), sec('ECONÓMICO Y EMPRESARIAL'),
    fila([...H, 'Temática']),
    fila(['PRIMER BIMESTRE ABOGACÍA 2026', '308 (ECN) - CONCURSOS _INTDP', '0759', 'Presencial', 'SPANGHERO MARCELO', 'Lun 07:00 a 08:30 - Jue 07:00 a 08:30', '']),
    fila(['SEGUNDO BIMESTRE ABOGACÍA 2026', '308 (ECN) - CONCURSOS _INTDP', '0107', 'Remota', 'SPANGHERO MARCELO', 'Lun 07:00 a 08:30 - Jue 07:00 a 08:30', '']),
    fila(['PRIMER BIMESTRE ABOGACÍA 2026', '62U (ECN) - BOLSAS Y MERCADOS', '0001', 'Presencial', 'X Y', 'Mar 10:00 a 11:30', 'Temática CONTRATACIÓN MERCANTIL']),
    sec('*** PROCEDIM.DE PREVENCIÓN Y'), sec('RESOLUCIÓN DE LA INSOLVENCIA ***'),
    fila(H),
    fila(['PRIMER BIMESTRE ABOGACÍA 2026', '968 (PRC) - CONCURSOS', '1974', 'Presencial', 'SPANGHERO MARCELO', 'Lun 07:00 a 08:30 - Jue 07:00 a 08:30']),
  ] };
  const r = interpretar(raw, ref.periodos);
  assert.equal(r.ofertaId, '2026-1');
  assert.deepEqual(r.avisos, []);
  const [concursos, bolsas, ins] = r.cruda.courses;
  assert.equal(concursos.dep, 'ECN');
  assert.deepEqual(concursos.periods.map(p => [p.id, p.pts, p.n]), [['PBIM', 2, 1], ['SBIM', 2, 1]]);
  assert.deepEqual(concursos.mods, ['Presencial', 'Remota']);
  assert.equal(concursos.intdp, true);
  assert.deepEqual(concursos.periods[0].coms[0], ['0759', 'P', 'Spanghero Marcelo', 'Lun 07:00–08:30 · Jue 07:00–08:30']);
  assert.deepEqual(bolsas.tema, ['CONTRATACIÓN MERCANTIL']);
  assert.equal(ins.dep, 'INS'); assert.equal(ins.code, '968');
});

test('interpretar: avisa filas que no entiende en vez de inventar datos', () => {
  const raw = { titulo: '', eventos: [
    sec('DEPARTAMENTO DE DERECHO PRIVADO'), fila(H),
    fila(['PRIMER CUATRIMESTRE ABOGACÍA 2026', 'SIN CÓDIGO', '0001', 'Presencial', 'A', 'Lun 07:00 a 08:30']),
    fila(['QUINTO MES ABOGACÍA 2026', '205 (PRI) - DERECHO ROMANO', '0002', 'Presencial', 'A', 'Lun 07:00 a 08:30']),
  ] };
  const r = interpretar(raw, ref.periodos);
  assert.equal(r.avisos.filter(a => a.tipo === 'error').length, 3); // 2 filas + "ninguna comisión válida"
  assert.equal(r.cruda.courses.length, 0);
});
