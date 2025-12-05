# HEKAX Phone - Deployment Guide

## Zero-Downtime Deployment (Railway)

### How It Works
1. You push to GitHub
2. Railway builds new container
3. Railway starts new instance
4. Railway checks `/health` endpoint
5. Once healthy, traffic switches to new instance
6. Old instance is terminated

**Result**: No downtime for users!

### Railway Configuration
The `railway.json` file configures:
```json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Health Endpoints
| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `/health` | Simple alive check | Railway, Load Balancers |
| `/ready` | Database connectivity | Kubernetes, Startup |
| `/status` | Full system status | Monitoring, Ops Dashboard |

## When You WILL Have Downtime

### Database Migrations
If you change the Prisma schema:
```bash
# 1. Create migration locally
npx prisma migrate dev --name your_change

# 2. Push migration file to GitHub
git add prisma/migrations
git commit -m "Add migration: your_change"
git push

# 3. Railway will run migrate deploy automatically
```

**Safe migrations** (no downtime):
- Adding new columns (with defaults)
- Adding new tables
- Adding indexes

**Dangerous migrations** (may cause downtime):
- Dropping columns
- Renaming columns
- Changing column types

### Maintenance Mode (Future)
For planned maintenance, implement:
```javascript
// Middleware to enable maintenance mode
app.use((req, res, next) => {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return res.status(503).json({
      error: 'Service under maintenance',
      estimatedEnd: process.env.MAINTENANCE_END
    });
  }
  next();
});
```

## Environment Variables

### Required for Production
```
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
OPENAI_API_KEY=...
DEEPGRAM_API_KEY=...
STRIPE_SECRET_KEY=...
```

### Updating Environment Variables
1. Go to Railway Dashboard
2. Select your service
3. Click "Variables"
4. Add/Edit variable
5. Railway auto-redeploys (with zero downtime!)

## Rollback

### Quick Rollback (Railway)
1. Go to Railway Dashboard
2. Click "Deployments"
3. Find the last working deployment
4. Click "Redeploy"

### Git Rollback
```bash
# Find last good commit
git log --oneline

# Revert to it
git revert HEAD
git push

# Or hard reset (careful!)
git reset --hard <commit>
git push --force
```

## Monitoring

### Recommended Tools
- **Uptime**: UptimeRobot, Pingdom (free tier)
- **Errors**: Sentry (free tier)
- **Logs**: Railway built-in logs
- **Metrics**: Railway built-in metrics

### Alert on `/status` Endpoint
Set up monitoring to check `/status` every minute and alert if:
- Response status is not 200
- `overall` field is not "healthy"
- Response time > 5 seconds
