// Conexión a Firestore con el Admin SDK (para los scripts del admin).
// Usa las credenciales de `gcloud auth application-default login`,
// o el emulador si está definida FIRESTORE_EMULATOR_HOST.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function args() {
  const a = process.argv.slice(2);
  const opts = { _: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const k = a[i].slice(2);
      const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
      opts[k] = v;
    } else opts._.push(a[i]);
  }
  return opts;
}

export function conectar(projectId) {
  projectId ||= process.env.GCLOUD_PROJECT;
  if (!projectId) { console.error('Falta --project <PROJECT_ID>'); process.exit(1); }
  if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.GOOGLE_CLOUD_QUOTA_PROJECT ||= projectId;
  initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
  return getFirestore();
}

// Lee una colección (o query) como {id: data}.
export async function leer(q) {
  const snap = await q.get();
  return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
}
