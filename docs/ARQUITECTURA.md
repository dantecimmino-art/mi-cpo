# Arquitectura · Fixture del CPO en Google Cloud (Firebase)

## Punto de partida

La app llegó como un único archivo `Fixture-CPO.html` (500 KB, ahora en `legacy/`), hecho como
artifact de Claude:

- La oferta de cursos (661 cursos, 2.201 comisiones) estaba embebida en el JS (`const DATA = …`).
- Usuario, base de datos y descargas los daba el runtime del artifact (`window.claude.use(...)`),
  que no existe fuera de claude.ai.
- Sin ese runtime, todo quedaba solo en `localStorage`.

## Objetivo

Publicarla en Google Cloud **sin costo** y con todos los datos en una base de datos.

## Decisión: Firebase en el plan Spark (gratis, sin tarjeta)

| Necesidad | Servicio | Cuota gratis (por día salvo que diga otra cosa) |
|---|---|---|
| Servir el sitio (HTML/JS/CSS) con HTTPS y CDN | **Firebase Hosting** | 10 GB almacenados · 360 MB de transferencia/día |
| Base de datos | **Cloud Firestore** (modo nativo) | 1 GiB · 50.000 lecturas · 20.000 escrituras · 20.000 borrados |
| Login de alumnos y admins | **Firebase Authentication** (Google) | Gratis |
| Autorización | **Firestore Security Rules** | Incluido |

**Por qué el plan Spark:** no pide cuenta de facturación, así que **no se puede generar un cargo**.
Si algún día se pasara de la cuota, el servicio deja de responder hasta el día siguiente (no cobra).

**Qué se descartó y por qué:**

- *Cloud Run / App Engine / Cloud Functions:* tienen nivel gratuito pero exigen cuenta de facturación
  (en Firebase, el plan Blaze). Esta app es 100% cliente, no necesita backend propio: la validación la
  hacen las reglas de Firestore.
- *Cloud SQL:* no tiene nivel gratuito.
- *Un documento por curso en Firestore:* serían ~660 lecturas por visita (~75 visitas/día gratis).
  Ver "Catálogo" abajo.

## Diagrama

```
 Navegador del alumno
 ┌────────────────────────────────────────────┐
 │ index.html  ─ estilos + estructura           │
 │ runtime.js  ─ Firebase Auth + Firestore,     │
 │               caché del catálogo, login      │
 │ app.js      ─ lógica original del fixture    │
 └──────┬───────────────────┬──────────────────┘
        │ HTTPS (CDN)       │ SDK Firebase (HTTPS/WebChannel)
        ▼                   ▼
 Firebase Hosting     Cloud Firestore  ◄── Security Rules
 (archivos estáticos) Firebase Auth (Google)
                            ▲
                            │ Admin SDK (bypassa reglas)
                     scripts/importar.mjs · publicar.mjs · consultar.mjs · set-admin.mjs
                     (los corre el admin desde su PC)
```

## Modelo de datos (Firestore)

Cuatro partes:

1. **Reglamento** (Plan 2004): no cambia entre cuatrimestres.
2. **Colecciones que arman la oferta** (materias, profesores, cursos): salen del PDF de cada cuatrimestre.
3. **`ofertas`**: una por período lectivo. **La app lee siempre de acá.**
4. **Datos de los alumnos.**

```
 PDF de oferta del cuatrimestre          Reglamento (Plan 2004, fijo)
 /3816 "Subir oferta" o importar.mjs    colecciones de reglamento (data/referencia.json)
        │                                       │
        │  1. extraer tablas (pdf.js)
        │  2. interpretar (materia, período, horario, departamento)
        │  3. validar contra el reglamento ◄────┘   (con errores no importa)
        ▼
 materias · profesores · cursos          departamentos · periodos · obligatorias ·
 (colecciones que arman la oferta)       orientaciones · materiasReglamento
        └──────────────┬─────────────────────┘
                       │ publicar.mjs
                       ▼
 ofertas/{2027-1} (vigente) + ofertas/{2027-1}/fotos/{version} ──► la app de los alumnos
```

### 1. Reglamento

El plan de estudios no cambia entre cuatrimestres. Cada oferta nueva se controla contra él al
importarla (`scripts/lib/validar.mjs`).

