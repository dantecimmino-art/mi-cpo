// Interpreta las tablas del PDF de oferta del CPO (extraídas por tablas-pdf.js)
// y las convierte al formato de oferta "cruda" que usa scripts/lib/modelo.mjs:
//   {schema, oferta, courses:[{dep, code, name, periods:[{id,label,pts,n,coms:[[com,'P'|'R',docente,horario]]}], mods, tema, intdp}]}
//
// Funciones puras: se testean en test/pdf-oferta.test.mjs.
import { norm } from './modelo.js';

// Títulos de sección del PDF → departamento. El orden importa: se toma la primera coincidencia.
// "Métodos alternativos" e "Insolvencia" vienen con código (PRC) pero el reglamento los trata como
// requisitos aparte (2 + 2 puntos dentro de Procesal), por eso son departamentos propios.
const SECCIONES = [
  ['metodos alternativos', 'MAR'],
  ['insolvencia', 'INS'],
  ['notarial', 'NOT'],
  ['tributario', 'TRI'],
  ['procesal', 'PRC'],
  ['filosofia', 'FIL'],
  ['ciencias sociales', 'SOC'],
  ['penal', 'PEN'],
  ['trabajo', 'TBJ'],
  ['economico', 'ECN'],
  ['publico', 'PUB'],
  ['privado', 'PRI'],
];

// Nombres que identifican cada área de Procesal (sobre el texto normalizado, sin acentos).
const AREA_INS = /\b(concurso|concursos|concursal|quiebra|quiebras|insolvencia)\b/;
const AREA_MAR = /\b(metodos alternativos|mediacion|negociacion|resolucion de conflictos|abordaje de conflictos)\b/;

export function seccionADepto(texto) {
  const t = norm(texto);
  const hit = SECCIONES.find(([k]) => t.includes(k));
  return hit ? hit[1] : null;
}

// "PRIMER CUATRIMESTRE ABOGACÍA 2026" → {periodoId:'PCUA', anio:2026}
export function periodoDe(celda, periodos) {
  const t = norm(celda);
  const p = periodos.find(x => t.startsWith(norm(x.nombre)));
  const anio = Number((t.match(/\b(20\d\d)\b/) || [])[1]) || null;
  return p ? { periodo: p, anio } : null;
}

// "205 (PRI) - DERECHO ROMANO *** _INTDP+B213 _ÁREA DAÑ" → {code, depCodigo, name, intdp, area, destacada}
const RE_ACT = /^([0-9A-Z]{3}) \(([A-Z]{3})\) - (.+)$/;
export function actividadDe(celda) {
  const m = String(celda || '').trim().match(RE_ACT);
  if (!m) return null;
  let resto = m[3];
  const intdp = /(_|\s)INTDP\b/i.test(resto); // a veces viene sin el guion bajo
  const area = (resto.match(/_ÁREA\s+([A-ZÁÉÍÓÚÑ]+)/i) || [])[1] || null;
  const destacada = /\*\*\*/.test(resto);
  resto = resto
    .replace(/(_|\s)INTDP(\+[A-Z]+\d+)?\b/gi, ' ')
    .replace(/_ÁREA\s+[A-ZÁÉÍÓÚÑ]+/gi, ' ')
    .replace(/\*\*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.,;:-]+$/, s => (s.trim() === '.' ? '.' : ''));
  return { code: m[1], depCodigo: m[2], name: resto, intdp, area: area ? area.toUpperCase() : null, destacada };
}

// "Lun 07:00 a 08:30 - Jue 07:00 a 08:30" → "Lun 07:00–08:30 · Jue 07:00–08:30"
const RE_SEG = /([A-Za-zÁÉÍÓÚáéíóú]{3}) (\d\d:\d\d) a (\d\d:\d\d)/g;
export function horarioDe(celda) {
  const segs = [...String(celda || '').matchAll(RE_SEG)].map(m => `${m[1]} ${m[2]}–${m[3]}`);
  return segs.join(' · ');
}

