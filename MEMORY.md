# MEMORY.md — Fixture del CPO (mi-cpo)

Memoria completa del proyecto para retomarlo desde otra PC / otra instancia de Claude Code sin
contexto previo. Leela entera antes de tocar nada. Última actualización: 13/11/2026.

---

## 1. Qué es

App web para alumnos de **Abogacía de la UBA (Facultad de Derecho)** que cursan el **CPO (Ciclo
Profesional Orientado), Plan 2004**. Cada alumno:

- elige su **orientación** (Privado, Penal, Empresarial, etc.),
- arma su plan con la **oferta de cursos del cuatrimestre** (que publica la Facultad en PDF),
- marca cada curso como "Lo pienso cursar" / "Lo estoy cursando" / "Aprobada",
- carga materias de **años anteriores**, Práctica Profesional, obligatorias e idioma,
- ve su **progreso hacia los 69 puntos** del CPO por bloque (principales, derivados, libres, etc.),
  calendario semanal, choques de horario, sugeridor, favoritos, comentarios de comisiones.

Los **admins** (la Secretaría / quien mantiene el fixture) usan una página aparte: **`/3816`**.

- Producción: **https://mi-cpo.web.app** (app) y **https://mi-cpo.web.app/3816** (administración).
- Repo: https://github.com/dantecimmino-art/mi-cpo
- Idioma de todo (UI, código, comentarios, commits, respuestas al usuario): **español rioplatense**.

---

## 2. Personas, cuentas y accesos (IMPORTANTE)

| Qué | Valor |
|---|---|
| Proyecto Firebase / GCP | **`mi-cpo`** (plan **Spark**, gratis: SIN Cloud Functions ni código de servidor) |
| Dueño del proyecto | **dantecimmino@gmail.com** |
| Usuario que trabaja con Claude | Germán (germanrepetto11@gmail.com). Habla en español informal, quiere que las cosas queden andando en producción |
| Admin de la app | `admins/TQNheZBEfcgzfXYTuEGv3MzDVCo2` = dantecimmino@gmail.com |
| Usuarios en Auth (a nov-2026) | dgcimmino@derecho.uba.ar, dantecimmino@gmail.com, germanrepetto11@gmail.com |
| Firestore | región `southamerica-east1` |

**Credenciales en la PC nueva:**

- **Firebase CLI**: `npx firebase login` con **dantecimmino@gmail.com** (o una cuenta con rol Editor/Owner en `mi-cpo`).
- **Scripts de terminal (Admin SDK)**: usan Application Default Credentials →
  `gcloud auth application-default login` con la cuenta dueña. Los scripts setean
  `GOOGLE_CLOUD_QUOTA_PROJECT=mi-cpo` solos.
- En la PC original el gcloud CLI tenía activa **otra** cuenta: no uses comandos `gcloud ...` que
  dependan de la cuenta activa; usá Firebase CLI y los scripts (ADC).
- Para dar admin a alguien: que entre una vez a la app con Google y después
  `npm run admin -- mi-cpo persona@gmail.com` (o `--remove`).

---

## 2.b Instalación en una PC nueva (paso a paso)

Versiones usadas en la PC original: **Node 22.14.0 / npm 10.9.2**, **Firebase CLI 14.12.1**,
**Google Cloud SDK 555.0.0**, Git 2.43, Windows 10 (Git Bash + PowerShell).

### 1) Programas

| Programa | Para qué | Windows (PowerShell) | macOS (Homebrew) |
|---|---|---|---|
| **Git** | clonar / pushear | `winget install Git.Git` | `brew install git` |
| **Node.js 22 LTS** (trae npm) | scripts, tests, Firebase CLI | `winget install OpenJS.NodeJS.LTS` | `brew install node@22` |
| **Firebase CLI** | deploy de Hosting y reglas | `npm install -g firebase-tools` | igual |
| **Google Cloud SDK (gcloud)** | credenciales ADC para los scripts Node | `winget install Google.CloudSDK` | `brew install --cask google-cloud-sdk` |
| **GitHub CLI** (opcional) | login/push a GitHub fácil | `winget install GitHub.cli` | `brew install gh` |
| **Java 17+** (opcional) | solo para emuladores de Firebase | `winget install EclipseAdoptium.Temurin.17.JDK` | `brew install --cask temurin@17` |
| **Microsoft Edge o Chrome** | probar la app (y pruebas headless) | ya viene en Windows | `brew install --cask google-chrome` |
| **Claude Code** | la otra instancia | `npm install -g @anthropic-ai/claude-code` | igual |