```
departamentos/{PRI}             nombre, orden
periodos/{PCUA}                 nombre, nombreCorto, tipo, semestre, puntos, mesInicio, mesFin, orden
obligatorias/{DIP}              nombre, horas, puntos, orden
orientaciones/{pri}             nombre, principales[materiaId], gruposElegirUno[{materias[]}],
                                deptosDerivados[], deptosLibres[], constitucional[materiaId], orden
materiasReglamento/{PUB-631}    nombre (como figura en el plan), puntos, rol (principal | elegir-uno |
                                derivado-obligatorio | constitucional | comun), orientaciones[]
```

Algunas reglas del plan están programadas en `app.js`, porque son lógica y no datos:

- Los 69 puntos y el cupo de cada bloque.
- Libres en al menos 2 departamentos.
- Procesal: 2 puntos de Métodos alternativos más 2 de Insolvencia.
- Penal: Introducción a las teorías criminológicas o a la Parte especial, según la principal elegida.
- Trabajo: Seguridad Social obligatoria en derivados.
- Práctica: 19 puntos.

**Qué valida la importación** (si hay errores, no importa):

- Cada materia de `materiasReglamento` está en la oferta, con un nombre parecido y los puntos del
  plan. Si no está, busca una con el mismo nombre y sugiere que cambió el código.
- De las alternativas ("elegí una", las dos opciones de constitucional) se ofrece al menos una.
- Hay cursos de Sociales, Filosofía, Procesal, Métodos alternativos e Insolvencia.
- Los puntos de cada período son coherentes (bimestre = 2, cuatrimestre = 4, etc.).

### 2. Colecciones que arman la oferta

Vocabulario: una **materia** es la asignatura ("Derecho Romano", `PRI-205`). Un **curso** es una
comisión que se dicta en un período de una oferta, con profesor y horario.

```
materias/{PRI-205}              codigo, nombre, nombreNorm, departamentoId, departamentoNombre,
                                interdisciplinaria, reservada, temaClave, ofertas[],
                                porOferta{2026-1: {nombre, periodos[], modalidades[], temas[], orden}}
profesores/{lococo-julio}       nombre, nombreNorm, materias[], ofertas[], cursosPorOferta{2026-1: n}
cursos/{2026-1_PRI-205_PCUA_0620}
                                ofertaId, materiaId, materiaNombre, departamentoId,
                                periodoId, semestre, puntos, comision, modalidad (presencial|remota),
                                profesorId, profesorNombre,
                                horario[{dia, diaNombre, desde, hasta, desdeMin, hastaMin}],
                                horarioTexto, dias[1..7], turnos[M|T|N], ordenPeriodo, ordenComision
```

Una materia puede estar en varias ofertas. Lo que depende de cada oferta (modalidades, temáticas,
orden) está en `porOferta`, y cada oferta se compila con sus propios datos.

**Administración (`/3816`).** Tres pestañas: **Ofertas** (subir el PDF y activar la vigente), **Alumnos** (lee todos los `plans/{uid}` y los nombres de `users/{uid}`: estadísticas, materias de cada alumno, cursos y comisiones más elegidos, CSV) y **Avisos y fechas** (`config/main`, que la app muestra a todos). Código en `public/js/admin.js` y `public/js/admin-alumnos.js`.

**Subir oferta (`/3816`).** Como el plan Spark no permite código en el servidor, el proceso completo corre
en el navegador del admin, con el mismo código que los scripts (`public/js/oferta/`): lee el PDF con
pdf.js, lee el reglamento de Firestore, valida, escribe materias/profesores/cursos en lotes de 450 y al
final publica la foto y deja la oferta vigente. Si se corta a mitad de camino, los alumnos siguen viendo
la oferta anterior y se puede volver a subir el mismo PDF. Las reglas solo dejan escribir esto a quien
está en `admins/{uid}`. `config/reglamento` guarda las partes del reglamento que no son una colección
(materias reservadas, temáticas clave, departamentos exigidos).

**Cómo se lee el PDF** (`public/js/oferta/tablas-pdf.js` + `pdf-oferta.js`):

- **Celdas:** la tabla se reconstruye con los bordes dibujados en el PDF, así que las celdas de varias
  líneas no se mezclan entre filas.
