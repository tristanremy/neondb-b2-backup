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

// Apply auth middleware to protected routes
const authMiddleware = async (c: any, next: any) => {
  const auth = bearerAuth({ token: c.env.API_TOKEN });
  return auth(c, next);
};
app.use('/backups', authMiddleware);
app.use('/backup', authMiddleware);

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
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.sql`;
  const dbName = env.NEON_DATABASE_URL.split('@')[1]?.split('/')[1] || 'unknown';

  const client = new Client(env.NEON_DATABASE_URL);

  try {
    console.log('🔄 Starting backup...');
    await client.connect();

    // Get all tables in one query
    const tables = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    // Build dump using array for better performance
    const dumpParts: string[] = [
      '-- NeonDB Backup',
      `-- Date: ${now.toISOString()}`,
      `-- Database: ${dbName}`,
      '',
    ];

    for (const { tablename } of tables.rows) {
      console.log(`📦 Dumping table: ${tablename}`);

      dumpParts.push(`-- Table: ${tablename}`);
      dumpParts.push(`DROP TABLE IF EXISTS "${tablename}" CASCADE;`);

      // Get CREATE TABLE statement
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
        dumpParts.push(createTableResult.rows[0].create_statement);
      }

      // Get data
      const result = await client.query(`SELECT * FROM "${tablename}"`);

      if (result.rows.length > 0) {
        dumpParts.push(`-- Data for ${tablename}`);

        // Batch INSERT statements for better performance
        const batchSize = 100;
        for (let i = 0; i < result.rows.length; i += batchSize) {
          const batch = result.rows.slice(i, i + batchSize);
          const columns = Object.keys(batch[0]).map(col => `"${col}"`).join(', ');

          for (const row of batch) {
            const values = Object.values(row).map(val => {
              if (val === null) return 'NULL';
              if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
              if (val instanceof Date) return `'${val.toISOString()}'`;
              return val;
            });
            dumpParts.push(`INSERT INTO "${tablename}" (${columns}) VALUES (${values.join(', ')});`);
          }
        }
      }

      dumpParts.push('');
    }

    await client.end();

    const dump = dumpParts.join('\n');
    console.log(`✅ Database dump completed (${dump.length} bytes)`);

    // Upload to R2
    console.log('📤 Uploading to R2...');
    await env.BACKUP_BUCKET.put(filename, dump, {
      httpMetadata: {
        contentType: 'application/sql',
      },
      customMetadata: {
        'backup-date': date,
        'database': dbName,
      },
    });

    console.log(`✅ Backup uploaded successfully: ${filename}`);
    console.log(`📊 Backup size: ${(dump.length / 1024).toFixed(2)} KB`);

    return filename;
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  } finally {
    // Ensure connection is closed even if there's an error
    try {
      await client.end();
    } catch {}
  }
}
