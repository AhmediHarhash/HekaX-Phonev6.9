# Database Schema and Data Models

**PostgreSQL Database Architecture**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone uses PostgreSQL as its primary database, managed through Prisma ORM. The schema is designed for multi-tenant SaaS with complete data isolation, comprehensive audit trails, and GDPR/CCPA compliance features.

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Database | PostgreSQL 14+ | Primary data store |
| ORM | Prisma | Schema management, migrations, queries |
| Connection | Prisma Client | Type-safe database access |
| Migrations | Prisma Migrate | Schema versioning |

---

## Schema Overview

```
                        Entity Relationship Diagram

    +------------------+       +------------------+       +------------------+
    |   Organization   |-------|       User       |-------|UserOrganization  |
    +------------------+       +------------------+       +------------------+
           |                          |
           |                          |
    +------+------+           +-------+-------+
    |      |      |           |               |
    v      v      v           v               v
 +----+ +----+ +----+     +------+       +--------+
 |Call| |Lead| |Phone|    |Calendar|     |  CRM   |
 |Log | |    | |Num  |    |Integr. |     |Integr. |
 +----+ +----+ +----+     +------+       +--------+
    |      |                  |               |
    v      |              +---+---+       +---+---+
 +----+    |              |Booking|       |SyncLog|
 |Trans|   |              +-------+       +-------+
 |cript|   |
 +----+    v
        +------+
        |Usage |
        |Alert |
        +------+
```

---

## Core Models

### Organization

The central tenant entity. All data is scoped to an organization.

```
Organization
├── Identity
│   ├── id (CUID)
│   ├── name
│   └── slug (unique)
│
├── Status & Lifecycle
│   ├── status (ACTIVE, SUSPENDED, TRIAL, CANCELLED, PENDING_SETUP)
│   ├── createdAt
│   └── updatedAt
│
├── Telephony Configuration
│   ├── twilioNumber (unique)
│   ├── twilioSubAccountSid
│   ├── twilioSubAccountToken
│   ├── twimlAppSid
│   ├── twilioApiKeySid
│   ├── twilioApiKeySecret (encrypted)
│   ├── twilioProvisioned
│   ├── forwardingNumber
│   └── pendingPhoneNumber
│
├── AI Receptionist Settings
│   ├── aiEnabled
│   ├── voiceId
│   ├── voiceProvider
│   ├── greeting
│   ├── personality
│   ├── language
│   ├── maxCallDuration
│   ├── maxTurns
│   ├── aiModel
│   ├── aiTemperature
│   └── systemPrompt (text)
│
├── Business Hours
│   ├── timezone
│   ├── businessHours (JSON)
│   ├── afterHoursMode
│   └── afterHoursGreeting
│
├── Branding
│   ├── logoUrl
│   ├── faviconUrl
│   ├── primaryColor
│   ├── secondaryColor
│   ├── customDomain (unique)
│   ├── emailFromName
│   └── emailFromDomain
│
├── Billing
│   ├── plan (TRIAL, STARTER, BUSINESS_PRO, SCALE)
│   ├── billingCycle
│   ├── stripeCustomerId (unique)
│   ├── stripeSubscriptionId
│   ├── trialEndsAt
│   ├── billingPeriodStart
│   └── billingPeriodEnd
│
├── Usage Tracking
│   ├── monthlyCallMinutes (limit)
│   ├── monthlyAIMinutes (limit)
│   ├── maxUsers
│   ├── maxPhoneNumbers
│   ├── usedCallMinutes
│   ├── usedAIMinutes
│   └── usageResetAt
│
├── Add-on Pool
│   ├── addonCallMinutes
│   ├── addonAIMinutes
│   ├── usedAddonCallMinutes
│   └── usedAddonAIMinutes
│
├── BYO Keys (Enterprise)
│   ├── byoKeysEnabled
│   ├── byoOpenaiKey (encrypted)
│   ├── byoElevenlabsKey (encrypted)
│   ├── byoTwilioAccountSid
│   └── byoTwilioAuthToken (encrypted)
│
└── Data Retention
    ├── retentionCallDays (default: 90)
    ├── retentionTranscriptDays (default: 90)
    ├── retentionRecordingDays (default: 30)
    ├── retentionLeadDays (default: 365)
    ├── retentionAuditDays (default: 365)
    ├── retentionEnabled
    └── lastCleanupAt
```

