import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null | undefined;

export function hasDatabase(): boolean {
  return Boolean((process.env.DATABASE_URL || process.env.POSTGRES_URL)?.trim());
}

export function getDb() {
  if (cachedDb !== undefined) {
    return cachedDb;
  }

  let databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    cachedDb = null;
    return cachedDb;
  }

  // Strip accidental prefix if the user copy-pasted the entire "DATABASE_URL=..." assignment
  if (databaseUrl.startsWith('DATABASE_URL=')) {
    databaseUrl = databaseUrl.slice('DATABASE_URL='.length).trim();
  }

  try {
    let urlObj: URL;
    try {
      urlObj = new URL(databaseUrl);
    } catch {
      // If direct parsing fails due to unencoded special characters like brackets,
      // try encoding brackets and other common special characters
      if (databaseUrl.includes(']') || databaseUrl.includes('[')) {
        urlObj = new URL(databaseUrl.replace(/\]/g, '%5D').replace(/\[/g, '%5B'));
      } else {
        throw new Error('Invalid URL format');
      }
    }

    const client = postgres({
      host: urlObj.hostname,
      port: urlObj.port ? parseInt(urlObj.port, 10) : 5432,
      database: urlObj.pathname.replace(/^\//, ''),
      username: urlObj.username,
      password: decodeURIComponent(urlObj.password),
      ssl: urlObj.searchParams.get('sslmode') === 'require' || urlObj.searchParams.get('sslmode') === 'verify-full' ? 'require' : undefined,
      max: 1
    });
    cachedDb = drizzle(client, { schema });
  } catch (error) {
    console.error("Failed to parse DATABASE_URL with standard URL parser, falling back to direct driver passing:", error);
    // Limit pool size to 1 to prevent connection exhaustion in serverless environments
    const client = postgres(databaseUrl, { max: 1 });
    cachedDb = drizzle(client, { schema });
  }

  return cachedDb;
}