- **Departamento:** sale del título de la sección, no del código. "Métodos alternativos" e
  "Insolvencia" vienen con código `(PRC)` pero son requisitos aparte (`MAR`, `INS`).
- **Marcas que se limpian del nombre:** `_INTDP` (interdisciplinaria), `_ÁREA XXX`, `***` y restos
  como `+B213`.
- **Oferta:** el id sale del PDF (año y semestre, por ejemplo `2026-1`), y el resultado se guarda en
  `data/ofertas/<id>.json`.

**Desnormalización deliberada:** `cursos` repite `materiaNombre`, `departamentoId`, `semestre`,
`puntos` y `profesorNombre` para poder filtrar sin leer otros documentos, porque Firestore no tiene
joins. `dias` y `turnos` se derivan del horario para consultar con `array-contains`.

**Ids legibles y estables:** materia = `DEP-código`; curso = `oferta_materia_período_comisión`;
profesor = nombre normalizado. Reimportar la misma oferta pisa los mismos documentos y borra los cursos
que ya no están.

#### Consultas típicas para el back (Firestore SDK)

| Pregunta | Consulta | Índice |
|---|---|---|
| Ofertas que ve la app | `ofertas` where `vigente == true` | automático |
| Cursos de una materia | `cursos` where `ofertaId ==`, `materiaId ==` orderBy `periodoId`, `comision` | compuesto |
| Cursos de un profesor | `cursos` where `ofertaId ==`, `profesorId ==` orderBy `periodoId` | compuesto |
| Cursos de un departamento (y período) | `cursos` where `ofertaId ==`, `departamentoId ==` [, `periodoId ==`] orderBy `materiaNombre` | compuesto |
| Cursos de un día | `cursos` where `ofertaId ==`, `dias array-contains 6` orderBy `periodoId` | compuesto |
| Cursos de un turno | `cursos` where `ofertaId ==`, `turnos array-contains 'N'` orderBy `periodoId` | compuesto |
| Buscar profesor por apellido | `profesores` where `nombreNorm >= 'lococo'` y `< 'lococo'` | automático |
| Materias de un departamento en una oferta | `materias` where `ofertas array-contains '2026-1'`, `departamentoId ==` orderBy `nombre` | compuesto |

Ejemplos ejecutables en `scripts/consultar.mjs` (`npm run consultar -- --project mi-cpo profesor lococo`).

### 3. Ofertas (lo que lee la app)

| Ruta | Contenido |
|---|---|
| `ofertas/{2026-1}` | `nombre, anio, semestre, estado (importada · publicada · reemplazada · retirada), vigente, version, previous, fuente, avisos[], totales` |
| `ofertas/{2026-1}/fotos/{version}` | `{json: "<{courses, ref:{DEPN, PERLBL, PSEM, PSPAN, TEMA, RESERVED, OBLIG, ORI}, oferta}>"}` |

- **Una oferta por período lectivo:** `2026-1` (1.er cuatrimestre, bimestres 1 y 2, 1.er trimestre
  y mensual) y `2026-2`.
- **Una sola vigente:** la app lee siempre una única oferta, la que tiene `vigente: true`. Se elige en
  `/3816` con "Activar" (o al publicar, con "Dejarla vigente"), o con `publicar.mjs --activar`.
  Activar una le saca "vigente" a todas las demás en el mismo lote. Si por error hubiera más de una,
  la app usa la más reciente (año, semestre) y el admin lo marca en amarillo.
- **Costo por visita:** 1 consulta chica a `ofertas` más 1 lectura de la foto, solo si cambió la
  versión. El navegador guarda la foto por versión.
- **Reglamento dentro de la foto:** viaja en `ref`, así que no está escrito en `app.js`.
- **Volver atrás:** en `ofertas/{id}`, poner en `version` el valor de `previous`.

Ofertas cargadas hoy:

- `2026-1`: sale de `data/ofertas/2026-1.pdf`. Coincide comisión por comisión con la versión
  anterior del fixture.
- `2026-2`: no hay PDF, así que se tomó de la versión anterior del fixture (`data/ofertas/2026-2.json`).

### 4. Datos de los alumnos