Después de instalar, **cerrar y abrir la terminal** para que tome el PATH. Verificar:
```bash
git --version && node --version && npm --version && firebase --version && gcloud --version
```

### 2) Proyecto
```bash
git clone https://github.com/dantecimmino-art/mi-cpo.git
cd mi-cpo
npm install          # firebase-admin, pdfjs-dist 4.10.38, cross-env (devDependencies)
npm test             # tienen que pasar los 25 tests
```
(Si no instalaste firebase-tools global, `npx firebase ...` también funciona.)

### 3) Logins (con la cuenta dueña del proyecto o una con permisos en `mi-cpo`)
```bash
firebase login                               # abre el navegador → dantecimmino@gmail.com
firebase projects:list                       # tiene que aparecer mi-cpo
gcloud auth application-default login        # ADC para scripts/*.mjs (Admin SDK) → misma cuenta
gh auth login                                # o Git Credential Manager al primer push
```
- `.firebaserc` ya apunta a `mi-cpo` (default), así que `--project mi-cpo` es redundante pero explícito.
- Si los scripts dan error de cuota/proyecto: `gcloud auth application-default set-quota-project mi-cpo`.
- **No hace falta** `gcloud config set account` ni `gcloud init` para este proyecto; solo ADC.
- Para que la cuenta propia (p. ej. germanrepetto11@gmail.com) pueda deployar sin usar la de Dante:
  Dante la agrega como **Editor** en Firebase Console → Configuración del proyecto → Usuarios y permisos.

### 4) Prueba rápida de que todo anda
```bash
npm run consultar -- --project mi-cpo orientacion pri      # lee Firestore con ADC
firebase hosting:channel:list --project mi-cpo             # Firebase CLI autenticado
```

---

## 3. Reglas de negocio que NO cambian (instrucción explícita del usuario)

> "ESTO NO CAMBIA. Para armar las ofertas SIEMPRE tiene que respetarse esto. Las materias que te
> dicen obligatoria para cada una de las orientaciones SIEMPRE van a estar en el PDF de ofertas que
> te voy a ir pasando cuatrimestre a cuatrimestre."

El **reglamento del Plan 2004** (`data/reglamento/plan-2004.pdf`) es fijo. Está modelado en
`data/referencia.json` y cargado en Firestore (colecciones de reglamento, ver §5). Toda oferta nueva
se **valida contra el reglamento** antes de publicarse (`public/js/oferta/validar.js`):

- cada materia exigida (`materiasReglamento`) tiene que estar en la oferta, con nombre parecido y
  los puntos del plan (si falta, sugiere que pudo cambiar el código);
- de los grupos "elegí uno" y de Constitucional (2 opciones) tiene que haber al menos una;
- tiene que haber cursos de los departamentos obligatorios: SOC, FIL, PRC, MAR, INS;
- los puntos por período tienen que ser coherentes.

**Estructura del CPO (69 puntos):**

| Bloque (id en app.js) | Puntos | Regla |
|---|---|---|
| Principales (`op`) | 12 | cursos principales de la orientación; algunos grupos "elegí uno" |
| Derivados (`od`) | 8 | de los deptos derivados de la orientación. Penal: 2 obligatorios según el principal optativo (5X7→5X8, 5X6→5X9). Trabajo: TBJ-512 obligatorio (4). Empresarial: 2+2 pts de temas de los 2 principales optativos no cursados |
| Libres (`lb`) | 8 | de los deptos libres, **al menos 2 departamentos** |
| Constitucional profundizado (`co`) | 4 | la/s materia/s de Público que corresponda a la orientación |
| Integración (`in`) | 4 | PUB-66U |
| Ciencias Sociales (`so`) | 4 | depto SOC |
| Filosofía (`fi`) | 4 | depto FIL |
| Procesal (`pr`) | 6 | 2 en Métodos alternativos (MAR) + 2 en Insolvencia (INS) + 2 en otro de PRC. **Excepción Tributario** (pedido del usuario, 13/11/2026): los 2 de Insolvencia tienen que ser **Concursos (INS-968)** → ranura "Concursos" (`esConcursos` en app.js) y `materiasReglamento/INS-968` rol `procesal-obligatorio` |
| Práctica Profesional (`pp`) | 19 | carga manual (no está en el PDF) |
| Obligatorias (`ob`) | 22 aparte | 5 cuatrimestrales: DIP, SCC, DFS, FPT, DIPR (no suman a los 69) |
| Idioma (`id`) | aparte | lecto-comprensión |

