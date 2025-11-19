import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { Client } from '@neondatabase/serverless';

interface Env {
  NEON_DATABASE_URL: string;
  API_TOKEN: string;
  BACKUP_BUCKET: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => {
  return c.json({
    message: 'NeonDB to Cloudflare R2 Backup API',
    endpoints: {
      'GET /': 'This help message',
      'GET /backups': 'List all backup files (requires auth)',
      'POST /backup': 'Trigger a manual backup (requires auth)',
    },
    authentication: 'Bearer token required for protected endpoints',
  });
});

app.use('/backups', async (c, next) => {
  const auth = bearerAuth({ token: c.env.API_TOKEN });
  return auth(c, next);
});

app.use('/backup', async (c, next) => {
  const auth = bearerAuth({ token: c.env.API_TOKEN });
  return auth(c, next);
});

app.get('/backups', async (c) => {
  try {
    const backups = await listBackups(c.env);
    return c.json({
      count: backups.length,
      backups,
    });
  } catch (error) {
    console.error('Failed to list backups:', error);
    return c.json({ error: `Failed to list backups: ${error}` }, 500);
  }
});

app.post('/backup', async (c) => {
  try {
    const filename = await backupDatabase(c.env);
    return c.json({
      message: 'Backup completed successfully',
      filename,
    });
  } catch (error) {
    console.error('Backup failed:', error);
    return c.json({ error: `Backup failed: ${error}` }, 500);
  }
});

export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    await backupDatabase(env);
  },

  fetch: app.fetch,
};

async function listBackups(env: Env): Promise<string[]> {
  const listed = await env.BACKUP_BUCKET.list({
    prefix: 'backup-',
    limit: 1000,
  });

  return listed.objects.map(obj => obj.key);
}

async function backupDatabase(env: Env): Promise<string> {
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

    // 3. Upload to Cloudflare R2
    console.log('📤 Uploading to R2...');

    await env.BACKUP_BUCKET.put(filename, dump, {
      httpMetadata: {
        contentType: 'application/sql',
      },
      customMetadata: {
        'backup-date': date,
        'database': env.NEON_DATABASE_URL.split('@')[1]?.split('/')[1] || 'unknown',
      },
    });

    console.log(`✅ Backup uploaded successfully: ${filename}`);
    console.log(`📊 Backup size: ${(dump.length / 1024).toFixed(2)} KB`);

    return filename;
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}
