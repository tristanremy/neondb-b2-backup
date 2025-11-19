# Security Considerations

## Authentication & Authorization

### API Token Protection
- **All API endpoints** (`/backups`, `/backup`) require Bearer token authentication
- Generate a strong API token: `openssl rand -base64 32`
- Store the token securely in your `.env` file as `API_TOKEN`
- **Never commit** the token to version control
- Rotate the token regularly (every 90 days recommended)

### Usage
```bash
# Protected endpoints require Authorization header
curl -H "Authorization: Bearer YOUR_API_TOKEN" https://YOUR-WORKER-URL.workers.dev/backups
```

## Secrets Management

### Alchemy Password
- Used to encrypt secrets in Alchemy's state files
- Required for all deployments
- **Critical**: Keep this password secure - losing it means you cannot decrypt your secrets

### Environment Variables
All sensitive credentials are stored as environment variables:
- `ALCHEMY_PASSWORD` - Alchemy encryption key
- `API_TOKEN` - API authentication token
- `NEON_DATABASE_URL` - Database connection string

**Never commit `.env` or `.alchemy/` to version control** - they are in `.gitignore`.

## Cloudflare R2 Security

### Access Control
R2 buckets are private by default and accessed through Worker bindings:

- **Worker Binding**: The worker has direct access to the R2 bucket via the `BACKUP_BUCKET` binding
- **No Public Access**: Buckets are not publicly accessible by default
- **Principle of Least Privilege**: The worker only has access to the specific R2 bucket it's bound to

### Bucket Configuration
- R2 buckets are **private by default** (not publicly accessible)
- Configure lifecycle rules to auto-delete old backups
- Monitor R2 usage through Cloudflare dashboard
- Enable audit logging through Cloudflare Logpush

## Network Security

### HTTPS Only
- All connections use TLS/SSL:
  - NeonDB: `sslmode=require` in connection string
  - Cloudflare R2: Encrypted at rest and in transit
  - Cloudflare Workers: HTTPS only

### Rate Limiting
**Current Implementation**: Basic authentication only

**Recommended Additions**:
- Implement rate limiting on `/backup` endpoint
- Use Cloudflare's built-in rate limiting rules
- Monitor for unusual traffic patterns

## Database Security

### Connection Security
- Always use SSL/TLS for NeonDB connections
- Include `?sslmode=require` in your connection string
- Consider using a read-only database user for backups

### SQL Injection Prevention
- Uses parameterized queries for table lookups
- Table names are validated through PostgreSQL system tables
- No user input is directly interpolated into SQL

## Cloudflare Workers Security

### Secrets Storage
- All secrets are encrypted by Cloudflare Workers
- Secrets are never logged or exposed in responses
- Access to secrets requires Cloudflare account authentication

### Worker Isolation
- Worker runs in isolated V8 sandboxes
- No access to other workers or external resources (except configured)
- Environment variables isolated per deployment

## Monitoring & Logging

### What to Monitor
- Failed authentication attempts
- Unusual backup patterns (frequency, size)
- R2 upload failures
- Database connection errors

### Log Access
```bash
# View real-time logs
bun run tail

# Or via Cloudflare Dashboard:
# Workers & Pages → neondb-backup → Logs
```

### What NOT to Log
- API tokens
- Database passwords
- Full connection strings
- Any encrypted secrets

## Incident Response

### If API Token is Compromised
1. Generate a new token: `openssl rand -base64 32`
2. Update `.env` with new `API_TOKEN`
3. Redeploy: `bun run deploy`
4. Review logs for unauthorized access

### If Database Credentials are Compromised
1. Rotate NeonDB password immediately
2. Update `NEON_DATABASE_URL` in `.env`
3. Redeploy the worker
4. Audit recent backups for tampering

### If R2 Access is Compromised
1. Review Cloudflare audit logs
2. Rotate API_TOKEN immediately
3. Check R2 bucket for unauthorized access
4. Review worker bindings and permissions
5. Redeploy the worker with new credentials

## Best Practices

### Regular Security Tasks
- [ ] Rotate API token every 90 days
- [ ] Review Cloudflare Workers logs monthly
- [ ] Monitor R2 bucket usage and access patterns
- [ ] Test backup restoration quarterly
- [ ] Review and update dependencies monthly
- [ ] Monitor Cloudflare security advisories

### Backup Security
- **Encryption at Rest**: R2 provides encryption at rest by default
- **Retention Policy**: Implement automatic deletion of old backups via R2 lifecycle rules
- **Access Auditing**: Enable Cloudflare Logpush for audit trails
- **Disaster Recovery**: Store Alchemy password in password manager

### Production Checklist
- [ ] All secrets rotated from defaults
- [ ] `.env` file not committed to git
- [ ] `.alchemy/` directory not committed to git
- [ ] R2 bucket is private (default)
- [ ] API token is strong (32+ random bytes)
- [ ] Database uses SSL (`sslmode=require`)
- [ ] Monitoring/alerting configured
- [ ] R2 lifecycle rules configured for old backup deletion

## Reporting Security Issues

If you discover a security vulnerability:
1. **Do not** open a public GitHub issue
2. Contact the repository owner privately
3. Include detailed reproduction steps
4. Allow time for a fix before public disclosure

## Compliance Considerations

### Data Privacy
- Backups contain your production database data
- Ensure compliance with GDPR, CCPA, or other regulations
- Consider data residency requirements (R2 automatically replicates across Cloudflare's network)
- Implement data retention policies via R2 lifecycle rules

### Access Control
- Limit who has access to:
  - Cloudflare Workers dashboard
  - R2 bucket (access via dashboard)
  - `.env` file with secrets
  - Alchemy password

## Additional Resources

- [Cloudflare Workers Security](https://developers.cloudflare.com/workers/platform/security/)
- [Cloudflare R2 Security](https://developers.cloudflare.com/r2/security/)
- [NeonDB Security Best Practices](https://neon.tech/docs/security/security-overview)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
