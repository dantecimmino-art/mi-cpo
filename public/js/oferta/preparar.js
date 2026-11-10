// Proceso completo de una oferta, sin escribir nada: lo usan la pantalla de administración
// (public/3816.html) y los scripts de terminal, así ambos hacen exactamente lo mismo.
//
//   tablas del PDF ──interpretar──► oferta cruda ──validar contra el reglamento──► informe
//                                        └──aColecciones──► materias/profesores/cursos ──compilarFoto──► foto
import { interpretar } from './pdf-oferta.js';
import { validarOferta } from './validar.js';
import { aColecciones, compilarFoto } from './modelo.js';

// Reglamento armado desde las colecciones de Firestore (mismo formato que data/referencia.json).
export function referenciaDesdeColecciones({ departamentos, periodos, obligatorias, orientaciones, materiasReglamento, general }) {
  const lista = obj => Object.entries(obj || {}).map(([id, d]) => ({ id, ...d })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const limpio = ({ actualizadoEn, ...d }) => d;
  return {
    departamentos: lista(departamentos).map(limpio),
    periodos: lista(periodos).map(limpio),
    obligatorias: lista(obligatorias).map(limpio),
    orientaciones: lista(orientaciones).map(limpio),
    materiasReglamento: lista(materiasReglamento).map(limpio),
    materiasReservadas: (general && general.materiasReservadas) || [],
    temaClave: (general && general.temaClave) || {},
    departamentosRequeridos: (general && general.departamentosRequeridos) || [],
  };
}

// Lo que va en config/reglamento (las partes del reglamento que no son una colección propia).
export const reglamentoGeneral = ref => ({
  materiasReservadas: ref.materiasReservadas || [],
  temaClave: ref.temaClave || {},
  departamentosRequeridos: ref.departamentosRequeridos || [],
});

/**
 * @param raw  {titulo, eventos} de extraerTablas()
 * @returns {ofertaId, titulo, filas, cruda, informe, errores, avisos, col}
 */
export function prepararOferta(raw, ref, { fuente = '', ofertaId: forzarId = null } = {}) {
  const r = interpretar(raw, ref.periodos, { fuente });
  const ofertaId = forzarId || r.ofertaId;
  const cruda = { ...r.cruda, fuente, titulo: r.titulo };
  const informe = [...r.avisos, ...validarOferta(cruda, ref)];
  if (!/^\d{4}-[12]$/.test(String(ofertaId))) informe.unshift({ tipo: 'error', msg: `No se pudo saber el año y el período lectivo del PDF ("${r.titulo}")` });
  const errores = informe.filter(x => x.tipo === 'error');
  let col = null;
  if (/^\d{4}-[12]$/.test(String(ofertaId))) {
    try { col = aColecciones(cruda, ref, ofertaId); } catch (e) { errores.push({ tipo: 'error', msg: e.message }); informe.push(errores[errores.length - 1]); }
  }
  return { ofertaId, titulo: r.titulo, filas: r.filas, cruda, informe, errores, avisos: informe.filter(x => x.tipo !== 'error'), col };
}

/**
 * Compila la foto que lee la app a partir de las colecciones de ESTA oferta.
 * Las materias reservadas y con temática clave se marcan desde el reglamento aunque no se
 * dicten en esta oferta (igual que hace scripts/publicar.mjs leyendo Firestore).
 * @param sha256hex  async (texto) => hash hex (crypto de Node o crypto.subtle del navegador)
 */
export async function compilarPublicacion(col, ofertaId, ref, sha256hex) {
  const materias = {};
  for (const id of ref.materiasReservadas || []) materias[id] = { reservada: true };
  for (const [id, tema] of Object.entries(ref.temaClave || {})) materias[id] = { ...(materias[id] || {}), temaClave: tema };
  Object.assign(materias, col.materias);
  const foto = compilarFoto({ ...col, materias }, ofertaId);
  const json = JSON.stringify({ courses: foto.courses, ref: foto.ref, oferta: foto.oferta, anio: foto.anio, semestre: foto.semestre });
  const version = 'v-' + (await sha256hex(json)).slice(0, 12);
  return { foto, json, version, bytes: new TextEncoder().encode(json).length };
}