Orientaciones: `adm` Público·Administrativo, `dip` Público·Internacional Público, `pri` Privado,
`not` Notarial, `emp` Empresarial, `tri` Tributario, `pen` Penal, `tbj` Trabajo y Seguridad Social.

Períodos: PCUA/SCUA (cuatrimestre, 4 pts), PBIM/SBIM/TBIM/CBIM (bimestre, 2), PTRI/STRI (trimestre,
3), PMEN/SMEN (mensual, 1). Semestre 1 = primer período lectivo, 2 = segundo.
Límite de cursada: máx. 16 pts cursando por cuatrimestre y 8 por bimestre.

---

## 4. Arquitectura

```
Firebase Hosting (public/)          Firestore                          Auth (solo Google)
 ├─ index.html + js/runtime.js  ──► ofertas/{vigente}/fotos/{ver}  ◄── js/app.js (plan del alumno)
 │   + js/app.js                    plans/{uid}, users/{uid}, comments/{uid}, config/main
 └─ 3816.html + js/admin.js     ──► escribe ofertas, materias, profesores, cursos, fotos, config
      + js/admin-alumnos.js         lee plans (todos), users
      + js/oferta/* + vendor/pdfjs
scripts/*.mjs (Node, Admin SDK) ──► mismo proceso que /3816 desde la terminal
```

- **Sin backend** (plan Spark): todo lo pesado (leer el PDF, validar, compilar) corre **en el
  navegador del admin**. El mismo código ESM (`public/js/oferta/`) lo usan la web y los scripts Node.
- La app es la versión migrada de un HTML único (`legacy/Fixture-CPO.html`, referencia histórica,
  no se sirve).
- **app.js es un script clásico** (no módulo): sus `const` de nivel superior son globales
  (`S`, `UI`, `ENV`, `BL`, `byKey`, `ORI`, `render`, `canPick`, `segsOf`, `totals`, ...). Lo carga
  `runtime.js` recién cuando hay sesión y catálogo (`window.CATALOG`).
- `runtime.js` expone `window.RT` (auth, db, `profiles`, `ofertasAnteriores`, `materiasAnteriores`).

### Archivos

| Ruta | Qué es |
|---|---|
| `public/index.html` | app de alumnos (HTML + todo el CSS) |
| `public/js/runtime.js` | Firebase, login Google, carga de la oferta vigente (`loadCatalog`), ofertas anteriores, perfil `users/{uid}` |
| `public/js/app.js` | toda la lógica y UI del alumno (~1350 líneas, estilo compacto) |
| `public/3816.html` | administración (pestañas Ofertas · Alumnos · Avisos y fechas). `noindex`. Antes era `/admin` (ya no existe) |
| `public/js/admin.js` | pestaña Ofertas: subir PDF → validar → publicar; activar la vigente; pestañas |
| `public/js/admin-alumnos.js` | pestañas Alumnos (stats, tabla, CSV, demanda) y Avisos y fechas (`config/main`) |
| `public/js/oferta/tablas-pdf.js` | PDF → tablas con pdf.js (reconstruye celdas con los bordes dibujados) |
| `public/js/oferta/pdf-oferta.js` | tablas → oferta "cruda" (`interpretar`) |
| `public/js/oferta/validar.js` | control contra el reglamento |
| `public/js/oferta/modelo.js` | `aColecciones` (cruda → colecciones) y `compilarFoto` (colecciones → foto para la app) |
| `public/js/oferta/preparar.js` | orquesta para el admin: `prepararOferta`, `compilarPublicacion`, `referenciaDesdeColecciones` |
| `public/vendor/pdfjs-4.10.38/` | pdf.js copiado de node_modules (`.mjs` renombrado a `.js` por el MIME de Hosting) |
| `scripts/importar.mjs` | PDF/JSON → valida → escribe ofertas/materias/profesores/cursos. `--reglamento` además pisa el reglamento con data/referencia.json |
| `scripts/publicar.mjs` | compila la foto y activa (`--activar` solo activa, `--sin-activar` publica sin activar) |
| `scripts/consultar.mjs` | consultas: `materia PRI-205`, `profesor`, `departamento`, `dia`, `orientacion pri` |
| `scripts/set-admin.mjs` | da/quita admin por email |
| `data/referencia.json` | reglamento Plan 2004 modelado (fuente para `--reglamento`) |
| `data/ofertas/*.pdf/json` | PDFs de oferta y su versión cruda (2025-1, 2026-1; 2026-2 sale del fixture legacy, no hay PDF) |
| `test/*.test.mjs` | `npm test` (node --test): 25 tests, incluye PDF real → JSON y foto admin == foto CLI |
| `firestore.rules`, `firestore.indexes.json`, `firebase.json` | reglas, índices, hosting/headers |
| `docs/ARQUITECTURA.md`, `README.md` | documentación (más corta que este archivo) |