| Ruta | Contenido | Quién lee | Quién escribe |
|---|---|---|---|
| `plans/{uid}` | plan y progreso del alumno: `ori`, `sel` (cursos de la oferta vigente con estado), `hist` (de orientaciones anteriores), `prev` (materias de años anteriores), `desde` (primer período que cursó), `obl`, `pra`, `idi`, totales `got`/`apr` | el alumno y los admins | solo el alumno |
| `comments/{uid}` | `{items: [...]}` comentarios del alumno sobre comisiones (máx. 40) | usuarios con cuenta | el alumno o un admin |
| `users/{uid}` | `{name}` perfil público mínimo | usuarios con cuenta | el propio usuario |
| `config/main` | `{banner, dates[], hid[]}` (avisos, fechas, comentarios ocultos) | todos | admins |
| `admins/{uid}` | marca de administrador | el propio usuario | solo consola / script |

**Materias aprobadas y cambio de oferta.** Cada curso elegido en el plan (`sel` y `hist`) guarda
una copia de sus datos: `n` (nombre), `d` (departamento), `pts` y `y` (año). Cuando se publica una
oferta nueva y un curso aprobado ya no está, `adopt()` en `app.js` lo pasa a "materias anteriores"
(`prev`) con esos datos, así **no se pierden puntos aprobados**. Los cursos que estaban planeados y ya
no se ofrecen sí se descartan.

**Materias de años anteriores.** El alumno elige desde qué período cursa (`desde`, p. ej. `2025-1`)
y la app junta las materias de las ofertas publicadas desde ese período hasta la anterior a la
vigente (`RT.ofertasAnteriores` / `RT.materiasAnteriores` en `runtime.js`; se leen solo al abrir
esa ventana y quedan en el navegador por versión). Al elegir una materia, los puntos salen del
período y el segmento se sugiere con las mismas reglas de la app (`segsOf`). Se guarda en `prev`
con `k` (código), `of` (oferta), `p` (período) y `tm` (temas): así cuenta para las reglas que
piden un curso puntual (derivado obligatorio de Penal, temas de Empresarial, Métodos alternativos e
Insolvencia en Procesal) y no se puede volver a elegir en la oferta vigente. La carga a mano sigue
disponible para lo que no esté en ninguna oferta cargada.

Por eso conviene **subir también las ofertas viejas** desde `/3816`, sin tildar "Dejarla vigente".

### Consumo estimado

- Visita típica con cuenta ≈ 5 lecturas → **~10.000 visitas por día** dentro de la cuota gratis.
- Importar la oferta de un período ≈ 2.700 escrituras (cuota: 20.000 escrituras/día).
- Publicar ≈ 1.900 lecturas. Las consultas del back cuestan 1 lectura por documento devuelto.

## Seguridad

- **Ingreso obligatorio y solo con Google.** Sin sesión se muestra únicamente la pantalla de ingreso
  (`#login` en `index.html`); `app.js` no se carga hasta que hay una sesión de Google. Google es el
  único proveedor habilitado en Firebase Auth, y `runtime.js` además cierra cualquier sesión que no
  venga de `google.com`. La oferta se descarga en paralelo mientras el alumno inicia sesión.
- Si alguien usaba la versión anterior (sin cuenta), al entrar por primera vez el avance guardado en
  el navegador se pasa automáticamente a su cuenta.
- Las reglas (`firestore.rules`) limitan cada colección a su dueño y validan forma y tamaño de los datos.
- Los admins se definen en `admins/{uid}`, que no se puede escribir desde la app.
- La config web de Firebase (apiKey, etc.) es pública por diseño; la protección está en las reglas.
  Se recomienda además restringir la API key a los dominios del sitio en la consola de GCP.

## Cambios hechos al código original

- `public/index.html`: estilos y estructura, sin cambios de diseño (solo el botón de login/salir).
- `public/js/app.js`: misma lógica. Cambios: la oferta sale de `window.CATALOG` (la oferta vigente), el plan guarda copia de los cursos y conserva los aprobados que ya no se ofrecen, el runtime se llama
  `window.RT`, se agregó la migración del avance local a la cuenta, los avisos se ven sin cuenta.
- `public/js/runtime.js` (nuevo): implementa `user`/`db` sobre Firebase con la misma interfaz que usaba
  el artifact.
