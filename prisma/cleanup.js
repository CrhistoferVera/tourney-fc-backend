const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await pool.query(
    "DELETE FROM torneos WHERE nombre IN ('Copa TourneyFC 2026', 'Copa Eliminatoria TourneyFC 2026')"
  );
  console.log('Limpiado');
  await pool.end();
}

main().catch((e) => { console.error(e); pool.end(); });
