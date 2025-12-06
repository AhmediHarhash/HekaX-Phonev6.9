# Authentication and Security

**Security Implementation Documentation**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone implements a comprehensive security model including JWT-based authentication, role-based access control, email verification, and multi-tenant data isolation.

---

## Authentication Flow

### Registration Flow

```
                    User Registration Flow

    User                    Frontend                   Backend                  Database
      |                        |                          |                        |
      |  1. Fill signup form   |                          |                        |
      |----------------------->|                          |                        |
      |                        |                          |                        |
      |                        |  2. POST /auth/signup    |                        |
      |                        |  {email, password, name, |                        |
      |                        |   orgName}               |                        |
      |                        |------------------------->|                        |
      |                        |                          |                        |
      |                        |                          |  3. Check email exists |
      |                        |                          |----------------------->|
      |                        |                          |                        |
      |                        |                          |  4. Hash password      |
      |                        |                          |  (bcrypt, cost 12)     |
      |                        |                          |                        |
      |                        |                          |  5. Create org + user  |
      |                        |                          |----------------------->|
      |                        |                          |                        |
      |                        |                          |  6. Generate verify    |
      |                        |                          |     token              |
      |                        |                          |                        |
      |                        |                          |  7. Send verify email  |
      |                        |                          |---------> Email        |
      |                        |                          |           Service      |
      |                        |                          |                        |
      |                        |  8. Return success       |                        |
      |                        |<-------------------------|                        |
      |                        |                          |                        |
      |  9. Show verify prompt |                          |                        |
      |<-----------------------|                          |                        |
```

### Login Flow

```
                    User Login Flow

    User                    Frontend                   Backend
      |                        |                          |
      |  1. Enter credentials  |                          |
      |----------------------->|                          |
      |                        |                          |
      |                        |  2. POST /auth/login     |
      |                        |  {email, password}       |
      |                        |------------------------->|
      |                        |                          |
      |                        |                          |  3. Find user by email
      |                        |                          |  4. Verify password
      |                        |                          |  5. Check email verified
      |                        |                          |  6. Check account status
      |                        |                          |
      |                        |                          |  7. Generate JWT
      |                        |                          |  {userId, orgId, role}
      |                        |                          |
      |                        |  8. Return token + user  |
      |                        |<-------------------------|
      |                        |                          |
      |                        |  9. Store token          |
      |                        |  (localStorage)          |
      |                        |                          |
      |  10. Redirect to dash  |                          |
      |<-----------------------|                          |
```

---

## JWT Implementation

### Token Structure

```
Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload:
{
  "userId": "user_abc123",
  "organizationId": "org_xyz789",
  "role": "OWNER",
  "iat": 1701849600,
  "exp": 1701936000
}

Signature:
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

### Token Lifecycle

| Token Type | Expiration | Storage |
|------------|------------|---------|
| Access Token | 24 hours | localStorage |
| Refresh Token | 7 days | httpOnly cookie (future) |

### Token Validation

```javascript
const authMiddleware = async (req, res, next) => {
  try {
    // 1. Extract token from header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify token signature and expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { organization: true }
    });

    if (!user || user.status === 'SUSPENDED') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // 4. Attach user context to request
    req.user = user;
    req.userId = user.id;
    req.organizationId = decoded.organizationId;
    req.role = decoded.role;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

---

## Role-Based Access Control

### Role Hierarchy

```
OWNER
  |
  +-- Full system access
  +-- Manage billing
  +-- Delete organization
  +-- Manage all users
  |
ADMIN
  |
  +-- All operational access
  +-- Manage team members
  +-- Configure integrations
  +-- Cannot access billing
  |
MANAGER
  |
  +-- View all data
  +-- Manage leads
  +-- Handle calls
  +-- Cannot manage team
  |
AGENT
  |
  +-- Handle assigned calls
  +-- View own data
  +-- Basic operations
```

### Permission Matrix

| Action | OWNER | ADMIN | MANAGER | AGENT |
|--------|-------|-------|---------|-------|
| View dashboard | Yes | Yes | Yes | Yes |
| Handle calls | Yes | Yes | Yes | Yes |
| View all calls | Yes | Yes | Yes | Own only |
| Manage leads | Yes | Yes | Yes | Assigned |
| Team settings | Yes | Yes | No | No |
| Invite users | Yes | Yes | No | No |
| Billing access | Yes | No | No | No |
| Delete org | Yes | No | No | No |
| Integrations | Yes | Yes | No | No |

### Role Enforcement

```javascript
// Role middleware factory
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.role) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // OWNER can do anything
    if (req.role === 'OWNER') {
      return next();
    }

    // Check if user's role is in allowed list
    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Usage in routes
router.delete('/team/:id',
  authMiddleware,
  requireRole('OWNER', 'ADMIN'),
  deleteTeamMember
);
```

---

## Email Verification

### Verification Flow

```
                    Email Verification Flow

    User                    Backend                   Email Service
      |                        |                           |
      |  Signup complete       |                           |
      |                        |                           |
      |                        |  1. Generate token        |
      |                        |  (32 bytes, hex)          |
      |                        |                           |
      |                        |  2. Generate code         |
      |                        |  (6 digits)               |
      |                        |                           |
      |                        |  3. Store with expiry     |
      |                        |  (24 hours)               |
      |                        |                           |
      |                        |  4. Send email            |
      |                        |-------------------------->|
      |                        |                           |
      |                        |                  5. Email delivered
      |<----------------------------------------------------
      |                        |                           |
      |  6. Click link or      |                           |
      |     enter code         |                           |
      |----------------------->|                           |
      |                        |                           |
      |                        |  7. Validate token/code   |
      |                        |  8. Check not expired     |
      |                        |  9. Mark email verified   |
      |                        |                           |
      |  10. Verification      |                           |
      |      success           |                           |
      |<-----------------------|                           |
```

