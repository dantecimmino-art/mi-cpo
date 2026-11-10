// Modelo de datos del catálogo: conversión entre
//   (a) la oferta "cruda" (lo que sale del PDF, ver scripts/lib/pdf-oferta.mjs),
//   (b) las colecciones granulares de Firestore (fuente de verdad, consultables), y
//   (c) la "foto" compilada que lee el navegador (1-2 lecturas por visita).
//
// Son funciones puras (sin Firestore) para poder testearlas offline.
//
// Colecciones:
//   departamentos/{PRI}                        nombre, orden
//   periodos/{PCUA}                            nombre, nombreCorto, tipo, semestre, puntos, mesInicio, mesFin, orden
//   obligatorias/{DIP}                         nombre, horas, puntos, orden
//   orientaciones/{pri}                        nombre, principales[], gruposElegirUno[{materias[]}],
//                                              deptosDerivados[], deptosLibres[], constitucional[], orden
//   ofertas/{2026-1}                           una por período lectivo: nombre, anio, semestre, estado,
//                                              vigente, version, totales. La app lee SOLO las vigentes.
//   ofertas/{2026-1}/fotos/{version}           foto compilada {json} (cursos + reglamento) que pinta la app
//   materias/{PRI-205}                         asignatura: código, nombre, departamento, modalidades, temas…
//   profesores/{lococo-julio}                  nombre, materias[], ofertas[], cantidad de cursos
//   cursos/{2026-1_PRI-205_PCUA_0620}          comisión dictada: oferta, materia, período, comisión,
//                                              modalidad, profesor, horario[{dia,desde,hasta}], dias[], turnos[]

export const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const slug = s => norm(s).replace(/ /g, '-') || 'sin-nombre';

export const DIAS = { Lun: 1, Mar: 2, Mie: 3, 'Mié': 3, Jue: 4, Vie: 5, Sab: 6, 'Sáb': 6, Dom: 7 };
const MODALIDAD = { P: 'presencial', R: 'remota' };
const MODALIDAD_COD = { presencial: 'P', remota: 'R' };
// Igual que turnoOf() en app.js: mañana < 13 h, tarde 13–18 h, noche ≥ 18 h.
export const turnoDe = minutos => (minutos < 13 * 60 ? 'M' : minutos < 18 * 60 ? 'T' : 'N');
const aMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export const cursoId = (ofertaId, materiaId, periodoId, comision) => `${ofertaId}_${materiaId}_${periodoId}_${comision}`;

// "Lun 07:00–08:30 · Jue 07:00–08:30" -> [{dia:1, diaNombre:'Lun', desde:'07:00', hasta:'08:30', desdeMin, hastaMin}, …]
export function parseHorario(texto) {
  const out = [];
  for (const parte of String(texto || '').split(' · ')) {
    const m = parte.match(/^(\S+) (\d\d:\d\d)–(\d\d:\d\d)$/);
    if (!m || !DIAS[m[1]]) continue;
    out.push({ dia: DIAS[m[1]], diaNombre: m[1], desde: m[2], hasta: m[3], desdeMin: aMin(m[2]), hastaMin: aMin(m[3]) });
  }
  return out;
}

// "2026-1" -> "Primer período lectivo 2026"
export const nombreOferta = id => {
  const [anio, sem] = String(id).split('-');
  return sem ? `${sem === '1' ? 'Primer' : 'Segundo'} período lectivo ${anio}` : `Oferta ${anio}`;
};

/** (a) oferta cruda + referencia  ->  (b) colecciones granulares */
export function aColecciones(cruda, ref, ofertaId) {
  const dep = Object.fromEntries(ref.departamentos.map(d => [d.id, d]));
  const per = Object.fromEntries(ref.periodos.map(p => [p.id, p]));
  const reservadas = new Set(ref.materiasReservadas || []);
  const sinId = ({ id, ...resto }) => resto;

  const materias = {}, profesores = {}, cursos = {};
  cruda.courses.forEach((c, orden) => {
    const materiaId = `${c.dep}-${c.code}`;
    if (!dep[c.dep]) throw new Error(`Departamento desconocido "${c.dep}" en ${materiaId}`);
    materias[materiaId] = {
      codigo: c.code,
      nombre: c.name,
      nombreNorm: norm(c.name),
      departamentoId: c.dep,
      departamentoNombre: dep[c.dep].nombre,
      modalidades: c.mods || [],
      temas: c.tema || [],
      interdisciplinaria: !!c.intdp,
      reservada: reservadas.has(materiaId),
      temaClave: (ref.temaClave || {})[materiaId] || null,
      periodos: c.periods.map(p => p.id),
      ofertas: [ofertaId],
      orden,
      // Lo que depende de la oferta (una materia puede estar en varias): la foto de cada oferta usa esto.
      porOferta: {
        [ofertaId]: { nombre: c.name, periodos: c.periods.map(p => p.id), modalidades: c.mods || [], temas: c.tema || [], interdisciplinaria: !!c.intdp, orden },
      },
    };
    c.periods.forEach((p, ordenPeriodo) => {
      if (!per[p.id]) throw new Error(`Período desconocido "${p.id}" en ${materiaId}`);
      p.coms.forEach(([comision, mod, profesor, horarioTexto], ordenComision) => {
        const profesorId = slug(profesor);
        const horario = parseHorario(horarioTexto);
        const pr = profesores[profesorId] ||= { nombre: profesor, nombreNorm: norm(profesor), materias: [], ofertas: [ofertaId], cursos: 0 };
        if (!pr.materias.includes(materiaId)) pr.materias.push(materiaId);
        pr.cursos++;
        cursos[cursoId(ofertaId, materiaId, p.id, comision)] = {
          ofertaId,
          materiaId,
          materiaNombre: c.name,
          departamentoId: c.dep,
          periodoId: p.id,
          semestre: per[p.id].semestre,
          puntos: p.pts,
          comision,
          modalidad: MODALIDAD[mod] || mod,
          profesorId,
          profesorNombre: profesor,
          horario,
          horarioTexto,
          dias: [...new Set(horario.map(h => h.dia))],
          turnos: [...new Set(horario.map(h => turnoDe(h.desdeMin)))],
          ordenPeriodo,
          ordenComision,
        };
      });
    });
  });

  const porId = lista => Object.fromEntries(lista.map(x => [x.id, sinId(x)]));
  return {
    departamentos: porId(ref.departamentos),
    periodos: porId(ref.periodos),
    obligatorias: porId(ref.obligatorias),
    orientaciones: porId(ref.orientaciones),
    ofertas: {
      [ofertaId]: {
        nombre: nombreOferta(ofertaId),
        anio: Number(ofertaId.split('-')[0]),
        semestre: Number(ofertaId.split('-')[1]) || null,
        descripcion: cruda.oferta || '',
        estado: 'importada',
        materias: Object.keys(materias).length,
        cursos: Object.keys(cursos).length,
        profesores: Object.keys(profesores).length,
      },
    },
    materias, profesores, cursos,
  };
}

