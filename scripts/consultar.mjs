// Consultas de ejemplo sobre las colecciones (sirven de referencia para el back).
//
//   node scripts/consultar.mjs --project mi-cpo materia PRI-205
//   node scripts/consultar.mjs --project mi-cpo profesor "lococo"
//   node scripts/consultar.mjs --project mi-cpo departamento PRI --periodo SCUA
//   node scripts/consultar.mjs --project mi-cpo dia 6 --turno N          (6 = sábado)
//   node scripts/consultar.mjs --project mi-cpo orientacion pen
//
// Opcional: --oferta 2026-1 (por defecto, la vigente más reciente).
import { args, conectar } from './lib/firestore.mjs';
import { norm, turnoDe } from '../public/js/oferta/modelo.js';

const o = args();
const [cmd, valor] = o._;
const db = conectar(o.project);
const vigentes = (await db.collection('ofertas').where('vigente', '==', true).get()).docs.map(d => d.id).sort(); // debería ser una sola
const ofertaId = String(o.oferta || vigentes[vigentes.length - 1] || '');
if (!ofertaId) { console.log('No hay ofertas vigentes; pasá --oferta 2026-1'); process.exit(1); }
const DIA = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const fila = c => `  ${c.periodoId.padEnd(5)} com. ${c.comision}  ${c.modalidad.padEnd(10)} ${c.profesorNombre.padEnd(28)} ${c.horario.map(h => `${DIA[h.dia]} ${h.desde}–${h.hasta}`).join(' · ')}`;
const docs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));

if (cmd === 'materia') {
  // materias/{id} + sus cursos en la oferta, ordenados por período y comisión.
  const m = await db.doc(`materias/${valor}`).get();
  if (!m.exists) { console.log('No existe la materia', valor); process.exit(1); }
  const cs = docs(await db.collection('cursos')
    .where('ofertaId', '==', ofertaId).where('materiaId', '==', valor)
    .orderBy('periodoId').orderBy('comision').get());
  console.log(`${valor} · ${m.data().nombre} · ${m.data().departamentoNombre} · ${cs.length} cursos en ${ofertaId}`);
  cs.forEach(c => console.log(fila(c)));

} else if (cmd === 'profesor') {
  // Búsqueda por prefijo sobre nombreNorm (apellido primero), luego sus cursos.
  const p = norm(valor);
  const ps = docs(await db.collection('profesores').where('nombreNorm', '>=', p).where('nombreNorm', '<', p + '').limit(10).get());
  for (const pr of ps) {
    const cs = docs(await db.collection('cursos')
      .where('ofertaId', '==', ofertaId).where('profesorId', '==', pr.id).orderBy('periodoId').get());
    console.log(`${pr.nombre} (${pr.id}) · ${cs.length} cursos en ${ofertaId}`);
    cs.forEach(c => console.log(`  ${c.materiaId.padEnd(8)} ${c.materiaNombre.slice(0, 40).padEnd(40)}` + fila(c).slice(1)));
  }
  if (!ps.length) console.log('Ningún profesor empieza con', valor);

} else if (cmd === 'departamento') {
  let q = db.collection('cursos').where('ofertaId', '==', ofertaId).where('departamentoId', '==', valor);
  if (o.periodo) q = q.where('periodoId', '==', o.periodo);
  const cs = docs(await q.orderBy('materiaNombre').get());
  console.log(`${cs.length} cursos de ${valor}${o.periodo ? ' en ' + o.periodo : ''} (${ofertaId})`);
  cs.slice(0, 40).forEach(c => console.log(`  ${c.materiaNombre.slice(0, 40).padEnd(40)}` + fila(c).slice(1)));
  if (cs.length > 40) console.log(`  … y ${cs.length - 40} más`);

} else if (cmd === 'dia') {
  // Un solo array-contains por consulta: se filtra por día en Firestore y por turno en memoria.
  const d = Number(valor);
  const cs = docs(await db.collection('cursos')
    .where('ofertaId', '==', ofertaId).where('dias', 'array-contains', d).orderBy('periodoId').get())
    .filter(c => !o.turno || c.horario.some(h => h.dia === d && turnoDe(h.desdeMin) === o.turno));
  console.log(`${cs.length} cursos los ${DIA[d]}${o.turno ? ' turno ' + o.turno : ''} (${ofertaId})`);
  cs.slice(0, 40).forEach(c => console.log(`  ${c.materiaNombre.slice(0, 40).padEnd(40)}` + fila(c).slice(1)));
  if (cs.length > 40) console.log(`  … y ${cs.length - 40} más`);

} else if (cmd === 'orientacion') {
  const or = await db.doc(`orientaciones/${valor}`).get();
  if (!or.exists) { console.log('No existe la orientación', valor); process.exit(1); }
  // Materias que el reglamento exige para esta orientación + las comunes a todas (Integración).
  const d = or.data();
  const ROL = { principal: 'Principal (obligatoria)', 'elegir-uno': 'Elegí una de estas', 'derivado-obligatorio': 'Derivado obligatorio', constitucional: 'Constitucional (una de estas)', comun: 'Común a todas' };
  const propias = (await db.collection('materiasReglamento').where('orientaciones', 'array-contains', valor).get()).docs;
  const comunes = (await db.collection('materiasReglamento').where('rol', '==', 'comun').get()).docs;
  const regla = [...propias, ...comunes].map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.orden - b.orden);
  console.log(`${d.nombre} (oferta ${ofertaId})\n  Derivados en: ${d.deptosDerivados.join(', ')} · Libres en: ${d.deptosLibres.join(', ')}`);
  let rolActual = null;
  for (const m of regla) {
    if (m.rol !== rolActual) {
      if (rolActual === 'derivado-obligatorio' && valor === 'pen') console.log('    (Teorías criminológicas si elegís Parte especial; Intro. a la parte especial si elegís Criminología)');
      rolActual = m.rol; console.log(`\n  ${ROL[m.rol] || m.rol}`);
    }
    const n = (await db.collection('cursos').where('ofertaId', '==', ofertaId).where('materiaId', '==', m.id).count().get()).data().count;
    console.log(`    ${m.id.padEnd(8)} ${m.nombre.slice(0, 60).padEnd(60)} ${String(m.puntos).padStart(2)} pts  ${n ? n + ' cursos' : 'NO SE OFRECE'}`);
  }
  const obl = (await db.collection('obligatorias').orderBy('orden').get()).docs;
  console.log('\n  Obligatorias del CPO (todas las orientaciones, no suman a los 69)');
  obl.forEach(x => console.log(`    ${x.id.padEnd(8)} ${x.data().nombre.padEnd(60)} ${x.data().horas}`));

} else {
  console.log('Comandos: materia <id> | profesor <texto> | departamento <id> [--periodo X] | dia <1-7> [--turno M|T|N] | orientacion <id>');
}
