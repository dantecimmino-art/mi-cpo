// Da (o quita) permisos de administración a un usuario por su email.
// El usuario tiene que haber entrado al menos una vez con Google.
//
// Uso:
//   node scripts/set-admin.mjs --project <PROJECT_ID> persona@gmail.com
//   node scripts/set-admin.mjs --project <PROJECT_ID> persona@gmail.com --remove
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const pi = args.indexOf('--project');
const projectId = pi >= 0 ? args[pi + 1] : process.env.GCLOUD_PROJECT;
const email = args.find((a, i) => a.includes('@') && args[i - 1] !== '--project');
const remove = args.includes('--remove');
if (!projectId || !email) { console.error('Uso: node scripts/set-admin.mjs --project <PROJECT_ID> <email> [--remove]'); process.exit(1); }

const emulated = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST;
initializeApp({ projectId, ...(emulated ? {} : { credential: applicationDefault() }) });

const user = await getAuth().getUserByEmail(email).catch(() => null);
if (!user) { console.error(`No existe un usuario con ${email}. Tiene que entrar a la app una vez antes.`); process.exit(1); }

const ref = getFirestore().doc('admins/' + user.uid);
if (remove) { await ref.delete(); console.log(`${email} ya no es admin.`); }
else { await ref.set({ email, grantedAt: FieldValue.serverTimestamp() }); console.log(`${email} (${user.uid}) ahora es admin.`); }
