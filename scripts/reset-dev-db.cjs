#!/usr/bin/env node
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/travel_platform_dev';

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  try {
    console.log('Dropping and recreating public schema...');
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    console.log('✓ Database reset');
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
