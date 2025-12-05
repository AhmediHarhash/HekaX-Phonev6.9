# HEKAX Phone - Database Backup Strategy

## Current Setup: Neon PostgreSQL

### Automatic Features (Built-in)
- **Point-in-Time Recovery (PITR)**: Restore to any second in retention window
- **Retention**: 7 days (Free), 30 days (Pro/Scale)
- **Instant Branching**: Create database copies instantly for testing
- **No manual backups needed**: Neon handles everything

### How to Restore (Neon Console)
1. Go to https://console.neon.tech
2. Select your project
3. Go to "Branches" → "Restore"
4. Choose a point in time or create a branch from a specific time

### Additional Backup Options (If Needed)

#### Option 1: Manual pg_dump (Ad-hoc)
```bash
# Export full database
pg_dump "postgresql://user:pass@host/db?sslmode=require" > backup_$(date +%Y%m%d).sql

# Restore
psql "postgresql://user:pass@host/db?sslmode=require" < backup_20240101.sql
```

#### Option 2: Scheduled Exports (Cron Job)
```bash
# Add to crontab for daily backups
0 2 * * * pg_dump $DATABASE_URL > /backups/hekax_$(date +\%Y\%m\%d).sql
```

#### Option 3: Prisma Data Export
```javascript
// Export all data as JSON
const data = await prisma.$transaction([
  prisma.organization.findMany(),
  prisma.user.findMany(),
  prisma.callLog.findMany(),
  // ... etc
]);
fs.writeFileSync('backup.json', JSON.stringify(data));
```

## Migration Safety

### Before Running Migrations
1. Create a Neon branch (instant copy)
2. Test migration on branch
3. If successful, merge to main

### Prisma Migration Commands
```bash
# Create migration (dev only)
npx prisma migrate dev --name add_feature

# Apply to production (safe)
npx prisma migrate deploy

# Reset (DANGEROUS - deletes all data)
npx prisma migrate reset
```

## Disaster Recovery Checklist

1. **Database**: Neon PITR (automatic)
2. **Code**: GitHub repository
3. **Environment Variables**: Store securely (1Password, Vault, etc.)
4. **Twilio Config**: Document in secure location
5. **Stripe Config**: Stripe dashboard has history

## Recovery Time Objectives (RTO)
- Database restore: ~5 minutes (Neon PITR)
- Full service restore: ~15 minutes (redeploy from GitHub)

## Data Export for Compliance (GDPR/CCPA)
See `/api/data/export` endpoint for user data export requests.
