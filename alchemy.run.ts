import alchemy from 'alchemy';
import { Worker, R2Bucket } from 'alchemy/cloudflare';

const app = await alchemy('neondb-backup', {
  password: process.env.ALCHEMY_PASSWORD,
});

// Create R2 bucket for backups
export const backupBucket = await R2Bucket('backup-bucket', {
  name: 'neondb-backups',
});

// Deploy le Worker avec cron schedule
export const backupWorker = await Worker('backup-worker', {
  name: 'neondb-backup',
  entrypoint: './src/worker.ts',

  // Enable public URL for API access
  url: true,

  // Cron: daily at 2 AM UTC
  crons: ['0 2 * * *'],

  // Environment bindings
  bindings: {
    NEON_DATABASE_URL: alchemy.secret(process.env.NEON_DATABASE_URL!),
    API_TOKEN: alchemy.secret(process.env.API_TOKEN!),
    BACKUP_BUCKET: backupBucket,
  },

  // Node.js compatibility for postgres client
  compatibility: 'node',
  compatibilityDate: '2024-11-19',
});

await app.finalize();

console.log('✅ Alchemy deployment configured');
console.log(`📦 Worker: ${backupWorker.name}`);
console.log(`🌐 URL: ${backupWorker.url}`);
console.log('⏰ Cron schedule: Daily at 02:00 UTC');
console.log('\n📚 API Endpoints:');
console.log('  GET  /          - API documentation');
console.log('  GET  /backups   - List all backup files');
console.log('  POST /backup    - Create a manual backup');
