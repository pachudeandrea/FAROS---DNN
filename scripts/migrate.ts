import { readFile } from 'node:fs/promises';
import { closeDatabase, DatabaseError, transaction } from '../src/server/database.js';

try {
  const sql = await readFile(new URL('../migrations/001_auth_persistence.sql', import.meta.url), 'utf8');
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('faros_auth_migration'))");
    await client.query(sql);
  });
  console.log('[FAROS MIGRATION] Migración aplicada. Tablas y cuentas existentes conservadas.');
} catch (error) {
  if (error instanceof DatabaseError) {
    console.error(`[FAROS MIGRATION] ${error.code}${error.causeCode ? ` (${error.causeCode})` : ''}: ${error.message}`);
    if (error.code === 'DB_NOT_CONFIGURED') console.error('Habilitá DATABASE_URL o POSTGRES_URL de la integración Neon en las variables del entorno de Vercel que se está desplegando.');
    if (error.code === 'DB_AUTH_FAILED') console.error('Revisá en Vercel que la conexión de Neon siga vigente y que el rol pueda conectarse.');
    if (error.code === 'DB_PERMISSION_DENIED') console.error('El rol de migración necesita crear tablas e índices en el esquema de FAROS.');
    if (error.code === 'EMAIL_EXISTS') console.error('Hay identidades duplicadas en los datos existentes. La migración se revirtió sin borrar cuentas.');
  } else {
    console.error('[FAROS MIGRATION] No se pudo leer o aplicar la migración.');
  }
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
