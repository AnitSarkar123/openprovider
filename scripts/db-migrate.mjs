import { execSync } from 'child_process';

const databaseUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.trim();

if (!databaseUrl) {
  console.log('No DATABASE_URL or POSTGRES_URL environment variable found. Skipping database migrations.');
  process.exit(0);
}

console.log('Database URL is configured. Running database migrations...');
try {
  execSync('npx drizzle-kit migrate', { stdio: 'inherit' });
  console.log('Database migrations completed successfully.');
} catch (error) {
  console.error('Database migration failed:', error);
  process.exit(1);
}