---

## 5. Modelo de datos (Firestore)

### Reglamento (fuente de verdad; la app no lo escribe)
- `departamentos/{PRI…}` `{nombre, orden}`
- `periodos/{PCUA…}` `{nombre, nombreCorto, tipo, semestre, puntos, mesInicio, mesFin, orden}`
- `obligatorias/{DIP…}` `{nombre, horas, puntos, orden}`
- `orientaciones/{pri…}` `{nombre, principales[], gruposElegirUno[[]], deptosDerivados[], deptosLibres[], constitucional[], orden}`
- `materiasReglamento/{PRI-205…}` `{nombre, puntos, rol: principal|elegir-uno|derivado-obligatorio|constitucional|comun|procesal-obligatorio, orientaciones[], orden}` (42; INS-968 Concursos es `procesal-obligatorio` de `tri`)
- `config/reglamento` `{materiasReservadas, temaClave, departamentosRequeridos}`

Para ver las obligatorias de una orientación: `orientaciones/{id}.principales` + `materiasReglamento`
filtrando por `orientaciones` contiene el id; o `npm run consultar -- --project mi-cpo orientacion pri`.

### Oferta
- `ofertas/{YYYY-S}` (ej. `2026-1`): `{nombre, anio, semestre, vigente, version, previous, estado (importada|publicada|reemplazada|retirada), fuente, avisos[], materias, cursos, profesores, publicadaEn/Por, activadaEn/Por, reemplazadaPor}`
- `ofertas/{id}/fotos/{v-<12 hex>}` `{json, materias, creadoEn}`: **foto compilada** = `JSON.stringify({courses, ref, oferta, anio, semestre})`. `ref` lleva el reglamento compilado (`DEPN, PERLBL, PSEM, PSPAN, TEMA, RESERVED, OBLIG, ORI`). La versión es sha256 del contenido.
- `materias/{DEP-COD}` `{..., ofertas[], porOferta: {[ofertaId]: {nombre, periodos, modalidades, temas, interdisciplinaria, orden}}}` — los datos por oferta van en `porOferta` (bug histórico: si no, la última importación pisaba a la otra).
- `profesores/{slug}` `{nombre, ofertas[], materias[], cursosPorOferta: {[id]: [...]}}`
- `cursos/{ofertaId}_{DEP-COD}_{PER}_{COM}` (comisiones) `{ofertaId, materiaId, periodo, comision, modalidad, docente, horario, ...}`

**Regla clave: hay UNA SOLA oferta vigente** (`vigente: true`). La app lee solo esa (si por error hay
más, usa la más reciente por año/semestre y el admin lo marca en amarillo). Activar una le saca
`vigente` a todas las demás en el mismo batch. Las no vigentes con `version` sirven como **ofertas
anteriores** para que los alumnos carguen materias ya cursadas.

**Nunca editar una foto a mano**: el navegador la cachea por `version`; un cambio manual no llega a
nadie y deja datos inconsistentes. Para corregir: editar colecciones y volver a publicar
(`publicar.mjs`) o resubir el PDF.

### Alumnos (el progreso)
El **id del documento es el UID** de Firebase Auth en todas: no hay campo "usuario".
- `users/{uid}` `{name, updatedAt}` — perfil público mínimo (lo lee cualquiera con sesión, para nombres en comentarios). El email NO está en Firestore (está en Auth).
- `plans/{uid}` — **todo el progreso** (lo leen el dueño y admins; escribe solo el dueño):
  ```js
  { v:2, ori:'pri', desde:'2025-1',
    sel:{ 'PRI-2X8': {b:'op', p:'PCUA', c:'0016', st:'plan|anot|apr', t, n,d,pts,y /*copia*/} },
    hist:{ emp:{...} },              // sel de orientaciones anteriores
    prev:[ {id, b, name, pts, year, dep, ori, src, k:'PRI-205', of:'2025-1', p:'PCUA', tm:[]} ], // materias anteriores (k/of/p solo si salió del buscador)
    obl:['DIP',...], pra:[{id,pts,st,name}], idi:true,
    fav:[], goal, asked, toured, prac:0, t, rev, got, apr, updatedAt }
  ```