// "NEGRO-GODIO LEOPOLDO" → "Negro-Godio Leopoldo"; "NEGRO - CROLLA MATÍAS" → "Negro-Crolla Matías"
export function docenteDe(celda) {
  return String(celda || '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-'(.])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

export const temaDe = celda => String(celda || '').replace(/^Temática\s*/i, '').trim();

/**
 * @param raw        salida de extraer_tablas.py: {titulo, eventos:[...]}
 * @param periodos   referencia.periodos
 * @returns {ofertaId, anio, semestre, titulo, cruda, filas, avisos}
 */
export function interpretar(raw, periodos, { fuente = '' } = {}) {
  const avisos = [];
  const avisar = (tipo, msg, fila) => avisos.push({ tipo, msg, ...(fila ? { pagina: fila.pagina } : {}) });

  let depto = null, cols = null, tituloSeccion = [];
  const filas = [], cruzadas = new Set();
  for (const ev of raw.eventos) {
    if (ev.t === 'seccion') {
      // Los títulos largos vienen partidos en varias líneas: se acumulan hasta la próxima tabla.
      tituloSeccion.push(ev.texto);
      const d = seccionADepto(tituloSeccion.join(' '));
      if (d) depto = d;
      continue;
    }
    tituloSeccion = [];
    const c = ev.celdas;
    if (/^per[ií]odo lectivo$/i.test(c[0])) { cols = c.map(x => norm(x)); continue; }
    if (!cols) { avisar('error', `Fila antes del encabezado de la tabla: ${c.join(' | ')}`, ev); continue; }
    const get = nombre => c[cols.indexOf(nombre)] ?? '';
    const per = periodoDe(get('periodo lectivo'), periodos);
    const act = actividadDe(get('actividad'));
    const com = get('comision');
    // El PDF de 2025-1 trae cruzados los títulos de las dos áreas de Procesal (Métodos alternativos
    // e Insolvencia): si el nombre de la materia es claramente de la otra área, manda el nombre.
    let dep = depto;
    if (act && (depto === 'MAR' || depto === 'INS')) {
      const n = norm(act.name), porNombre = AREA_INS.test(n) ? 'INS' : AREA_MAR.test(n) ? 'MAR' : null;
      if (porNombre && porNombre !== depto) {
        dep = porNombre;
        const k = `${act.code}|${depto}`;
        if (!cruzadas.has(k)) { cruzadas.add(k); avisar('aviso', `${act.code} "${act.name}" está bajo el título de ${depto} pero es de ${porNombre}: se usa ${porNombre} (títulos de sección cruzados en el PDF)`, ev); }
      }
    }
    const fila = { ...ev, depto: dep, per, act, com };
    if (!depto) { avisar('error', `Fila sin departamento (falta el título de sección): ${c.join(' | ')}`, ev); continue; }
    if (!per) { avisar('error', `Período desconocido "${get('periodo lectivo')}"`, ev); continue; }
    if (!act) { avisar('error', `Actividad con formato desconocido "${get('actividad')}"`, ev); continue; }
    if (!/^\d{4}$/.test(com)) { avisar('error', `Comisión inválida "${com}" en ${act.code}`, ev); continue; }
    const mod = norm(get('modalidad'));
    if (mod !== 'presencial' && mod !== 'remota') avisar('aviso', `Modalidad desconocida "${get('modalidad')}" en ${act.code} com. ${com}`, ev);
    const horario = horarioDe(get('horario'));
    if (!horario) avisar('aviso', `Sin horario: ${act.code} com. ${com}`, ev);
    if (!get('docente')) avisar('aviso', `Sin docente: ${act.code} com. ${com}`, ev);
    filas.push({
      ...fila,
      mod: mod === 'remota' ? 'R' : 'P',
      docente: docenteDe(get('docente')),
      horario,
      tema: temaDe(get('tematica')),
    });
  }

  // Oferta = año + semestre (un PDF por período lectivo).
  const anios = [...new Set(filas.map(f => f.per.anio).filter(Boolean))];
  const sems = [...new Set(filas.map(f => f.per.periodo.semestre))];
  if (!filas.length) avisar('error', 'No se encontró ninguna comisión válida en el PDF');
  else {
    if (anios.length !== 1) avisar('error', `El PDF mezcla años: ${anios.join(', ') || 'ninguno'}`);
    if (sems.length !== 1) avisar('error', `El PDF mezcla semestres: ${sems.join(', ')}`);
  }
  const anio = anios[0], semestre = sems[0];

  // Agrupar por materia (departamento de la sección + código) y período.
  const porMateria = new Map();
  const vistas = new Set();
  for (const f of filas) {
    const key = `${f.depto}-${f.act.code}`;
    const dup = `${key}|${f.per.periodo.id}|${f.com}`;
    if (vistas.has(dup)) { avisar('aviso', `Comisión repetida, se ignora: ${dup}`, f); continue; }
    vistas.add(dup);
    let m = porMateria.get(key);
    if (!m) {
      m = { dep: f.depto, code: f.act.code, name: f.act.name, periods: new Map(), mods: new Set(), tema: new Set(), intdp: false, nombres: new Set() };
      porMateria.set(key, m);
    }
    m.nombres.add(f.act.name);
    m.intdp = m.intdp || f.act.intdp;
    m.mods.add(f.mod === 'R' ? 'Remota' : 'Presencial');
    if (f.tema) m.tema.add(f.tema);
    if (f.act.depCodigo !== f.depto && !['MAR', 'INS'].includes(f.depto)) {
      avisar('aviso', `${f.act.code} figura como (${f.act.depCodigo}) dentro de la sección ${f.depto}`, f);
    }
    const pid = f.per.periodo.id;
    if (!m.periods.has(pid)) m.periods.set(pid, []);
    m.periods.get(pid).push([f.com, f.mod, f.docente, f.horario]);
  }

  const ordenPer = new Map(periodos.map(p => [p.id, p.orden]));
  const courses = [...porMateria.values()].map(m => {
    if (m.nombres.size > 1) {
      // Mismo código con nombres distintos: se usa el más largo (suele ser el completo).
      const ns = [...m.nombres].sort((a, b) => b.length - a.length);
      m.name = ns[0];
      avisar('aviso', `${m.dep}-${m.code} aparece con ${ns.length} nombres; se usa "${ns[0]}"`);
    }
    return {
      dep: m.dep, code: m.code, name: m.name,
      periods: [...m.periods.entries()]
        .sort((a, b) => ordenPer.get(a[0]) - ordenPer.get(b[0]))
        .map(([id, coms]) => {
          const p = periodos.find(x => x.id === id);
          return { id, label: p.nombre, pts: p.puntos, n: coms.length, coms };
        }),
      mods: [...m.mods].sort(),
      tema: [...m.tema].sort(),
      intdp: m.intdp,
    };
  });

  const semTxt = semestre === 1 ? 'primer' : 'segundo';
  return {
    ofertaId: `${anio}-${semestre}`,
    anio, semestre,
    titulo: raw.titulo || '',
    filas: filas.length,
    avisos,
    cruda: {
      schema: 1,
      oferta: `Oferta del ${semTxt} período lectivo ${anio}. Confirmá horarios y cupos en la Secretaría antes de anotarte.`,
      courses,
    },
  };
}
