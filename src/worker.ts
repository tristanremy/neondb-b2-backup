import { Client } from '@neondatabase/serverless';

interface Env {
  NEON_DATABASE_URL: string;
  B2_KEY_ID: string;
  B2_APP_KEY: string;
  B2_BUCKET: string;
  B2_ENDPOINT: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    await backupDatabase(env);
  },

  // Pour tester manuellement via HTTP
  async fetch(request: Request, env: Env) {
    if (request.method !== 'POST') {
      return new Response('Use POST to trigger backup manually', { status: 405 });
    }

    try {
      await backupDatabase(env);
      return new Response('Backup completed successfully', { status: 200 });
    } catch (error) {
      console.error('Backup failed:', error);
      return new Response(`Backup failed: ${error}`, { status: 500 });
    }
  },
};

async function backupDatabase(env: Env) {
  const date = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.sql`;

  try {
    console.log('🔄 Starting backup...');

    // 1. Connect to Neon database
    const client = new Client(env.NEON_DATABASE_URL);
    await client.connect();

    // 2. Generate SQL dump
    const tables = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    let dump = `-- NeonDB Backup\n`;
    dump += `-- Date: ${new Date().toISOString()}\n`;
    dump += `-- Database: ${env.NEON_DATABASE_URL.split('@')[1]?.split('/')[1] || 'unknown'}\n\n`;

    for (const { tablename } of tables.rows) {
      console.log(`📦 Dumping table: ${tablename}`);

      // Get table schema
      const schema = await client.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tablename]);

      dump += `-- Table: ${tablename}\n`;
      dump += `DROP TABLE IF EXISTS "${tablename}" CASCADE;\n`;

      // Get CREATE TABLE statement (simplified version)
      const createTableResult = await client.query(`
        SELECT
          'CREATE TABLE "' || $1 || '" (' ||
          string_agg(
            column_name || ' ' || data_type ||
            CASE
              WHEN character_maximum_length IS NOT NULL
              THEN '(' || character_maximum_length || ')'
              ELSE ''
            END,
            ', '
          ) || ');' as create_statement
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        GROUP BY table_name
      `, [tablename]);

      if (createTableResult.rows.length > 0) {
        dump += createTableResult.rows[0].create_statement + '\n';
      }

      // Get data
      const result = await client.query(`SELECT * FROM "${tablename}"`);

      if (result.rows.length > 0) {
        dump += `\n-- Data for ${tablename}\n`;

        for (const row of result.rows) {
          const values = Object.values(row).map(val => {
            if (val === null) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            return val;
          });

          const columns = Object.keys(row).map(col => `"${col}"`).join(', ');
          dump += `INSERT INTO "${tablename}" (${columns}) VALUES (${values.join(', ')});\n`;
        }
      }

      dump += '\n';
    }

    await client.end();
    console.log(`✅ Database dump completed (${dump.length} bytes)`);

    // 3. Upload to Backblaze B2
    console.log('📤 Uploading to B2...');

    const url = `https://${env.B2_ENDPOINT}/${env.B2_BUCKET}/${filename}`;
    const auth = btoa(`${env.B2_KEY_ID}:${env.B2_APP_KEY}`);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/sql',
        'X-Bz-Info-Backup-Date': date,
      },
      body: dump,
    });

    if (!response.ok) {
      throw new Error(`B2 upload failed: ${response.status} ${response.statusText}`);
    }

    console.log(`✅ Backup uploaded successfully: ${filename}`);
    console.log(`📊 Backup size: ${(dump.length / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}
