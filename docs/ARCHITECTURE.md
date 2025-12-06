# System Architecture

**HEKAX Phone Technical Architecture Document**

Version 2.0 | Last Updated: December 2024

---

## Executive Summary

HEKAX Phone is built as a cloud-native, multi-tenant SaaS application designed for horizontal scalability and high availability. The architecture separates concerns across distinct service layers while maintaining data isolation between tenant organizations.

---

## Technology Stack

### Backend

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Node.js 18+ | Server-side JavaScript execution |
| Framework | Express.js | HTTP server and routing |
| Database | PostgreSQL 14+ | Primary data store |
| ORM | Prisma | Type-safe database queries |
| Authentication | JWT + bcrypt | Stateless auth tokens |
| Real-time | WebSocket | Live call status updates |

### Frontend

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | React 18 | UI component library |
| Language | TypeScript | Type-safe development |
| Build Tool | Vite | Fast development and bundling |
| Styling | Tailwind CSS | Utility-first CSS |
| State | React Context | Global state management |
| HTTP Client | Custom fetch wrapper | API communication |

### External Services

| Service | Provider | Purpose |
|---------|----------|---------|
| Telephony | Twilio | Voice calls, phone numbers |
| AI/ML | OpenAI | GPT-4, Realtime API, TTS/STT |
| Payments | Stripe | Subscriptions, metering |
| Email | Resend/SendGrid/AWS SES | Transactional emails |
| CRM | HubSpot, Salesforce, Zoho, Pipedrive | Lead synchronization |
| Calendar | Google, Outlook, Calendly | Appointment booking |

---

## High-Level Architecture

```
                              Internet
                                 |
                    +------------+------------+
                    |                         |
            +-------v-------+         +-------v-------+
            |   CloudFlare  |         |    Twilio     |
            |   (CDN/WAF)   |         |   (Voice)     |
            +-------+-------+         +-------+-------+
                    |                         |
                    v                         v
            +-------+-------+         +-------+-------+
            |   Frontend    |         |   Webhook     |
            |   (Vercel)    |         |   Endpoints   |
            +-------+-------+         +-------+-------+
                    |                         |
                    +------------+------------+
                                 |
                    +------------v------------+
                    |                         |
                    |     Backend API         |
                    |     (Railway)           |
                    |                         |
                    +------------+------------+
                                 |
          +----------+-----------+-----------+----------+
          |          |           |           |          |
    +-----v----+ +---v---+ +-----v-----+ +---v---+ +----v----+
    |PostgreSQL| |OpenAI | |  Stripe   | |  CRM  | |Calendar |
    | Database | |  API  | |  Billing  | | APIs  | |  APIs   |
    +----------+ +-------+ +-----------+ +-------+ +---------+
```

---

## Multi-Tenant Architecture

### Tenant Isolation Model

HEKAX Phone uses a **shared database with tenant column** approach for multi-tenancy:

```
+------------------------------------------------------------------+
|                        PostgreSQL Database                        |
+------------------------------------------------------------------+
|  Organizations Table                                              |
|  +----+----------+--------+------------+                          |
|  | id | name     | plan   | stripeId   |                          |
|  +----+----------+--------+------------+                          |
|  | 1  | Acme Co  | SCALE  | cus_xxx    |                          |
|  | 2  | Beta Inc | STARTER| cus_yyy    |                          |
|  +----+----------+--------+------------+                          |
|                                                                   |
|  All other tables include organizationId for isolation:           |
|  - Users (organizationId)                                         |
|  - Calls (organizationId)                                         |
|  - Leads (organizationId)                                         |
|  - PhoneNumbers (organizationId)                                  |
+------------------------------------------------------------------+
```

### Isolation Enforcement

Tenant isolation is enforced at multiple levels:

1. **Middleware Level**: Every authenticated request extracts `organizationId` from JWT
2. **Query Level**: All database queries include `organizationId` filter
3. **Route Level**: API routes validate resource ownership before operations

```javascript
// Example: Middleware extracts tenant context
const authMiddleware = (req, res, next) => {
  const decoded = jwt.verify(token, secret);
  req.userId = decoded.userId;
  req.organizationId = decoded.organizationId;  // Tenant context
  next();
};

// Example: Query always filters by tenant
const leads = await prisma.lead.findMany({
  where: {
    organizationId: req.organizationId  // Enforced isolation
  }
});
```

---

## Service Layer Architecture

### Backend Services

