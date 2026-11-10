// Extrae, en orden, los títulos de sección y las filas de las tablas del PDF de oferta del CPO,
// usando pdf.js (corre igual en el navegador del admin y en Node para los tests).
//
// La tabla se reconstruye con
// los bordes dibujados en el PDF, así las celdas de varias líneas no se mezclan entre filas.
//
// Salida: {titulo, eventos: [{t:'seccion', texto} | {t:'fila', celdas:[...], pagina}]}

// Normaliza espacios y guiones tipográficos (‐ ‑ ‒ – — −) al guion común: según cómo se exporte
// el PDF, la Facultad usa uno u otro en "205 (PRI) - DERECHO ROMANO" y en los horarios.
const limpiar = s => String(s || '').replace(/[‐-―−­]/g, '-').replace(/\s+/g, ' ').trim();
const RE_FILA = /^(PRIMER|SEGUNDO|TERCER|CUARTO)\s+(CUATRIMESTRE|BIMESTRE|TRIMESTRE|MENSUAL)\b/i;
const mult = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const punto = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// Agrupa valores cercanos (bordes dibujados dos veces, redondeos).
function agrupar(vals, tol) {
  const out = [];
  for (const v of [...vals].sort((a, b) => a - b)) {
    if (out.length && v - out[out.length - 1] <= tol) continue;
    out.push(v);
  }
  return out;
}

// Rectángulos (bordes de celda) de una página, en coordenadas de pantalla (origen arriba a la
// izquierda, con la rotación de la página aplicada).
async function bordes(page, OPS, vt) {
  const ol = await page.getOperatorList();
  let ctm = vt.slice();
  const pila = [], rects = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (fn === OPS.save) pila.push(ctm);
    else if (fn === OPS.restore) ctm = pila.pop() || vt.slice();
    else if (fn === OPS.transform) ctm = mult(ctm, args);
    else if (fn === OPS.constructPath) {
      const [ops, coords] = args;
      let k = 0, x = 0, y = 0, poly = [];
      const cerrarPoly = () => {
        if (poly.length >= 3) {
          const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
          rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
        }
        poly = [];
      };
      for (const op of ops) {
        if (op === OPS.rectangle) {
          const [rx, ry, w, h] = coords.slice(k, k + 4); k += 4;
          const a = punto(ctm, rx, ry), b = punto(ctm, rx + w, ry + h);
          rects.push([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
        } else if (op === OPS.moveTo) { cerrarPoly(); [x, y] = coords.slice(k, k + 2); k += 2; poly.push(punto(ctm, x, y)); }
        else if (op === OPS.lineTo) { [x, y] = coords.slice(k, k + 2); k += 2; poly.push(punto(ctm, x, y)); }
        else if (op === OPS.curveTo) k += 6;
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) k += 4;
        else if (op === OPS.closePath) cerrarPoly();
      }
      cerrarPoly();
    }
  }
  return rects; // [x0, top, x1, bottom]
}

// Tablas de la página: cada una con sus bordes de columna (xs) y de fila (ys).
function armarTablas(rects) {
  const verticales = rects.filter(r => r[2] - r[0] <= 2 && r[3] - r[1] > 10);
  const horizontales = rects.filter(r => r[3] - r[1] <= 2 && r[2] - r[0] > 10);
  // Las verticales de una misma tabla comparten el mismo alto.
  // (con tolerancia: el borde exterior a veces empieza medio punto antes).
  const grupos = [];
  for (const v of verticales) {
    const g = grupos.find(g => Math.abs(g.top - v[1]) <= 2 && Math.abs(g.bottom - v[3]) <= 2);
    if (g) g.vs.push(v); else grupos.push({ top: v[1], bottom: v[3], vs: [v] });
  }
  const tablas = [];
  for (const { vs } of grupos) {
    if (vs.length < 3) continue;
    const top = Math.min(...vs.map(v => v[1])), bottom = Math.max(...vs.map(v => v[3]));
    const xs = agrupar(vs.map(v => (v[0] + v[2]) / 2), 2);
    const x0 = xs[0], x1 = xs[xs.length - 1];
    const hs = horizontales.filter(h => h[0] <= x0 + 3 && h[2] >= x1 - 3 && h[1] >= top - 2 && h[3] <= bottom + 2);
    const ys = agrupar([top, bottom, ...hs.map(h => (h[1] + h[3]) / 2)], 1.5);
    tablas.push({ xs, ys, top, bottom, x0, x1 });
  }
  return tablas.sort((a, b) => a.top - b.top);
}

