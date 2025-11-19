# 🗄️ NeonDB → Backblaze B2 Backup

Automated daily backups of NeonDB to Backblaze B2 using Cloudflare Workers, deployed with Alchemy (Infrastructure as Code in TypeScript).

## ✨ Features

- 🔄 **Automated daily backups** at 01:00 UTC (configurable)
- 🚀 **Serverless** - runs on Cloudflare Workers (free tier: 100k requests/day)
- 📦 **Full SQL dumps** with schema + data
- 🔐 **Secure** - credentials stored as encrypted secrets
- 🛠️ **Type-safe IaC** - infrastructure defined in TypeScript with Alchemy
- 💰 **Cost-effective** - ~$0.005/GB/month on B2

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│  NeonDB     │ ───► │  CF Worker       │ ───► │ Backblaze   │
│  (Postgres) │      │  (Daily @ 1AM)   │      │ B2 Bucket   │
└─────────────┘      └──────────────────┘      └─────────────┘
                            │
                            │ Managed by
                            ▼
                     ┌──────────────┐
                     │  Alchemy     │
                     │  (TypeScript)│
                     └──────────────┘
```

## 📋 Prerequisites

- [Bun](https://bun.sh) runtime installed
- [Cloudflare](https://dash.cloudflare.com) account (free tier OK)
- [NeonDB](https://console.neon.tech) database
- [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) account

## 🚀 Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# NeonDB Connection String
# Format: postgresql://user:password@host.neon.tech/dbname?sslmode=require
NEON_DATABASE_URL=postgresql://...

# Backblaze B2 Credentials
B2_KEY_ID=your_key_id
B2_APP_KEY=your_application_key
B2_BUCKET=your-bucket-name
B2_ENDPOINT=s3.us-west-004.backblazeb2.com
```

#### Getting Credentials:

**NeonDB:**
1. Go to [Neon Console](https://console.neon.tech/)
2. Select your project → "Connection String"
3. Copy the connection string

**Backblaze B2:**
1. Create a bucket: [B2 Buckets](https://secure.backblaze.com/b2_buckets.htm)
2. Create app key: [App Keys](https://secure.backblaze.com/app_keys.htm)
3. Note the endpoint for your region (shown in bucket details)

### 3. Login to Cloudflare

```bash
bun wrangler login
```

This opens your browser to authenticate with Cloudflare.

### 4. Deploy

```bash
bun deploy
```

That's it! 🎉 Alchemy will:
- ✅ Create the Cloudflare Worker
- ✅ Configure all secrets securely
- ✅ Set up the cron schedule (daily at 01:00 UTC)
- ✅ Deploy your code

## 🛠️ Usage

### Test Backup Manually

Trigger a backup without waiting for the cron:

```bash
# Get your worker URL from Cloudflare dashboard
curl -X POST https://neondb-backup.YOUR-SUBDOMAIN.workers.dev
```

Or use Wrangler:

```bash
bun wrangler dev
# Then in another terminal:
curl -X POST http://localhost:8787
```

### View Logs

Watch live logs from your worker:

```bash
bun run tail
```

Or check the Cloudflare dashboard: Workers & Pages → neondb-backup → Logs

### Update Cron Schedule

Edit `alchemy.run.ts` and change the cron expression:

```typescript
triggers: {
  crons: ['0 1 * * *'],  // Daily at 1 AM UTC
  // Examples:
  // crons: ['0 */6 * * *'],     // Every 6 hours
  // crons: ['0 2 * * 1'],       // Weekly on Monday at 2 AM
  // crons: ['0 3 1 * *'],       // Monthly on 1st at 3 AM
},
```

Then redeploy:

```bash
bun deploy
```

## 📁 Project Structure

```
neondb-b2-backup/
├── alchemy.run.ts       # Infrastructure as Code (IaC)
├── src/
│   └── worker.ts        # Backup logic
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── .env.example         # Environment template
└── README.md
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEON_DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@...` |
| `B2_KEY_ID` | Backblaze key ID | `0011a234b567c890d...` |
| `B2_APP_KEY` | Backblaze application key | `K001abcd1234...` |
| `B2_BUCKET` | Bucket name | `my-db-backups` |
| `B2_ENDPOINT` | S3-compatible endpoint | `s3.us-west-004.backblazeb2.com` |

### Backup Format

Backups are saved as SQL files with this naming:

```
backup-2024-11-19T01-00-00-123Z.sql
```

Each backup includes:
- `DROP TABLE IF EXISTS` statements
- `CREATE TABLE` statements (schema)
- `INSERT` statements (data)
- Metadata comments (date, database name)

## 💡 Why Alchemy?

**Traditional approach (wrangler.toml):**
```bash
wrangler secret put NEON_DATABASE_URL
wrangler secret put B2_KEY_ID
wrangler secret put B2_APP_KEY
# ... manually configure crons, bindings, etc.
```

**With Alchemy:**
```bash
bun deploy  # That's it! 🚀
```

Benefits:
- ✅ Infrastructure versioned in Git
- ✅ Secrets from `.env` (not manual CLI)
- ✅ Type-safe configuration
- ✅ Single command deploy
- ✅ No YAML/TOML config files

## 📊 Cost Estimation

**Cloudflare Workers (Free Tier):**
- ✅ 100,000 requests/day
- ✅ Daily backup = ~365 requests/year
- **Cost: $0/month** 🎉

**Backblaze B2:**
- Storage: $0.005/GB/month
- Download: $0.01/GB (first 1GB free)
- Example: 100MB backup × 30 days = 3GB = **$0.015/month**

**Total: ~$0.02/month** 💰

## 🔐 Security

- All secrets encrypted by Cloudflare Workers
- Database credentials never exposed in code
- B2 credentials use least-privilege app keys
- SSL/TLS for all connections (NeonDB + B2)

### Best Practices

1. **B2 App Keys**: Create bucket-specific keys with write-only permissions
2. **Neon**: Use read-only connection strings if possible
3. **Bucket**: Make bucket private (not public)
4. **Lifecycle**: Set B2 lifecycle rules to auto-delete old backups

## 🐛 Troubleshooting

### Deploy fails with "auth error"

```bash
bun wrangler login
```

### Backup fails with "connection timeout"

Check your `NEON_DATABASE_URL` includes `?sslmode=require`

### B2 upload fails with 401

Verify your `B2_KEY_ID` and `B2_APP_KEY` are correct:
```bash
# Test with curl
curl -H "Authorization: Basic $(echo -n 'KEY_ID:APP_KEY' | base64)" \
  https://YOUR_ENDPOINT/YOUR_BUCKET/test.txt
```

### "No tables found"

Ensure your NeonDB has tables in the `public` schema:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

## 📚 Resources

- [Alchemy Docs](https://alchemy.so/docs)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [NeonDB Docs](https://neon.tech/docs)
- [Backblaze B2 Docs](https://www.backblaze.com/b2/docs/)

## 🤝 Contributing

PRs welcome! Feel free to:
- Add support for other databases (MySQL, etc.)
- Implement incremental backups
- Add backup rotation/cleanup
- Improve error handling

## 📄 License

MIT

---

**Made with ❤️ using Alchemy, Cloudflare Workers, and Bun**