### User

Individual user accounts with multi-organization support.

```
User
├── Identity
│   ├── id (CUID)
│   ├── email (unique)
│   ├── passwordHash (bcrypt)
│   ├── name
│   ├── phone
│   ├── avatar
│   └── status (ACTIVE, INACTIVE, INVITED, SUSPENDED)
│
├── Authentication
│   ├── emailVerified
│   ├── emailVerificationToken (unique)
│   ├── emailVerificationCode
│   ├── emailVerificationExpires
│   ├── passwordResetToken (unique)
│   ├── passwordResetExpires
│   ├── mfaEnabled
│   └── mfaSecret
│
├── Preferences
│   ├── timezone
│   ├── language
│   ├── emailNotifications
│   └── smsNotifications
│
├── Session
│   ├── lastLoginAt
│   ├── lastLoginIp
│   ├── currentOrgId
│   └── twilioIdentity (unique)
│
└── Timestamps
    ├── createdAt
    └── updatedAt
```

### UserOrganization (Membership)

Many-to-many relationship for multi-organization support.

```
UserOrganization
├── id (CUID)
├── userId
├── organizationId
├── role (OWNER, ADMIN, MANAGER, AGENT, VIEWER)
├── isPrimary (default org for user)
├── invitedBy
├── invitedAt
├── acceptedAt
├── createdAt
└── updatedAt

Constraints:
└── UNIQUE(userId, organizationId)
```

---

## Call Management Models

### CallLog

Complete record of every phone call.

```
CallLog
├── Identification
│   ├── id (CUID)
│   └── callSid (unique, Twilio ID)
│
├── Call Details
│   ├── direction (INBOUND, OUTBOUND)
│   ├── fromNumber
│   ├── toNumber
│   ├── status (QUEUED, RINGING, IN_PROGRESS, COMPLETED, etc.)
│   ├── duration (seconds)
│   └── waitTime (seconds)
│
├── Recording
│   ├── recordingUrl
│   ├── recordingSid
│   └── recordingDuration
│
├── AI Processing
│   ├── handledByAI
│   ├── aiConfidence
│   ├── transferredToHuman
│   └── transferReason
│
├── Analysis
│   ├── sentiment
│   ├── sentimentScore
│   └── topics (array)
│
├── Costs
│   ├── cost
│   ├── twilioPrice
│   └── aiTokensUsed
│
├── Relations
│   ├── organizationId
│   ├── phoneNumberId
│   ├── handledById
│   ├── transcript (one-to-one)
│   └── lead (one-to-one)
│
└── Timestamps
    ├── createdAt
    └── updatedAt
```

### Transcript

AI-generated transcription and analysis.

```
Transcript
├── id (CUID)
├── callSid (unique, links to CallLog)
│
├── Content
│   ├── fullText (text, complete transcript)
│   └── messages (JSON, structured conversation)
│
├── Analysis
│   ├── summary (text)
│   ├── sentiment
│   ├── sentimentScore
│   ├── keywords (array)
│   ├── topics (array)
│   └── actionItems (JSON)
│
├── Intent Detection
│   ├── primaryIntent
│   ├── intentConfidence
│   └── entities (JSON)
│
├── organizationId
└── createdAt
```

### PhoneNumber

Provisioned phone numbers for each organization.