/** (b) colecciones granulares  ->  (c) foto compilada que consume app.js */
export function compilarFoto(col, ofertaId) {
  const oferta = col.ofertas[ofertaId];
  if (!oferta) throw new Error(`No existe la oferta ${ofertaId}`);
  const cursos = Object.values(col.cursos).filter(c => c.ofertaId === ofertaId);

  const porMateria = new Map();
  for (const c of cursos) {
    if (!porMateria.has(c.materiaId)) porMateria.set(c.materiaId, new Map());
    const pm = porMateria.get(c.materiaId);
    if (!pm.has(c.periodoId)) pm.set(c.periodoId, []);
    pm.get(c.periodoId).push(c);
  }

  // Datos de la materia en ESTA oferta (porOferta); los de primer nivel son de la última importación.
  const datos = id => { const m = col.materias[id]; return m && { ...m, ...((m.porOferta || {})[ofertaId] || {}) }; };
  const materiaIds = [...porMateria.keys()].sort((a, b) => (datos(a)?.orden ?? 1e9) - (datos(b)?.orden ?? 1e9));
  const courses = materiaIds.map(id => {
    const m = datos(id);
    if (!m) throw new Error(`Hay cursos de la materia ${id} pero no existe materias/${id}`);
    const periodos = [...porMateria.get(id).entries()]
      .sort((a, b) => a[1][0].ordenPeriodo - b[1][0].ordenPeriodo);
    return {
      dep: m.departamentoId,
      code: m.codigo,
      name: m.nombre,
      periods: periodos.map(([pid, cs]) => {
        cs.sort((a, b) => a.ordenComision - b.ordenComision);
        return {
          id: pid,
          label: col.periodos[pid].nombre,
          pts: cs[0].puntos,
          n: cs.length,
          coms: cs.map(c => [c.comision, MODALIDAD_COD[c.modalidad] || c.modalidad, c.profesorNombre, c.horarioTexto]),
        };
      }),
      mods: m.modalidades,
      tema: m.temas,
      intdp: m.interdisciplinaria,
    };
  });

  const ordenar = obj => Object.entries(obj).sort((a, b) => (a[1].orden ?? 0) - (b[1].orden ?? 0));
  const periodos = ordenar(col.periodos);
  const ref = {
    DEPN: Object.fromEntries(ordenar(col.departamentos).map(([id, d]) => [id, d.nombre])),
    PERLBL: Object.fromEntries(periodos.map(([id, p]) => [id, p.nombreCorto])),
    PSEM: Object.fromEntries(periodos.map(([id, p]) => [id, p.semestre])),
    PSPAN: Object.fromEntries(periodos.map(([id, p]) => [id, [p.mesInicio, p.mesFin]])),
    TEMA: Object.fromEntries(Object.entries(col.materias).filter(([, m]) => m.temaClave).map(([id, m]) => [id, m.temaClave])),
    RESERVED: Object.entries(col.materias).filter(([, m]) => m.reservada).map(([id]) => id).sort(),
    OBLIG: ordenar(col.obligatorias).map(([id, o]) => [id, o.nombre, o.horas, o.puntos]),
    ORI: Object.fromEntries(ordenar(col.orientaciones).map(([id, o]) => [id, {
      n: o.nombre,
      fx: o.principales,
      ch: (o.gruposElegirUno || []).map(g => g.materias),
      dd: o.deptosDerivados,
      ld: o.deptosLibres,
      co: o.constitucional,
    }])),
  };

  return { ofertaId, anio: oferta.anio || null, semestre: oferta.semestre || null, oferta: oferta.descripcion || '', courses, ref };
}