```
backend/
├── routes/                 # HTTP route handlers
│   ├── auth.routes.js      # Authentication endpoints
│   ├── calls.routes.js     # Call management
│   ├── leads.routes.js     # Lead CRUD operations
│   ├── billing.routes.js   # Stripe integration
│   ├── crm.routes.js       # CRM OAuth and sync
│   ├── calendar.routes.js  # Calendar integration
│   └── ...
│
├── services/               # Business logic
│   ├── ai-receptionist.js  # OpenAI integration
│   ├── crm/                # CRM provider implementations
│   │   ├── index.js        # CRM service orchestrator
│   │   └── providers/      # HubSpot, Salesforce, etc.
│   ├── calendar/           # Calendar integrations
│   └── email/              # Email service
│
├── middleware/             # Request processing
│   ├── auth.middleware.js  # JWT validation
│   └── rate-limit.js       # API rate limiting
│
└── lib/                    # Shared utilities
    └── prisma.js           # Database client
```

### Service Communication Pattern

```
Request Flow:

  Client Request
       |
       v
  +----+----+
  | Express |  Route Handler
  | Router  |  (validation, auth check)
  +----+----+
       |
       v
  +----+----+
  | Service |  Business Logic
  |  Layer  |  (orchestration, rules)
  +----+----+
       |
       +--------+--------+--------+
       |        |        |        |
       v        v        v        v
   +------+ +------+ +------+ +------+
   |Prisma| |OpenAI| |Twilio| |Stripe|
   +------+ +------+ +------+ +------+
```

---

## Call Flow Architecture

### Inbound Call Processing

```
                        Inbound Call Flow

  Caller                                          Team Member
    |                                                  |
    |  1. Dials business number                        |
    v                                                  |
+-------+                                              |
|Twilio |  2. Webhook to /api/twilio/incoming          |
+---+---+                                              |
    |                                                  |
    v                                                  |
+---+---+                                              |
|Backend|  3. Lookup org settings                      |
+---+---+     - AI enabled?                            |
    |         - Business hours?                        |
    |         - Custom greeting?                       |
    |                                                  |
    +---------> AI Receptionist                        |
    |           |                                      |
    |           v                                      |
    |       +---+---+                                  |
    |       |OpenAI |  4. Real-time conversation       |
    |       |Realtime|    - STT (speech to text)       |
    |       | API   |    - GPT-4 responses             |
    |       +---+---+    - TTS (text to speech)        |
    |           |                                      |
    |           v                                      |
    |       Lead Captured?                             |
    |           |                                      |
    |       +---+---+                                  |
    |       |  Yes  |  5. Store lead in database       |
    |       +---+---+     Sync to CRM                  |
    |           |                                      |
    |       Transfer Requested?                        |
    |           |                                      |
    |       +---+---+                                  |
    |       |  Yes  |  6. Connect to team member       |
    +-------+---+---+---------------------------->     |
                                                       |
                      Call Connected                   |
```

### WebRTC Softphone Architecture

```
Browser (Softphone)                    Backend                    Twilio
      |                                   |                         |
      |  1. Request capability token      |                         |
      |---------------------------------->|                         |
      |                                   |                         |
      |  2. Return JWT token              |                         |
      |<----------------------------------|                         |
      |                                   |                         |
      |  3. Initialize Twilio Device      |                         |
      |---------------------------------------------------------->  |
      |                                   |                         |
      |  4. Register for incoming calls   |                         |
      |---------------------------------------------------------->  |
      |                                   |                         |
      |  5. Incoming call notification    |                         |
      |<----------------------------------------------------------  |
      |                                   |                         |
      |  6. Accept call (WebRTC)          |                         |
      |==========================================================>  |
      |                   Audio Stream                              |
      |<==========================================================  |
```

---

## Data Flow Architecture

### Lead Capture Flow

```
                    Lead Capture Data Flow

  AI Receptionist          Backend              External Systems
        |                     |                       |
        |  1. Caller info     |                       |
        |     extracted       |                       |
        |-------------------->|                       |
        |                     |                       |
        |                     |  2. Store in DB       |
        |                     |  (leads table)        |
        |                     |--------+              |
        |                     |        |              |
        |                     |<-------+              |
        |                     |                       |
        |                     |  3. CRM Sync          |
        |                     |---------------------->|
        |                     |     (HubSpot)         |
        |                     |                       |
        |                     |  4. Webhook           |
        |                     |---------------------->|
        |                     |     (Zapier/Custom)   |
        |                     |                       |
        |                     |  5. Slack notify      |
        |                     |---------------------->|
        |                     |                       |
```