```
PhoneNumber
├── id (CUID)
├── number (unique, E.164 format)
├── friendlyName
├── twilioSid (unique)
├── capabilities (JSON)
│
├── Routing
│   ├── routeToAI (default: true)
│   ├── routeToUser (user ID)
│   └── routeToQueue
│
├── Customization
│   ├── greeting
│   ├── voiceId
│   └── callFlowId
│
├── status
├── organizationId
├── createdAt
└── updatedAt
```

---

## Lead Management Models

### Lead

Captured caller information and sales pipeline.

```
Lead
├── Identification
│   ├── id (CUID)
│   └── callSid (unique, links to CallLog)
│
├── Contact Information
│   ├── name
│   ├── phone
│   ├── email
│   ├── company
│   ├── jobTitle
│   └── website
│
├── Address
│   ├── address
│   ├── city
│   ├── state
│   ├── country
│   └── postalCode
│
├── Lead Details
│   ├── reason
│   ├── serviceInterest
│   ├── preferredCallbackTime
│   ├── appointmentDate
│   ├── appointmentTime
│   ├── urgency (LOW, MEDIUM, HIGH, CRITICAL)
│   ├── referralSource
│   └── notes (text)
│
├── Scoring
│   ├── score (0-100)
│   └── temperature (HOT, WARM, COLD)
│
├── Pipeline
│   ├── status (NEW, CONTACTED, QUALIFIED, PROPOSAL, etc.)
│   ├── stage
│   └── lostReason
│
├── Value
│   ├── estimatedValue
│   ├── actualValue
│   └── currency
│
├── Assignment
│   ├── assignedToId
│   └── assignedAt
│
├── Attribution
│   ├── source
│   ├── campaign
│   ├── medium
│   └── customFields (JSON)
│
├── organizationId
└── Timestamps
    ├── createdAt
    ├── updatedAt
    ├── convertedAt
    └── closedAt
```

---

## Integration Models

### CalendarIntegration

Connected calendar providers for appointment booking.

```
CalendarIntegration
├── id (CUID)
├── provider (GOOGLE, OUTLOOK, CALENDLY)
├── enabled
│
├── OAuth Tokens
│   ├── accessToken (text, encrypted)
│   ├── refreshToken (text, encrypted)
│   └── tokenExpiresAt
│
├── Calendar Settings
│   ├── calendarId
│   ├── calendarName
│   ├── webhookId
│   ├── defaultDuration (minutes)
│   └── businessHours (JSON)
│
├── Provider-Specific
│   ├── userUri (Calendly)
│   ├── organizationUri (Calendly)
│   └── eventTypeUri (Calendly)
│
├── organizationId
├── connectedById
├── createdAt
└── updatedAt

Constraints:
└── UNIQUE(organizationId, provider)
```

### CalendarBooking

Appointments booked through the AI receptionist.

```
CalendarBooking
├── id (CUID)
│
├── Event Details
│   ├── eventId (external calendar ID)
│   ├── eventLink
│   └── meetLink (video meeting URL)
│
├── Caller Info
│   ├── callerName
│   ├── callerPhone
│   ├── callerEmail
│   └── purpose
│
├── Scheduling
│   ├── scheduledAt
│   ├── duration (minutes)
│   └── timezone
│
├── Status
│   ├── status (PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW)
│   ├── cancelledAt
│   ├── cancelReason
│   ├── completedAt
│   └── noShowMarkedAt
│
├── Source
│   ├── callSid
│   └── bookedByAI
│
├── calendarIntegrationId
├── organizationId
├── createdAt
└── updatedAt
```

### CrmIntegration

Connected CRM providers for lead synchronization.

