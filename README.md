# Fixture del CPO · UBA Derecho

Planificador del Ciclo Profesional Orientado. Corre en **Firebase (Google Cloud), plan Spark gratis**:
Hosting + Cloud Firestore + Authentication. Arquitectura y decisiones: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

```
public/            sitio estático que publica Firebase Hosting
  index.html       estilos y estructura
  js/runtime.js    Firebase Auth + Firestore + carga del catálogo
  js/app.js        lógica del fixture
data/ofertas/         un PDF por período lectivo (2026-1.pdf) y lo que se leyó de él (2026-1.json)
data/referencia.json  reglamento (Plan 2004): orientaciones, materias exigidas, puntos, períodos
data/reglamento/      el plan de estudios en PDF, como referencia
scripts/importar.mjs  PDF -> validación contra el reglamento -> colecciones
scripts/publicar.mjs  colecciones -> ofertas/{id} vigente (lo que ve la app)
public/3816.html      administración (solo admins): ofertas, alumnos, avisos y fechas
public/js/oferta/     lectura del PDF (pdf.js), validación y modelo: el mismo código para la web y los scripts
scripts/lib/          conexión a Firestore para los scripts
test/                 tests (npm test)
firestore.rules    reglas de seguridad de la base
firebase.json      config de Hosting / Firestore / emuladores
legacy/            el HTML original, como referencia
```

## Puesta en marcha (una sola vez)

1. **Crear el proyecto** en <https://console.firebase.google.com> → "Agregar proyecto"
   (o `firebase projects:create <id>`). No hace falta activar facturación.
2. **Firestore:** Build → Firestore Database → Crear base de datos → modo producción →
   ubicación `southamerica-east1` (São Paulo, la más cercana a Buenos Aires; no se puede cambiar después).
3. **Authentication:** Build → Authentication → Comenzar → habilitar el proveedor **Google**.
4. **App web:** Configuración del proyecto → Tus apps → agregar app web (`</>`). No hace falta copiar la
   config: Hosting la sirve sola en `/__/firebase/init.js`.
5. En esta carpeta:

   ```bash
   npm install
   firebase login                       # con la cuenta dueña del proyecto
   firebase use --add <PROJECT_ID>      # crea .firebaserc
   gcloud auth application-default login
   npm run importar -- --project <PROJECT_ID> data/ofertas/2026-1.pdf --reglamento   # la 1.ª vez carga el reglamento
   npm run publicar -- --project <PROJECT_ID> --oferta 2026-1
   npm run deploy                       # publica el sitio y las reglas
   ```

6. Entrar al sitio (`https://<PROJECT_ID>.web.app`) con tu cuenta de Google y darte permisos de admin:

   ```bash
   npm run admin -- <PROJECT_ID> tu-email@gmail.com
   ```

7. Recomendado: en la consola de GCP → APIs y servicios → Credenciales, restringir la API key del
   navegador a `<PROJECT_ID>.web.app` y `<PROJECT_ID>.firebaseapp.com`.

## Tareas habituales

| Qué | Cómo |
|---|---|
| Publicar cambios del sitio | `npm run deploy` |
| **Cargar la oferta de un cuatrimestre** | entrar a `https://mi-cpo.web.app/3816` con una cuenta admin, elegir el PDF, revisar el informe contra el reglamento y tocar "Publicar". Desde la terminal: `npm run importar -- --project mi-cpo data/ofertas/2027-1.pdf` y `npm run publicar -- --project mi-cpo --oferta 2027-1` |
| La importación da errores contra el reglamento | leer el informe (falta una materia exigida, cambió un código, no coinciden los puntos). Si el plan de verdad cambió, actualizar `data/referencia.json`; si es un error del PDF, corregirlo o usar `--forzar` |
| Corregir un dato puntual (profesor, horario) | editarlo en la consola de Firebase (`cursos`, …) y `npm run publicar -- --project mi-cpo --oferta 2027-1` |
| Cambiar la oferta que ve la app (hay una sola vigente) | en `/3816`, botón "Activar" de la oferta. Desde la terminal: `npm run publicar -- --project mi-cpo --oferta 2026-2 --activar` |
| Consultar el catálogo | `npm run consultar -- --project mi-cpo materia PRI-205` (también `profesor`, `departamento`, `dia`, `orientacion`) |
| Tests del modelo | `npm test` |
| Cambiar el reglamento (plan de estudios) | editar `data/referencia.json` y `npm run importar -- --project mi-cpo data/ofertas/2026-1.pdf --reglamento` (pisa `departamentos`, `periodos`, `obligatorias`, `orientaciones`, `materiasReglamento` y `config/reglamento`), o editarlo directo en la consola de Firestore |
| Volver a la publicación anterior de una oferta | en Firestore, poner en `ofertas/{id}.version` el valor de `ofertas/{id}.previous` |
| Agregar / quitar admin | `npm run admin -- <PROJECT_ID> email` (agregar `--remove` para quitar) |
| Backup de la base | Firestore → Importar/Exportar (necesita un bucket; el export manual es gratis dentro de la cuota de lectura) |

## Desarrollo local

Los emuladores necesitan Java 11+ instalado.

```bash
npm run emulators          # Hosting en http://localhost:5000, UI en http://localhost:4000
# en otra terminal, con FIRESTORE_EMULATOR_HOST=127.0.0.1:8080:
npm run importar -- --project demo-cpo data/ofertas/2026-1.pdf --reglamento && npm run publicar -- --project demo-cpo --oferta 2026-1
```
