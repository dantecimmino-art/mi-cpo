# Fixture del CPO (mi-cpo)

Todo el contexto del proyecto (qué es, cuentas, instalación, arquitectura, modelo de datos, flujos,
estado de producción, decisiones y pendientes) está en MEMORY.md:

@MEMORY.md

Reglas rápidas:
- Responder en español rioplatense.
- El reglamento del Plan 2004 no cambia: toda oferta se valida contra él.
- Hay UNA sola oferta vigente; nunca editar `ofertas/*/fotos/*` a mano.
- Si agregás un campo a `plans/{uid}` en app.js, agregalo a `firestore.rules` (hasOnly) y desplegá reglas.
- Deploy habitual: `npx firebase deploy --only hosting,firestore:rules --project mi-cpo`, y verificar con curl.
- Admin en `/3816` (no `/admin`).
- Al terminar un cambio importante, actualizar MEMORY.md.