```
CrmIntegration
├── id (CUID)
├── provider (HUBSPOT, SALESFORCE, ZOHO, PIPEDRIVE, WEBHOOK)
├── enabled
│
├── OAuth Tokens
│   ├── accessToken (text)
│   ├── refreshToken (text)
│   ├── tokenExpiresAt
│   └── instanceUrl (Salesforce, Pipedrive)
│
├── API Configuration
│   ├── apiKey
│   └── webhookUrl
│
├── Sync Settings
│   ├── syncLeads
│   ├── syncCalls
│   ├── syncTranscripts
│   └── syncAppointments
│
├── Mapping
│   ├── fieldMappings (JSON)
│   └── settings (JSON)
│
├── Status
│   ├── lastSyncAt
│   ├── lastSyncStatus (SUCCESS, FAILED, PENDING)
│   └── lastError
│
├── organizationId
├── connectedById
├── createdAt
└── updatedAt

Constraints:
└── UNIQUE(organizationId, provider)
```

### CrmSyncLog

Audit trail for CRM synchronization operations.

```
CrmSyncLog
├── id (CUID)
├── syncType (lead, call, transcript, appointment)
├── entityId (HEKAX entity ID)
├── externalId (CRM entity ID)
├── status (SUCCESS, FAILED, PENDING)
├── error (text)
├── requestData (text, JSON)
├── responseData (text, JSON)
├── crmIntegrationId
└── createdAt
```

---

## Billing and Usage Models

### UsageLog

Detailed usage tracking for billing.

```
UsageLog
├── id (CUID)
├── type (call_minutes, ai_minutes, sms, storage)
├── quantity
├── unit (minutes, messages, bytes)
├── unitCost
├── totalCost
├── periodStart
├── periodEnd
├── organizationId
└── createdAt
```

### Invoice

Stripe invoice records.

```
Invoice
├── id (CUID)
├── stripeInvoiceId (unique)
├── amount (cents)
├── currency
├── status (draft, open, paid, void, uncollectible)
├── periodStart
├── periodEnd
├── paidAt
├── pdfUrl
├── hostedUrl
├── organizationId
└── createdAt
```

### AddOnPurchase

One-time minute pack purchases.

```
AddOnPurchase
├── id (CUID)
├── type (CALL_MINUTES, AI_MINUTES, BUNDLE)
├── productId
├── productName
│
├── Minutes
│   ├── callMinutes
│   ├── aiMinutes
│   ├── usedCallMinutes
│   └── usedAiMinutes
│
├── Payment
│   ├── priceCents
│   ├── stripePaymentId
│   └── stripeInvoiceId
│
├── status (ACTIVE, EXHAUSTED, EXPIRED, REFUNDED)
├── organizationId
├── purchasedAt
├── exhaustedAt
├── createdAt
└── updatedAt
```

### UsageAlert

Usage threshold notifications.

```
UsageAlert
├── id (CUID)
├── type (usage_warning_80, usage_warning_90, etc.)
├── title
├── message
├── severity (info, warning, error)
├── data (text, JSON)
├── dismissed
├── dismissedAt
├── organizationId
└── createdAt
```

---

## Security and Compliance Models

### AuditLog

Comprehensive audit trail for all actions.

```
AuditLog
├── id (CUID)
│
├── Actor
│   ├── actorType (user, system, api)
│   ├── actorId
│   └── actorEmail
│
├── Action
│   ├── action
│   ├── entityType
│   └── entityId
│
├── Changes
│   ├── oldValues (text, JSON)
│   ├── newValues (text, JSON)
│   └── metadata (text, JSON)
│
├── Context
│   ├── ipAddress
│   └── userAgent (text)
│
├── organizationId
└── createdAt
```

### ApiKey

Enterprise API access tokens.

```
ApiKey
├── id (CUID)
├── name
├── keyHash (unique, only shown once)
├── keyPrefix (first 8 chars for identification)
├── permissions (array: read, write, calls, leads)
├── lastUsedAt
├── expiresAt
├── revokedAt
├── createdById
├── organizationId
├── createdAt
└── updatedAt
```

### DataExportRequest

GDPR/CCPA data export requests.

```
DataExportRequest
├── id (CUID)
├── type (full_export, calls_only, leads_only, transcripts_only)
├── status (pending, processing, completed, failed, expired)
├── format (json, csv, zip)
├── fileUrl
├── fileSize
├── expiresAt
├── requestedBy
├── requestedAt
├── completedAt
├── errorMessage
└── organizationId
```