---

## Security Architecture

### Authentication Flow

```
                    JWT Authentication Flow

  Client                    Backend                   Database
    |                          |                          |
    |  1. POST /auth/login     |                          |
    |  {email, password}       |                          |
    |------------------------->|                          |
    |                          |                          |
    |                          |  2. Verify credentials   |
    |                          |------------------------->|
    |                          |                          |
    |                          |  3. User + Org data      |
    |                          |<-------------------------|
    |                          |                          |
    |  4. JWT Token            |                          |
    |  {userId, orgId, role}   |                          |
    |<-------------------------|                          |
    |                          |                          |
    |  5. API Request          |                          |
    |  Authorization: Bearer   |                          |
    |------------------------->|                          |
    |                          |                          |
    |                          |  6. Verify JWT           |
    |                          |  Extract tenant context  |
    |                          |                          |
    |                          |  7. Query with orgId     |
    |                          |------------------------->|
    |                          |                          |
```

### Security Layers

| Layer | Implementation |
|-------|----------------|
| Transport | HTTPS/TLS 1.3 enforced |
| Authentication | JWT with RS256 signing |
| Authorization | Role-based (OWNER, ADMIN, MANAGER, AGENT) |
| Data Isolation | Organization ID on all queries |
| Password Storage | bcrypt with cost factor 12 |
| API Security | Rate limiting, input validation |
| Webhook Security | HMAC signature verification |

---

## Scalability Considerations

### Current Architecture Limits

| Component | Current Capacity | Scaling Path |
|-----------|-----------------|--------------|
| API Server | ~1000 req/sec | Horizontal scaling (load balancer) |
| Database | ~10K organizations | Read replicas, connection pooling |
| AI Calls | ~100 concurrent | OpenAI rate limits, queue system |
| Twilio | Account limits | Multiple Twilio subaccounts |

### Future Scaling Improvements

1. **Message Queue**: Add Redis/BullMQ for async job processing
2. **Caching**: Redis for session and frequently accessed data
3. **Database**: Read replicas for analytics queries
4. **CDN**: Static assets and API caching
5. **Microservices**: Split AI service for independent scaling

---

## Deployment Architecture

### Production Environment

```
                    Production Deployment

    +------------------+      +------------------+
    |    GitHub Repo   |      |   Environment    |
    |                  |      |   Variables      |
    +--------+---------+      +--------+---------+
             |                         |
             v                         v
    +--------+---------+      +--------+---------+
    |     Railway      |      |     Railway      |
    |    (Backend)     |      |   (PostgreSQL)   |
    |                  |      |                  |
    |  - Node.js       |      |  - Managed DB    |
    |  - Auto-deploy   |<---->|  - Backups       |
    |  - Logs          |      |  - SSL           |
    +------------------+      +------------------+
             |
             v
    +------------------+
    |  Vercel/Railway  |
    |   (Frontend)     |
    |                  |
    |  - React SPA     |
    |  - CDN           |
    |  - Edge caching  |
    +------------------+
```

---

## Monitoring and Observability

### Logging Strategy

| Log Type | Content | Retention |
|----------|---------|-----------|
| Access Logs | HTTP requests, response times | 30 days |
| Error Logs | Exceptions, stack traces | 90 days |
| Audit Logs | User actions, security events | 1 year |
| Call Logs | Call metadata, transcripts | Per plan |

### Key Metrics

- API response time (p50, p95, p99)
- Error rate by endpoint
- Active concurrent calls
- Database query performance
- External API latency (OpenAI, Twilio, Stripe)

---

## Design Decisions

### Why Node.js?

- Real-time WebSocket support for live call features
- Non-blocking I/O for handling concurrent API calls
- Large ecosystem for integrations (Twilio, Stripe, OpenAI SDKs)
- JavaScript across frontend and backend (code sharing)

### Why PostgreSQL?

- ACID compliance for financial transactions (billing)
- JSON columns for flexible metadata storage
- Strong relational model for multi-tenant data
- Prisma ORM provides excellent TypeScript integration

### Why Prisma?

- Type-safe database queries
- Auto-generated migrations
- Intuitive relation handling
- Built-in connection pooling

### Why JWT over Sessions?

- Stateless authentication scales horizontally
- No server-side session storage needed
- Mobile app compatibility (future)
- Microservices-ready architecture

---

*This architecture document is updated with each major system change.*
