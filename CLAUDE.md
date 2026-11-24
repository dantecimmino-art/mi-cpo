# Fixture del CPO (mi-cpo)

Todo el contexto del proyecto (qué es, cuentas, instalación, arquitectura, modelo de datos, flujos,
estado de producción, decisiones y pendientes) está en MEMORY.md:

@MEMORY.md

Reglas rápidas:
- Responder en español rioplatense.
- **Al empezar cada sesión** (se trabaja desde la PC Windows y desde una Mac): `git status` y `git fetch`. Si no hay cambios
  locales, `git pull --ff-only`. Si hay cambios sin commitear o commits sin subir, mostrárselos al usuario y preguntar antes
  de bajar; nunca descartarlos.
- **Antes de un deploy**: comparar con producción (curl). Si producción tiene algo que no está en el repo, avisar y no publicar.
- **Después de un deploy**: commit y push, para que GitHub y producción no se separen.
- El reglamento del Plan 2004 no cambia: toda oferta se valida contra él.
- Hay UNA sola oferta vigente; nunca editar `ofertas/*/fotos/*` a mano.
- Si agregás un campo a `plans/{uid}` en app.js, agregalo a `firestore.rules` (hasOnly) y desplegá reglas.
- Deploy habitual: `npx firebase deploy --only hosting,firestore:rules --project mi-cpo`, y verificar con curl.
- Admin en `/3816` (no `/admin`).
- Al terminar un cambio importante, actualizar MEMORY.md.
