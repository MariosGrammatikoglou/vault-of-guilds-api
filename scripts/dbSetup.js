/* eslint-disable */

// Run with: npm run db:setup
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const sql = fs.readFileSync('./sql/schema.sql', 'utf8');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // <-- important for Neon (TLS)
  });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ Database schema applied successfully.');
  } catch (e) {
    console.error('❌ DB setup failed:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
