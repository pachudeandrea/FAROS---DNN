import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig, type PoolClient, type QueryResultRow } from 'pg';

export class DatabaseError extends Error {
  constructor(public code: string, message: string, public causeCode?: string) {
    super(message);
  }
}

let pool: Pool | undefined;

export async function closeDatabase(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}

// pg otherwise lets sslmode=require override certificate verification. Always
// verify remote certificates, including when using the Neon connection string.
export function databaseConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid database protocol');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: local ? false : {
      rejectUnauthorized: true,
      ...(process.env.PGSSLROOTCERT ? { ca: readFileSync(process.env.PGSSLROOTCERT, 'utf8') } : {})
    },
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
    statement_timeout: 10000,
    allowExitOnIdle: true
  };
}

export function getPool(): Pool {
  if (pool) return pool;
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || '').trim();
  if (!url) throw new DatabaseError('DB_NOT_CONFIGURED', 'La base de datos no está configurada. Configurá DATABASE_URL o POSTGRES_URL en Vercel.');
  try {
    pool = new Pool(databaseConfig(url));
    pool.on('error', () => console.error('[DB] Se perdió una conexión inactiva.'));
    return pool;
  } catch {
    throw new DatabaseError('DB_CONFIGURATION_INVALID', 'La configuración de la base de datos no es válida.');
  }
}

function databaseFailure(error: unknown): never {
  if (error instanceof DatabaseError) throw error;
  const code = (error as { code?: string })?.code;
  const safeCode = typeof code === 'string' && /^[A-Z0-9_]+$/i.test(code) ? code : undefined;
  if (code === '23505') throw new DatabaseError('EMAIL_EXISTS', 'Este correo electrónico ya se encuentra registrado en FAROS.', safeCode);
  if (code === '42P01' || code === '42703') throw new DatabaseError('DB_SCHEMA_MISSING', 'Falta aplicar las migraciones de la base de datos de FAROS.', safeCode);
  if (code === '28P01' || code === '28000') throw new DatabaseError('DB_AUTH_FAILED', 'PostgreSQL rechazó las credenciales o el acceso del rol configurado.', safeCode);
  if (code === '42501') throw new DatabaseError('DB_PERMISSION_DENIED', 'El rol configurado no tiene permisos suficientes en PostgreSQL.', safeCode);
  // Never log connection strings, query parameters, tokens or raw pg errors.
  throw new DatabaseError('DB_UNAVAILABLE', 'No se pudo acceder a la base de datos. Intentá nuevamente en unos momentos.', safeCode);
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  try {
    return await getPool().query<T>(text, values);
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient | undefined;
  try {
    client = await getPool().connect();
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return databaseFailure(error);
  } finally {
    client?.release();
  }
}
