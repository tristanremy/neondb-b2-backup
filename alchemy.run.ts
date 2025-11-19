import alchemy from '@alchemy-org/core';
import { Worker } from '@alchemy-org/cloudflare';

const app = await alchemy('neondb-backup');

// Deploy le Worker avec cron schedule
export const backupWorker = await Worker('backup-worker', {
  name: 'neondb-backup',
  entrypoint: './src/worker.ts',

  // Cron: tous les jours à 1h UTC (2h Paris en hiver, 3h en été)
  triggers: {
    crons: ['0 1 * * *'],
  },

  // Environment bindings
  bindings: {
    NEON_DATABASE_URL: alchemy.secret(process.env.NEON_DATABASE_URL!),
    B2_KEY_ID: alchemy.secret(process.env.B2_KEY_ID!),
    B2_APP_KEY: alchemy.secret(process.env.B2_APP_KEY!),
    B2_BUCKET: process.env.B2_BUCKET!,
    B2_ENDPOINT: process.env.B2_ENDPOINT!,
  },

  // Compatibilité settings
  compatibility: {
    date: '2024-11-19',
    flags: ['nodejs_compat'],
  },
});

await app.finalize();

console.log('✅ Alchemy deployment configured');
console.log(`📦 Worker: ${backupWorker.name}`);
console.log('⏰ Cron schedule: Daily at 01:00 UTC');