- `comments/{uid}` `{items:[...]}` (máx. 40) — comentarios sobre comisiones.
- `config/main` `{banner:{text,at}, dates:[{id,label,date}], hid:[uid|id]}` — avisos, fechas y comentarios ocultos.
- `admins/{uid}` `{email, grantedAt}`.

**OJO reglas (`firestore.rules`)**: `plans` usa `keys().hasOnly([...])`. **Si agregás un campo al
plan en `app.js` (payload de `flush()`), agregalo también a la regla y desplegá reglas**, si no
TODOS los guardados fallan ("No se pudo guardar, reintentando…"). Ya pasó con `desde`.
Mismo criterio para `users` (`name, updatedAt`) y `config/main` (`banner, dates, hid`).

---

## 6. Flujos principales

### 6.1 Subir la oferta de un cuatrimestre (admin)
`/3816` → pestaña **Ofertas** → arrastrar el PDF:
1. Lee el PDF (pdf.js) → 2. lee el reglamento **de Firestore** → 3. interpreta y valida → resumen
   (materias, comisiones, docentes, por período, errores/avisos). Con errores el botón queda
   bloqueado salvo "Publicar igual".
4. Publicar: escribe en lotes de 450 (ofertas, materias con `arrayUnion`, profesores, cursos), borra
   cursos viejos de esa oferta y desvincula materias/profesores, compila la foto, y si está tildado
   **"Dejarla vigente"** la activa (por defecto destildado si ya hay otra vigente).
- Si se corta a la mitad, los alumnos siguen viendo la vigente; se puede reintentar con el mismo PDF.
- Desde terminal: `npm run importar -- --project mi-cpo data/ofertas/2027-1.pdf [--prueba] [--forzar]`
  y `npm run publicar -- --project mi-cpo --oferta 2027-1 [--sin-activar|--activar]`.

### 6.2 Cambiar la oferta que ve la app
`/3816` → Ofertas → botón **Activar** (o "Dejar solo esta" si hay varias vigentes).
Terminal: `npm run publicar -- --project mi-cpo --oferta 2026-2 --activar`.

### 6.3 Qué pasa con los alumnos al cambiar de oferta
`adopt()` en app.js: si un curso elegido ya no está en la oferta vigente y estaba **aprobado**, se
convierte en `prev` (con la copia n/d/pts/y guardada en el plan) → no se pierden puntos. Lo
planeado/cursando que ya no existe se descarta. El alumno ve la oferta nueva al recargar.

