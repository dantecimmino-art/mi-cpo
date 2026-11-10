// Controla una oferta (formato crudo) contra el reglamento del CPO (data/referencia.json).
// El reglamento no cambia entre cuatrimestres; la oferta sí. Si la oferta no permite cumplir
// el reglamento (falta una materia exigida, cambió su código, los puntos no coinciden, falta
// un departamento obligatorio), se marca como error y no se publica.
//
// Devuelve [{tipo: 'error'|'aviso', msg}].
import { norm } from './modelo.js';

// Parecido entre nombres: proporción de palabras significativas del reglamento que aparecen en la oferta.
const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'por', 'a', 'al', 'o']);
const palabras = s => norm(s).split(' ').filter(w => w && !VACIAS.has(w));
export function parecido(reglamento, oferta) {
  const a = palabras(reglamento), b = new Set(palabras(oferta));
  // Tolera abreviaturas y typos del PDF ("ADMINISTATIVO", "AMBIENTE" por "MEDIO AMBIENTE").
  const hit = w => b.has(w) || [...b].some(x => x.length > 4 && w.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))));
  return a.length ? a.filter(hit).length / a.length : 1;
}

export function validarOferta(cruda, ref) {
  const out = [];
  const error = msg => out.push({ tipo: 'error', msg });
  const aviso = msg => out.push({ tipo: 'aviso', msg });
  const porId = new Map(cruda.courses.map(c => [`${c.dep}-${c.code}`, c]));
  const deps = new Set(ref.departamentos.map(d => d.id));
  const pers = new Map(ref.periodos.map(p => [p.id, p]));

  // 1. Materias que el plan exige por nombre (principales, "elegí una", constitucional, Integración…).
  //    Si son alternativas ("elegí una" o dos opciones de constitucional), alcanza con que haya alguna.
  const grupo = m => `${m.rol}|${m.orientaciones.join(',')}`;
  const alternativas = new Map();
  for (const m of ref.materiasReglamento || []) {
    if (m.rol === 'elegir-uno' || m.rol === 'constitucional') {
      if (!alternativas.has(grupo(m))) alternativas.set(grupo(m), []);
      alternativas.get(grupo(m)).push(m);
    }
  }
  for (const ms of alternativas.values()) {
    if (ms.length > 1 && !ms.some(m => porId.has(m.id))) {
      error(`No se ofrece ninguna de las alternativas ${ms.map(m => `${m.id} "${m.nombre}"`).join(' / ')}`);
    }
  }
  for (const m of ref.materiasReglamento || []) {
    const c = porId.get(m.id);
    const quien = m.orientaciones.length ? ` (${m.rol} de ${m.orientaciones.join(', ')})` : '';
    const opcional = (alternativas.get(grupo(m)) || []).length > 1;
    if (!c && opcional) {
      aviso(`No se ofrece ${m.id} "${m.nombre}"${quien}; los alumnos pueden elegir la otra opción`);
      continue;
    }
    if (!c) {
      // ¿Cambió el código? Buscar una materia con el mismo nombre.
      const cand = cruda.courses.filter(x => parecido(m.nombre, x.name) >= 0.85 && palabras(x.name).length <= palabras(m.nombre).length + 2);
      error(`Falta ${m.id} "${m.nombre}"${quien} en la oferta` +
        (cand.length ? `. ¿Cambió el código? Hay: ${cand.map(x => `${x.dep}-${x.code} "${x.name}"`).join('; ')}` : ''));
      continue;
    }
    if (parecido(m.nombre, c.name) < 0.6) {
      error(`${m.id} en la oferta se llama "${c.name}", pero el reglamento espera "${m.nombre}"${quien}. ¿Cambió el código?`);
    }
    for (const p of c.periods) {
      if (p.pts !== m.puntos) error(`${m.id} "${m.nombre}" vale ${m.puntos} puntos según el reglamento, pero en la oferta se dicta en ${p.label} (${p.pts} puntos)`);
    }
  }

  // 2. Departamentos que el plan exige y tienen que tener cursos (Sociales, Filosofía, Procesal,
  //    Métodos alternativos e Insolvencia).
  for (const d of ref.departamentosRequeridos || []) {
    if (!cruda.courses.some(c => c.dep === d)) error(`No hay ningún curso del departamento ${d}, que el reglamento exige`);
  }

  // 3. Coherencia general.
  for (const c of cruda.courses) {
    const id = `${c.dep}-${c.code}`;
    if (!deps.has(c.dep)) error(`${id}: departamento desconocido`);
    for (const p of c.periods) {
      const pr = pers.get(p.id);
      if (!pr) { error(`${id}: período desconocido ${p.id}`); continue; }
      if (p.pts !== pr.puntos) error(`${id}: ${p.id} debería valer ${pr.puntos} puntos y vale ${p.pts}`);
      if (!p.coms.length) error(`${id}: ${p.id} sin comisiones`);
    }
  }
  for (const [id, tema] of Object.entries(ref.temaClave || {})) {
    if (!cruda.courses.some(c => (c.tema || []).some(t => norm(t) === norm(tema))) && porId.has(id)) {
      aviso(`Ningún curso de Empresarial tiene la temática "${tema}" (se usa para los derivados de esa orientación)`);
    }
  }
  return out;
}
