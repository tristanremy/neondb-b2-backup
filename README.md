# 🗄️ NeonDB → Cloudflare R2 Backup

Automated daily backups of NeonDB to Cloudflare R2 using Cloudflare Workers, deployed with Alchemy (Infrastructure as Code in TypeScript).

## ✨ Features

- 🔄 **Automated daily backups** at 01:00 UTC (configurable)
- 🌐 **REST API** - List backups and trigger manual backups via HTTP endpoints (powered by Hono)
- 🚀 **Serverless** - runs on Cloudflare Workers (free tier: 100k requests/day)
- 📦 **Full SQL dumps** with schema + data
- 🔐 **Secure** - credentials stored as encrypted secrets, Bearer token authentication
- 🛠️ **Type-safe IaC** - infrastructure defined in TypeScript with Alchemy
- 💰 **Cost-effective** - R2 free tier: 10GB storage, no egress fees

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│  NeonDB     │ ───► │  CF Worker       │ ───► │ Cloudflare  │
│  (Postgres) │      │  (Daily @ 1AM)   │      │  R2 Bucket  │
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
# Alchemy Encryption Password (generate a secure random password)
ALCHEMY_PASSWORD=your-secure-random-password-here

# API Authentication Token (generate with: openssl rand -base64 32)
API_TOKEN=your-secure-api-token-here

# NeonDB Connection String
# Format: postgresql://user:password@host.neon.tech/dbname?sslmode=require
NEON_DATABASE_URL=postgresql://...
```

#### Getting Credentials:

**NeonDB:**
1. Go to [Neon Console](https://console.neon.tech/)
2. Select your project → "Connection String"
3. Copy the connection string (make sure it includes `?sslmode=require`)

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
- ✅ Create the Cloudflare R2 bucket
- ✅ Create the Cloudflare Worker
- ✅ Configure all secrets securely
- ✅ Set up the cron schedule (daily at 01:00 UTC)
- ✅ Deploy your code

## 🛠️ Usage

### API Endpoints

The worker provides a REST API powered by Hono:

**🏠 View API Documentation**
```bash
curl https://YOUR-WORKER-URL.workers.dev/
```

**📋 List All Backups**
```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" https://YOUR-WORKER-URL.workers.dev/backups
```

Response:
```json
{
  "count": 3,
  "backups": [
    "backup-2025-11-19T10-30-00-000Z.sql",
    "backup-2025-11-19T01-00-00-000Z.sql",
    "backup-2025-11-18T01-00-00-000Z.sql"
  ]
}
```

**🔄 Create Manual Backup**
```bash
curl -X POST -H "Authorization: Bearer YOUR_API_TOKEN" https://YOUR-WORKER-URL.workers.dev/backup
```

Response:
```json
{
  "message": "Backup completed successfully",
  "filename": "backup-2025-11-19T10-30-00-000Z.sql"
}
```

### Local Development

Test locally with Wrangler:

```bash
bun wrangler dev
# Then in another terminal:
curl http://localhost:8787/backups
curl -X POST http://localhost:8787/backup
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
crons: ['0 1 * * *'],  // Daily at 1 AM UTC
// Examples:
// crons: ['0 */6 * * *'],     // Every 6 hours
// crons: ['0 2 * * 1'],       // Weekly on Monday at 2 AM
// crons: ['0 3 1 * *'],       // Monthly on 1st at 3 AM
```

Then redeploy:

```bash
bun run deploy
```

## 📁 Project Structure

```
neondb-r2-backup/
├── alchemy.run.ts       # Infrastructure as Code (IaC)
├── src/
│   └── worker.ts        # Backup logic
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── .env.example         # Environment template
├── SECURITY.md          # Security documentation
└── README.md
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ALCHEMY_PASSWORD` | Alchemy encryption password | Secure random string |
| `API_TOKEN` | API authentication token | Generated via `openssl rand -base64 32` |
| `NEON_DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |

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
wrangler secret put API_TOKEN
wrangler r2 bucket create neondb-backups
# ... manually configure crons, bindings, etc.
```

**With Alchemy:**
```bash
bun run deploy  # That's it! 🚀
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

**Cloudflare R2 (Free Tier):**
- ✅ 10 GB storage/month
- ✅ 1 million Class A operations/month (writes)
- ✅ 10 million Class B operations/month (reads)
- ✅ **No egress fees** (unlike S3/B2)
- Example: 100MB backup × 30 days = 3GB
- **Cost: $0/month** 🎉

**Total: $0/month** 💰

## 🔐 Security

### Authentication
- **Bearer token authentication** required for all API endpoints
- Generate secure tokens: `openssl rand -base64 32`
- Store `API_TOKEN` in your `.env` file

### Secrets Management
- All secrets encrypted by Cloudflare Workers
- Alchemy password encrypts infrastructure state
- Database credentials never exposed in code
- SSL/TLS for all connections (NeonDB + R2)

### Best Practices

1. **API Access**: Never share your API token publicly
2. **R2 Bucket**: Buckets are private by default (not publicly accessible)
3. **Neon**: Use connection strings with `?sslmode=require`
4. **Lifecycle**: Configure R2 lifecycle rules to auto-delete old backups
5. **Git**: Never commit `.env` or `.alchemy/` directory
6. **Token Rotation**: Rotate API_TOKEN regularly (every 90 days)

**📖 See [SECURITY.md](SECURITY.md) for comprehensive security documentation**

## 🐛 Troubleshooting

### Deploy fails with "auth error"

```bash
bun wrangler login
```

### Backup fails with "connection timeout"

Check your `NEON_DATABASE_URL` includes `?sslmode=require`

### R2 upload fails

Verify your Cloudflare account has R2 enabled:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to R2
3. Enable R2 if not already enabled

### "No tables found"

Ensure your NeonDB has tables in the `public` schema:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

### Authentication fails (401/403)

Verify your `API_TOKEN` is correct and matches the one in your `.env` file

## 📚 Resources

- [Alchemy Docs](https://alchemy.run/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [NeonDB Docs](https://neon.tech/docs)
- [Hono Docs](https://hono.dev/)

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
