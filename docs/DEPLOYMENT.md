# Deployment Guide

**Production Deployment Documentation**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone is designed for deployment on modern cloud infrastructure. This guide covers deployment to common platforms with best practices for security, performance, and reliability.

---

## Architecture Requirements

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| Memory | 2 GB | 4 GB |
| Storage | 20 GB SSD | 50 GB SSD |
| Node.js | 18.x | 20.x LTS |
| PostgreSQL | 14 | 16 |

### Network Requirements

| Port | Service | Required |
|------|---------|----------|
| 443 | HTTPS | Yes |
| 80 | HTTP (redirect) | Yes |
| 5432 | PostgreSQL | Internal only |
| 6379 | Redis (optional) | Internal only |

---

## Environment Configuration

### Required Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://app.hekax.com
BACKEND_URL=https://api.hekax.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/hekax?sslmode=require

# Authentication
JWT_SECRET=your-256-bit-secret-key-here
JWT_EXPIRES_IN=24h

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+15551234567

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxx

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxx

# Email (choose one or more)
RESEND_API_KEY=re_xxxxxxxxx
SENDGRID_API_KEY=SG.xxxxxxxxx
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxx

# Storage
AWS_S3_BUCKET=hekax-recordings
AWS_S3_REGION=us-east-1

# Monitoring (optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Security Best Practices

```
Environment Variable Security:
├── Never commit .env files
├── Use secrets manager (AWS Secrets Manager, Vault)
├── Rotate credentials regularly
├── Use different credentials per environment
└── Encrypt at rest
```

---

## Database Setup

### PostgreSQL Configuration

```sql
-- Create database
CREATE DATABASE hekax;

-- Create user with limited privileges
CREATE USER hekax_app WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE hekax TO hekax_app;
GRANT USAGE ON SCHEMA public TO hekax_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hekax_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hekax_app;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### Prisma Migration

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed initial data (if needed)
npx prisma db seed
```

### Connection Pooling

For production, use connection pooling:

```bash
# With PgBouncer
DATABASE_URL=postgresql://user:pass@pgbouncer:6432/hekax?pgbouncer=true

# With Prisma connection limit
DATABASE_URL=postgresql://user:pass@host:5432/hekax?connection_limit=10
```

---

## Docker Deployment

### Backend Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript (if applicable)
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Security: Run as non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Frontend Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build with production API URL
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=${BACKEND_URL}
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=hekax
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## Cloud Platform Deployments

### AWS Deployment

```
AWS Architecture:
├── Route 53 (DNS)
├── CloudFront (CDN for frontend)
├── Application Load Balancer
│   ├── Target Group: Backend ECS/EC2
│   └── SSL/TLS termination
├── ECS Fargate / EC2
│   ├── Backend containers
│   └── Auto-scaling group
├── RDS PostgreSQL
│   ├── Multi-AZ deployment
│   └── Automated backups
├── S3
│   ├── Call recordings
│   ├── Static assets
│   └── Backup storage
├── ElastiCache Redis (optional)
└── CloudWatch (monitoring)
```

#### ECS Task Definition

```json
{
  "family": "hekax-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::xxx:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "xxx.dkr.ecr.us-east-1.amazonaws.com/hekax-backend:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:xxx:secret:hekax/database"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/hekax-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

---

### Vercel + Railway

#### Frontend on Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Environment variables in Vercel dashboard:
VITE_API_URL=https://api.hekax.com
```

#### Backend on Railway

```bash
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npx prisma migrate deploy && node dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 300

# Environment variables in Railway dashboard
```

---

### DigitalOcean App Platform