### Token Generation

```javascript
// Generate secure verification token
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate 6-digit code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store with user
await prisma.user.update({
  where: { id: user.id },
  data: {
    emailVerifyToken: token,
    emailVerifyCode: code,
    emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }
});
```

---

## Password Security

### Hashing Strategy

```javascript
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 12;  // ~250ms hash time

// Hash password on registration
const hashPassword = async (plainPassword) => {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
};

// Verify password on login
const verifyPassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};
```

### Password Requirements

| Requirement | Minimum |
|-------------|---------|
| Length | 8 characters |
| Uppercase | 1 character |
| Lowercase | 1 character |
| Number | 1 digit |
| Special | Optional |

### Password Reset Flow

```
1. User requests reset -> Generate token (1 hour expiry)
2. Send email with reset link
3. User clicks link -> Validate token
4. User enters new password
5. Hash new password, clear reset token
6. Invalidate existing sessions (future)
```

---

## Multi-tenant Security

### Data Isolation

Every database table with tenant data includes `organizationId`:

```sql
-- Example: Leads table
CREATE TABLE "Lead" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  ...
);

-- Index for fast tenant queries
CREATE INDEX "Lead_organizationId_idx" ON "Lead"("organizationId");
```

### Query Enforcement

```javascript
// CORRECT: Always include organizationId
const leads = await prisma.lead.findMany({
  where: {
    organizationId: req.organizationId,  // From JWT
    status: 'NEW'
  }
});

// WRONG: Never query without tenant filter
const leads = await prisma.lead.findMany({
  where: { status: 'NEW' }  // Missing organizationId!
});
```

### Resource Access Verification

```javascript
// Before any update/delete, verify ownership
const verifyOwnership = async (model, id, organizationId) => {
  const record = await prisma[model].findFirst({
    where: {
      id,
      organizationId
    }
  });

  if (!record) {
    throw new Error('Resource not found or access denied');
  }

  return record;
};

// Usage
router.delete('/leads/:id', authMiddleware, async (req, res) => {
  try {
    await verifyOwnership('lead', req.params.id, req.organizationId);
    await prisma.lead.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});
```

---

## API Security

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

// Strict limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 attempts
  message: { error: 'Too many login attempts' }
});

// General API limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,             // 100 requests
  keyGenerator: (req) => req.userId || req.ip
});

app.use('/api/auth/login', authLimiter);
app.use('/api', apiLimiter);
```

### Input Validation

```javascript
// Example: Login validation
const loginSchema = {
  email: {
    type: 'string',
    format: 'email',
    required: true
  },
  password: {
    type: 'string',
    minLength: 8,
    required: true
  }
};

// Validate before processing
const validateInput = (schema, data) => {
  for (const [field, rules] of Object.entries(schema)) {
    if (rules.required && !data[field]) {
      throw new Error(`${field} is required`);
    }
    if (rules.format === 'email' && !isValidEmail(data[field])) {
      throw new Error('Invalid email format');
    }
    if (rules.minLength && data[field].length < rules.minLength) {
      throw new Error(`${field} must be at least ${rules.minLength} characters`);
    }
  }
};
```

### CORS Configuration

```javascript
const cors = require('cors');

const corsOptions = {
  origin: [
    'https://phone.hekax.com',
    'http://localhost:5173',  // Development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
```

---

## Webhook Security

### Signature Verification

All outgoing webhooks include HMAC signature:

```javascript
const crypto = require('crypto');

// Generate signature for webhook payload
const signWebhook = (payload, secret) => {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
};

// Send webhook with signature
const sendWebhook = async (url, payload, secret) => {
  const signature = signWebhook(payload, secret);

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HEKAX-Signature': `sha256=${signature}`,
      'X-HEKAX-Timestamp': Date.now().toString(),
    },
    body: JSON.stringify(payload),
  });
};
```

### Recipient Verification

```javascript
// Recipient should verify signature
const verifyWebhook = (payload, signature, secret) => {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${expected}`),
    Buffer.from(signature)
  );
};
```

---

## Security Headers

```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
  noSniff: true,
  referrerPolicy: { policy: 'same-origin' },
}));
```

---

## Audit Logging

### Logged Events

| Event Category | Events |
|----------------|--------|
| Authentication | login, logout, password_change, password_reset |
| Team | user_invited, user_removed, role_changed |
| Billing | plan_changed, payment_method_updated |
| Settings | org_settings_changed, integration_connected |
| Data | lead_exported, data_deleted |

### Log Structure

```json
{
  "id": "audit_abc123",
  "organizationId": "org_xyz",
  "userId": "user_123",
  "action": "USER_INVITED",
  "resource": "team",
  "resourceId": "user_456",
  "details": {
    "email": "newuser@example.com",
    "role": "AGENT"
  },
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2024-12-06T10:30:00Z"
}
```

---

## Security Checklist

### Development

- [ ] Never commit secrets to repository
- [ ] Use environment variables for all credentials
- [ ] Validate all user input
- [ ] Use parameterized queries (Prisma handles this)
- [ ] Implement proper error handling (don't leak info)

### Deployment

- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] Database access restricted to backend only

### Operations

- [ ] Regular dependency updates
- [ ] Monitor for suspicious activity
- [ ] Audit log review
- [ ] Backup encryption
- [ ] Access key rotation

---

*This document is updated when security measures are modified.*