### CleanupLog

Data retention cleanup audit trail.

```
CleanupLog
├── id (CUID)
├── type (scheduled, manual, gdpr_request)
├── dataType (calls, transcripts, recordings, leads, audit_logs)
├── recordsDeleted
├── bytesFreed (BigInt)
├── cutoffDate
├── status (completed, partial, failed)
├── errorMessage
├── triggeredBy
├── organizationId
└── createdAt
```

---

## Enumerations

### Status Enums

```
OrgStatus: ACTIVE | SUSPENDED | TRIAL | CANCELLED | PENDING_SETUP
UserStatus: ACTIVE | INACTIVE | INVITED | SUSPENDED
CallStatus: QUEUED | RINGING | IN_PROGRESS | COMPLETED | BUSY | NO_ANSWER | FAILED | CANCELLED | VOICEMAIL
LeadStatus: NEW | CONTACTED | QUALIFIED | PROPOSAL | NEGOTIATION | WON | LOST | UNQUALIFIED
```

### Type Enums

```
Plan: TRIAL | STARTER | BUSINESS_PRO | SCALE
UserRole: OWNER | ADMIN | MANAGER | AGENT | VIEWER
CallDirection: INBOUND | OUTBOUND
LeadUrgency: LOW | MEDIUM | HIGH | CRITICAL
LeadTemp: HOT | WARM | COLD
CalendarProviderType: GOOGLE | OUTLOOK | CALENDLY
CRMProviderType: HUBSPOT | SALESFORCE | ZOHO | PIPEDRIVE | WEBHOOK
AddOnType: CALL_MINUTES | AI_MINUTES | BUNDLE
```

---

## Indexes

### Performance Indexes

```sql
-- Organization
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- User
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_currentOrgId_idx" ON "User"("currentOrgId");

-- UserOrganization
CREATE INDEX "UserOrganization_userId_idx" ON "UserOrganization"("userId");
CREATE INDEX "UserOrganization_organizationId_idx" ON "UserOrganization"("organizationId");

-- CallLog
CREATE INDEX "CallLog_organizationId_idx" ON "CallLog"("organizationId");
CREATE INDEX "CallLog_callSid_idx" ON "CallLog"("callSid");
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");
CREATE INDEX "CallLog_createdAt_idx" ON "CallLog"("createdAt");

-- Lead
CREATE INDEX "Lead_organizationId_idx" ON "Lead"("organizationId");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- Transcript
CREATE INDEX "Transcript_organizationId_idx" ON "Transcript"("organizationId");
CREATE INDEX "Transcript_callSid_idx" ON "Transcript"("callSid");

-- AuditLog
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
```

---

## Data Retention

### Default Retention Periods

| Data Type | Default Retention | Configurable |
|-----------|------------------|--------------|
| Call Logs | 90 days | Yes |
| Transcripts | 90 days | Yes |
| Recordings | 30 days | Yes |
| Closed Leads | 365 days | Yes |
| Audit Logs | 365 days | Yes |

### Cleanup Process

```
Daily Cleanup Job:
1. Check each organization's retention settings
2. Identify records older than retention period
3. Delete in batches (1000 records per batch)
4. Log cleanup in CleanupLog table
5. Update lastCleanupAt timestamp
```

---

## Migration Strategy

### Prisma Migrations

```bash
# Create migration
npx prisma migrate dev --name add_feature_x

# Deploy migration
npx prisma migrate deploy

# Reset database (dev only)
npx prisma migrate reset
```

### Migration Best Practices

1. **Backwards Compatible**: Add nullable columns first
2. **Data Migrations**: Separate from schema migrations
3. **Rollback Plan**: Document rollback steps for each migration
4. **Testing**: Test migrations against production data copy

---

*This document is updated when database schema changes.*