// Une fragmentos de texto en líneas (por renglón) y las líneas en un solo texto.
function textoDe(items) {
  const lineas = [];
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const l = lineas.find(l => Math.abs(l.y - it.y) <= Math.max(1.5, it.h * 0.4));
    if (l) l.items.push(it); else lineas.push({ y: it.y, items: [it] });
  }
  return lineas.sort((a, b) => a.y - b.y).map(l => {
    const its = l.items.sort((a, b) => a.x - b.x);
    let s = '', fin = null;
    for (const it of its) {
      if (fin !== null && it.x - fin > Math.max(0.8, it.h * 0.15) && !s.endsWith(' ') && !it.str.startsWith(' ')) s += ' ';
      s += it.str; fin = it.x + it.w;
    }
    return { y: l.y, texto: s };
  });
}

/**
 * @param pdf  documento de pdf.js (resultado de getDocument(...).promise)
 * @param OPS  pdfjsLib.OPS
 * @param onPagina  callback opcional de progreso (n, total)
 */
export async function extraerTablas(pdf, OPS, onPagina) {
  const eventos = [];
  let titulo = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vt = page.getViewport({ scale: 1 }).transform; // aplica rotación y da vuelta el eje y
    const tablas = armarTablas(await bordes(page, OPS, vt));
    const tc = await page.getTextContent();
    const items = tc.items
      .filter(it => it.str && it.str.trim())
      .map(it => {
        const m = mult(vt, it.transform);
        const h = Math.hypot(m[2], m[3]) || 8;
        const w = it.width * Math.hypot(vt[0], vt[1]);
        return { str: it.str, x: m[4], w, h, y: m[5] - h * 0.35 }; // centro aprox. del renglón
      });

    const celdas = new Map(); // "t:r:c" -> items
    const sueltos = [];
    for (const it of items) {
      const cx = it.x + Math.min(it.w, 4) / 2;
      const t = tablas.findIndex(tb => cx >= tb.x0 - 1 && cx <= tb.x1 + 1 && it.y >= tb.top - 1 && it.y <= tb.bottom + 1);
      if (t < 0) { sueltos.push(it); continue; }
      const tb = tablas[t];
      const c = tb.xs.findIndex((x, i) => i < tb.xs.length - 1 && cx >= x - 1 && cx < tb.xs[i + 1]);
      const r = tb.ys.findIndex((y, i) => i < tb.ys.length - 1 && it.y >= y && it.y < tb.ys[i + 1]);
      if (c < 0 || r < 0) { sueltos.push(it); continue; }
      const k = `${t}:${r}:${c}`;
      if (!celdas.has(k)) celdas.set(k, []);
      celdas.get(k).push(it);
    }

    // A veces la última fila de una tabla sale sin bordes dibujados: queda fuera de la tabla.
    // Si un renglón suelto empieza con un período ("SEGUNDO BIMESTRE ABOGACÍA 2025 ..."), es una
    // fila: se reparte en las columnas de la tabla más cercana de la página.
    const renglones = [];
    for (const it of [...sueltos].sort((a, b) => a.y - b.y)) {
      const r = renglones.find(r => Math.abs(r.y - it.y) <= Math.max(1.5, it.h * 0.4));
      if (r) r.items.push(it); else renglones.push({ y: it.y, items: [it] });
    }
    const orden = [];
    for (const r of renglones) {
      const texto = limpiar(textoDe(r.items).map(l => l.texto).join(' '));
      const tb = RE_FILA.test(texto) && tablas.length
        ? tablas.reduce((a, b) => (Math.abs(b.bottom - r.y) < Math.abs(a.bottom - r.y) ? b : a)) : null;
      if (!tb) { orden.push([r.y, 0, { t: 'seccion', texto }]); continue; }
      const cols = tb.xs.slice(0, -1).map(() => []);
      for (const it of r.items) {
        const cx = it.x + Math.min(it.w, 4) / 2;
        let c = tb.xs.findIndex((x, i) => i < tb.xs.length - 1 && cx >= x - 1 && cx < tb.xs[i + 1]);
        if (c < 0) c = cx < tb.x0 ? 0 : cols.length - 1;
        cols[c].push(it);
      }
      orden.push([r.y, 1, { t: 'fila', celdas: cols.map(its => limpiar(textoDe(its).map(l => l.texto).join(' '))), pagina: n }]);
    }
    tablas.forEach((tb, t) => {
      for (let r = 0; r < tb.ys.length - 1; r++) {
        const fila = [];
        for (let c = 0; c < tb.xs.length - 1; c++) {
          const its = celdas.get(`${t}:${r}:${c}`) || [];
          fila.push(limpiar(textoDe(its).map(l => l.texto).join(' ')));
        }
        if (fila.some(Boolean)) orden.push([tb.ys[r], 1, { t: 'fila', celdas: fila, pagina: n }]);
      }
    });
    orden.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, , ev] of orden) {
      if (!ev.texto && ev.t === 'seccion') continue;
      if (ev.t === 'seccion' && !titulo && /PER[IÍ]ODO/i.test(ev.texto) && /LECTIVO/i.test(ev.texto)) { titulo = ev.texto; continue; }
      eventos.push(ev);
    }
    if (onPagina) onPagina(n, pdf.numPages);
    page.cleanup();
  }
  return { titulo, eventos };
}
