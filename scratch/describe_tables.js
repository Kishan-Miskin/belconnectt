const { Pool } = require('../frontend/node_modules/pg');

const p = new Pool({
  connectionString: 'postgresql://postgres:Akshay_a015@127.0.0.1:5432/cityconnect',
});

async function describe() {
  const tables = ['jobs', 'job_applications', 'job_application_events', 'job_messages'];
  for (const t of tables) {
    console.log(`=== TABLE: ${t} ===`);
    const cols = await p.query(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [t]
    );
    cols.rows.forEach((c) =>
      console.log(
        `  ${c.column_name.padEnd(25)} ${(c.data_type || '').padEnd(25)} null:${c.is_nullable} def:${c.column_default || ''}`
      )
    );
  }
  console.log('\n=== NEW INDEXES ===');
  const idxs = await p.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('jobs', 'job_applications', 'job_application_events', 'job_messages', 'job_interviews') AND indexname LIKE '%idx%'`
  );
  idxs.rows.forEach((i) => console.log(`  ${i.indexname.padEnd(35)} -> ${i.indexdef}`));
}

describe().finally(() => p.end());