### 6.4 Materias de años anteriores (alumno)
Botón "+ Materia anterior" → "¿Desde cuándo cursás el CPO?" (guarda `S.desde`) → buscador con las
materias de todas las ofertas publicadas **desde ese período hasta la anterior a la vigente**
(`RT.ofertasAnteriores/materiasAnteriores`, se leen solo al abrir la ventana y se cachean en
localStorage `cpo-pasadas-v1` por versión). Elegir → período (define los puntos) y segmento
(sugerido por `segsOf(c)`, mismas reglas que `getBlocks`) → se guarda en `prev` con `k`.
Con `k`: no se puede re-elegir en la oferta vigente (`prevSame` en `canPick`), cuenta para reglas
puntuales (Penal 5X7/5X6, temas de Empresarial) y ocupa la ranura correcta (MAR → "Métodos
alternativos"). "¿No la encontrás? Cargala a mano" = formulario manual viejo (sin código).

### 6.5 Administración de alumnos y avisos
`/3816#alumnos`: lee todos los `plans` + nombres de `users`, usa la foto vigente para nombres de
cursos/comisiones (si un curso ya no existe usa la copia del plan). Stats, tabla con buscador y
materias desplegables, cursos y comisiones más elegidos (alerta de demanda), CSV.
`/3816#avisos`: aviso general y fechas (`config/main`, guarda con merge para no tocar `hid`).
En la app ya NO hay sección "Administración" (se movió todo a /3816). Los admins siguen pudiendo
ocultar comentarios desde "Comentarios de comisiones" en la app.

---

## 7. Lector del PDF de oferta (detalles finos)

Formato del PDF de la Facultad: secciones "DEPARTAMENTO DE ..." / "ORIENTACIÓN EN ..." y tablas
`Período lectivo | Actividad | Comisión | Modalidad | Docente | Horario [| Temática]`.
Título: "PRIMER PERÍODO LECTIVO 2026 - CPO". Actividad: `205 (PRI) - DERECHO ROMANO *** _INTDP+B213 _ÁREA DAÑ`.

- La tabla se reconstruye con los **rectángulos de borde** dibujados (operator list de pdf.js),
  aplicando la rotación de página (`page.getViewport({scale:1}).transform`). Verticales agrupadas
  por top/bottom con tolerancia ±2 (el borde exterior a veces está medio punto corrido).
- **Guiones tipográficos**: el PDF de 2025 usa `‐` (U+2010) en vez de `-`; `limpiar()` normaliza
  U+2010–2015, U+2212 y U+00AD a `-`. Sin esto: 1323 errores "Actividad con formato desconocido".
- **Filas sin bordes**: a veces la última fila de una página no tiene bordes; si un renglón suelto
  empieza con un período ("SEGUNDO BIMESTRE ..."), se reparte en las columnas de la tabla más cercana.
- `INTDP` a veces viene sin guion bajo (`... HUMANOS INTDP`): se acepta `(_|\s)INTDP`.
- **Títulos de Procesal cruzados**: el PDF de 2025-1 tiene al revés los títulos "Métodos alternativos" e
  "Insolvencia". Si el nombre de la materia es claramente de la otra área (concurso/quiebra/insolvencia → INS;
  métodos alternativos/mediación/negociación/conflictos → MAR), manda el nombre y se avisa (`AREA_INS/AREA_MAR`
  en pdf-oferta.js). En el área INS la única materia es 968 "Concursos"; en MAR, 7X2 "Métodos alternativos...".
  Ojo: existe otra "Concursos" (ECN-308, Económico) que NO es la de Procesal.
- El PDF de 2025 **no tiene columna Temática** → avisos (no errores) para los derivados de Empresarial.
- `_ÁREA XXX` → área (no se pueden cursar dos de la misma área); `***` → orientado a investigación.
- Python se eliminó por completo (antes había pdfplumber); el resultado de pdf.js es idéntico.

---

## 8. Caché y rendimiento

- Hosting: `Cache-Control: no-cache` para `/`, `/3816`, `*.html`, `*.js`, `*.css` (revalidan con
  ETag; después de un deploy todos ven lo nuevo al recargar). Antes era 1 h y causó confusión.
- localStorage: `cpo-oferta-v2` (foto vigente por versión), `cpo-pasadas-v1` (ofertas anteriores
  livianas), `cpo-fixture-uba-v2[:uid]` (copia local del plan). Claves viejas que se borran:
  `cpo-catalog-cache`, `cpo-ofertas-v1`.
- Visita típica: 1 consulta a `ofertas` + 1 lectura de foto solo si cambió la versión + plan.

---

## 9. Desarrollo, pruebas y deploy

```bash
npm install
npm test                                   # 25 tests (node --test)
npx firebase deploy --only hosting --project mi-cpo
npx firebase deploy --only firestore:rules --project mi-cpo
npx firebase deploy --only hosting,firestore:rules --project mi-cpo   # lo habitual
```

- **No uses `firebase deploy --only firestore` a secas** (incluye índices): los índices vivos
  tienen `density: SPARSE_ALL` y el deploy dio 409; el archivo ya está sincronizado, pero si pasa,
  exportá los índices vivos (`firebase firestore:indexes`) y usá `--force` sin borrar índices.
- Después de cambiar `public/`, siempre verificar en producción con `curl` que el archivo nuevo
  esté (por ejemplo `curl -s https://mi-cpo.web.app/js/app.js | grep -c <algo nuevo>`).
- **Pruebas en navegador**: se hicieron con Edge headless (`msedge --headless=new
  --user-data-dir=<perfil temporal> --remote-debugging-port=<puerto>`) contra un **Firebase falso en
  memoria** (reemplaza los `<script>` de firebase compat por un fake con `doc/collection/where/batch/
  FieldValue/FieldPath.documentId`) servido por un mini servidor Node que sirve `public/` y recibe
  resultados por POST. No está en el repo (vivía en el scratchpad); si hace falta, se rearma igual.
  Ojo: el fake NO aplica las reglas de Firestore → los errores de reglas no aparecen ahí.
- No matar procesos de Edge del usuario (`taskkill msedge`): usar perfil y puerto propios + `timeout`.
- Windows + Git Bash: los archivos tienen CRLF en algunos casos; para reemplazos grandes usar
  scripts Node que normalicen `\r\n`.

---

## 10. Estado de producción (10/11/2026)

| Oferta | Estado | Versión | Notas |
|---|---|---|---|
| 2025-1 | publicada, no vigente | v-9579de42b892 | del PDF `CPO_1S_1_25.pdf` (= data/ofertas/2025-1.pdf), 638 materias, 1281 comisiones |
| 2025-2 | publicada, no vigente | v-17fd42027dd7 | la subió el usuario desde el admin (el PDF no está en data/) |
| 2026-1 | no vigente | v-f1df629fa1bb | del PDF data/ofertas/2026-1.pdf, 607 materias, 1227 comisiones |
| **2026-2** | **vigente** | v-d483496fc8ae | sin PDF: tomada del fixture legacy (data/ofertas/2026-2.json). Su `estado` dice "reemplazada" (cosmético; se arregla al activarla desde /3816) |

- `orientaciones/pri` tiene PRI-205 (Derecho Romano) como principal (el usuario lo había borrado
  para probar y lo restauró).
- Se borraron datos obsoletos: `catalog/*`, `ofertas/2026` y cursos/refs viejos.

---

## 11. Historial de decisiones (por qué está así)

1. HTML único legacy → Firebase (Hosting + Firestore + Auth Google) con modelo granular.
2. Reglamento Plan 2004 cargado como colecciones + validación obligatoria de cada oferta.
3. Pipeline PDF → colecciones → foto compilada; la app lee siempre `ofertas` (no colecciones sueltas) para gastar pocas lecturas.
4. Módulo admin para subir la oferta desde el navegador (Spark no tiene servidor) → pdf.js en vez de Python.
5. Una sola oferta vigente + botón Activar; publicar sin activar para cargar ofertas por adelantado o viejas.
6. Materias anteriores desde ofertas pasadas (idea del usuario: "desde qué año cursás").
7. `importar.mjs` ya no pisa el reglamento salvo `--reglamento` (la base es la fuente de verdad).
8. Admin movido de `/admin` a **`/3816`** (pedido del usuario; la seguridad real son Auth + reglas).
   Se sacaron de la app los links "Subir oferta" y la sección "Alumnos" (ahora en /3816).
9. Cache `no-cache` en Hosting.
11. Tributario: Procesal pide **Concursos (INS-968)** en lugar de "cualquier curso de Insolvencia"
    (no está en el PDF del Plan 2004; lo pidió el usuario el 13/11/2026). Se reimportó 2025-1 con el
    arreglo de títulos cruzados (antes 968 figuraba como MAR-968 y 7X2 como INS-7X2).
10. El progreso se queda en `plans/{uid}` separado de `users/{uid}` (privacidad: `users` lo lee
    cualquiera con sesión; costo de lecturas; escrituras independientes). El usuario lo preguntó.

---

## 12. Pendientes / ideas

- Restringir la API key del navegador a los dominios del sitio (consola de Google Cloud → Credenciales).
- Aviso "Hay una oferta nueva, recargá" para pestañas abiertas cuando cambia la vigente.
- Subir el PDF de 2026-2 cuando esté (hoy sale del fixture legacy).
- Opcional: llevar el harness de pruebas en navegador (fake Firebase + Edge headless) al repo.
- Opcional: probar reglas con el emulador de Firestore (requiere Java).

---

## 13. Cómo trabajar con este usuario

- Responder en español rioplatense, claro y concreto; explicar el "por qué" de los cambios.
- Quiere que quede **desplegado y verificado en producción** (pide "deployá").
- Antes de tocar datos de producción que no pidió (reglamento, ofertas vigentes), preguntar.
- Nunca editar fotos a mano; nunca dejar más de una oferta vigente.
- Si se agrega un campo a `plans`, actualizar `firestore.rules` en el mismo cambio.
- Mantener este MEMORY.md actualizado al terminar cada cambio importante.
