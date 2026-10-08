import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Client } = pg;

async function runMigration() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ ERROR: DATABASE_URL is not defined in backend/.env');
    process.exit(1);
  }

  // Parse target DB name from DATABASE_URL
  const urlObj = new URL(dbUrl);
  const targetDbName = urlObj.pathname.replace(/^\//, '') || 'trusthire';

  console.log(`\n========================================`);
  console.log(`🚀 TrustHire Database Setup & Migration`);
  console.log(`========================================`);
  console.log(`Target database: "${targetDbName}"`);
  console.log(`Host:            ${urlObj.hostname}:${urlObj.port || 5432}`);
  console.log(`User:            ${urlObj.username}\n`);

  // Step 1: Connect to default 'postgres' database to ensure target DB exists
  const maintenanceUrl = new URL(dbUrl);
  maintenanceUrl.pathname = '/postgres';

  const maintenanceClient = new Client({ connectionString: maintenanceUrl.toString() });

  try {
    await maintenanceClient.connect();
    console.log('✓ Connected to PostgreSQL server.');

    // Check if database exists
    const checkDb = await maintenanceClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDbName]
    );

    if (checkDb.rowCount === 0) {
      console.log(`→ Database "${targetDbName}" not found. Creating it now...`);
      await maintenanceClient.query(`CREATE DATABASE "${targetDbName}"`);
      console.log(`✓ Database "${targetDbName}" created successfully.`);
    } else {
      console.log(`✓ Database "${targetDbName}" already exists.`);
    }
  } catch (err) {
    console.error('\n⚠️ Could not connect to default postgres database:', err.message);
    console.error('Please verify your password and credentials in backend/.env');
    console.error(`Current connection string: ${dbUrl}\n`);
    process.exit(1);
  } finally {
    await maintenanceClient.end();
  }

  // Step 2: Connect to the target database and run migration schema
  const dbClient = new Client({ connectionString: dbUrl });

  try {
    await dbClient.connect();
    console.log(`✓ Connected to "${targetDbName}".`);

    const schemaPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }

    console.log(`→ Executing schema migration (001_initial_schema.sql)...`);
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await dbClient.query(sql);
    console.log(`✓ Schema applied successfully.`);

    // Apply every additional migration in filename order (002_, 003_, ...).
    // 003_drop_plaintext.sql is excluded: it is a destructive Phase-5 manual
    // migration and must be run explicitly with psql (see its header).
    const migrationsDir = path.join(__dirname, 'migrations');
    const extra = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f !== '001_initial_schema.sql' && f !== '003_drop_plaintext.sql')
      .sort();
    for (const file of extra) {
      console.log(`→ Applying migration (${file})...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await dbClient.query(sql);
      console.log(`✓ ${file} applied.`);
    }

    // Step 3: Verify created tables
    const tableRes = await dbClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tables = tableRes.rows.map(r => r.table_name);
    console.log(`\n📋 Created Tables (${tables.length}):`);
    tables.forEach(t => console.log(`   • ${t}`));

    console.log(`\n🎉 Database setup completed successfully!`);
    console.log(`You can now start the backend with: npm run dev\n`);
  } catch (err) {
    console.error('\n❌ Error applying migration schema:', err.message);
    process.exit(1);
  } finally {
    await dbClient.end();
  }
}

runMigration();