```yaml
# .do/app.yaml
name: hekax
region: nyc
services:
  - name: backend
    github:
      repo: your-org/hekax-phone
      branch: main
      deploy_on_push: true
    source_dir: backend
    build_command: npm ci && npx prisma generate && npm run build
    run_command: npx prisma migrate deploy && node dist/index.js
    http_port: 3000
    instance_count: 2
    instance_size_slug: professional-xs
    routes:
      - path: /api
    envs:
      - key: DATABASE_URL
        scope: RUN_TIME
        value: ${db.DATABASE_URL}
      - key: NODE_ENV
        scope: RUN_TIME
        value: production

  - name: frontend
    github:
      repo: your-org/hekax-phone
      branch: main
    source_dir: frontend
    build_command: npm ci && npm run build
    static:
      path: /dist
    routes:
      - path: /

databases:
  - name: db
    engine: PG
    version: "16"
    size: db-s-1vcpu-1gb
    num_nodes: 1
```

---

## SSL/TLS Configuration

### Let's Encrypt with Certbot

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d api.hekax.com -d app.hekax.com

# Auto-renewal cron
0 12 * * * /usr/bin/certbot renew --quiet
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/hekax
server {
    listen 80;
    server_name api.hekax.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.hekax.com;

    ssl_certificate /etc/letsencrypt/live/api.hekax.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.hekax.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support for media streams
    location /media-stream {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

---

## Monitoring and Logging

### Health Check Endpoint

```javascript
// Backend health check
app.get('/health', async (req, res) => {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;

    // Check Twilio (optional)
    // await twilioClient.api.accounts.list({ limit: 1 });

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});
```

### Logging Configuration

```javascript
// Winston logger setup
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// In production, also send to CloudWatch/Datadog/etc.
if (process.env.NODE_ENV === 'production') {
  // Add cloud logging transport
}
```

### Sentry Integration

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// Error handler middleware
app.use(Sentry.Handlers.errorHandler());
```

---

## Backup Strategy

### Database Backups

```bash
# Daily automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="hekax_backup_${DATE}.sql.gz"

# Create backup
pg_dump $DATABASE_URL | gzip > /tmp/$BACKUP_FILE

# Upload to S3
aws s3 cp /tmp/$BACKUP_FILE s3://hekax-backups/database/$BACKUP_FILE

# Clean up local file
rm /tmp/$BACKUP_FILE

# Remove backups older than 30 days
aws s3 ls s3://hekax-backups/database/ | \
  awk '{print $4}' | \
  while read file; do
    date_part=$(echo $file | sed 's/hekax_backup_\([0-9]*\)_.*/\1/')
    if [[ $(date -d "$date_part" +%s) -lt $(date -d "-30 days" +%s) ]]; then
      aws s3 rm s3://hekax-backups/database/$file
    fi
  done
```

### Recording Storage

```
S3 Lifecycle Policy:
├── 0-30 days: Standard
├── 30-90 days: Standard-IA
├── 90+ days: Glacier (or delete based on retention)
└── Versioning: Enabled
```

---

## Scaling Strategy

### Horizontal Scaling

```
Load Balancing Strategy:
├── Stateless backend design
├── Session stored in JWT (no server-side sessions)
├── Database connection pooling
├── WebSocket affinity (sticky sessions for media streams)
└── Auto-scaling based on CPU/memory/request count
```

### Database Scaling

```
PostgreSQL Scaling:
├── Read Replicas for analytics queries
├── Connection pooling (PgBouncer)
├── Query optimization and indexing
└── Vertical scaling for write-heavy loads
```

---

## Deployment Checklist

### Pre-Deployment

```
[ ] All environment variables configured
[ ] Database migrations tested
[ ] SSL certificates valid
[ ] DNS records configured
[ ] Twilio webhooks updated
[ ] Stripe webhooks updated
[ ] Backup procedures tested
[ ] Rollback plan documented
```

### Post-Deployment

```
[ ] Health check passing
[ ] Smoke tests passing
[ ] Monitoring alerts configured
[ ] Log aggregation working
[ ] Performance baseline captured
[ ] Documentation updated
```

### Rollback Procedure

```bash
# Quick rollback steps
1. Identify the issue
2. Switch load balancer to previous version
3. Revert database migrations if needed
4. Investigate and fix the issue
5. Deploy fixed version
```

---

*This document is updated when deployment procedures change.*
