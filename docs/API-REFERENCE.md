# API Reference

**Complete REST API Documentation**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone provides a RESTful API for all platform operations. All endpoints require authentication unless otherwise noted.

---

## Base URL

```
Production: https://api.hekax.com/api
Development: http://localhost:3000/api
```

---

## Authentication

### Headers

All authenticated requests require:

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Token Structure

```json
{
  "userId": "user_abc123",
  "organizationId": "org_xyz789",
  "role": "OWNER",
  "iat": 1701849600,
  "exp": 1701936000
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Rate Limited |
| 500 | Server Error |

---

## Authentication Endpoints

### POST /auth/signup

Create a new account and organization.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe",
  "orgName": "Acme Corp"
}
```

**Response:** `201 Created`

```json
{
  "user": {
    "id": "user_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": false
  },
  "organization": {
    "id": "org_xyz789",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "TRIAL"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### POST /auth/login

Authenticate and receive access token.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response:** `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "OWNER"
  },
  "organization": {
    "id": "org_xyz789",
    "name": "Acme Corp",
    "plan": "BUSINESS_PRO"
  }
}
```

---

### POST /auth/verify-email

Verify email with code.

**Request:**

```json
{
  "code": "123456"
}
```

**Response:** `200 OK`

```json
{
  "verified": true
}
```

---

### POST /auth/forgot-password

Request password reset.

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`

```json
{
  "message": "If an account exists, a reset link has been sent"
}
```

---

### POST /auth/reset-password

Reset password with token.

**Request:**

```json
{
  "token": "reset_token_here",
  "password": "NewSecurePass123"
}
```

**Response:** `200 OK`

```json
{
  "success": true
}
```

---

## Organization Endpoints

### GET /organization

Get current organization details.

**Response:** `200 OK`

```json
{
  "id": "org_xyz789",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "status": "ACTIVE",
  "plan": "BUSINESS_PRO",
  "twilioNumber": "+15551234567",
  "aiEnabled": true,
  "voiceId": "nova",
  "greeting": "Thank you for calling Acme Corp...",
  "timezone": "America/New_York",
  "businessHours": {
    "monday": { "start": "09:00", "end": "17:00" },
    "tuesday": { "start": "09:00", "end": "17:00" }
  },
  "usedCallMinutes": 450,
  "usedAIMinutes": 120,
  "monthlyCallMinutes": 2000,
  "monthlyAIMinutes": 500
}
```

---

### PATCH /organization

Update organization settings.

**Request:**

```json
{
  "name": "Acme Corporation",
  "greeting": "Hello, thanks for calling...",
  "voiceId": "sage",
  "aiEnabled": true,
  "timezone": "America/Los_Angeles"
}
```

**Response:** `200 OK`

```json
{
  "id": "org_xyz789",
  "name": "Acme Corporation",
  "...": "..."
}
```

---

### PATCH /organization/ai-settings

Update AI receptionist configuration.

**Request:**

```json
{
  "systemPrompt": "You are a professional receptionist...",
  "voiceId": "nova",
  "maxCallDuration": 600,
  "maxTurns": 20,
  "aiTemperature": 0.7
}
```

**Response:** `200 OK`

---

## Team Endpoints

### GET /team

List team members.

**Response:** `200 OK`

```json
{
  "members": [
    {
      "id": "user_abc123",
      "email": "owner@example.com",
      "name": "John Doe",
      "role": "OWNER",
      "status": "ACTIVE",
      "lastLoginAt": "2024-12-06T10:00:00Z"
    },
    {
      "id": "user_def456",
      "email": "agent@example.com",
      "name": "Jane Smith",
      "role": "AGENT",
      "status": "ACTIVE"
    }
  ],
  "total": 2,
  "limit": 5
}
```

---

### POST /team/invite

Invite a new team member.

**Required Role:** OWNER, ADMIN

**Request:**

```json
{
  "email": "newmember@example.com",
  "role": "AGENT",
  "name": "New Member"
}
```

**Response:** `201 Created`

```json
{
  "invitation": {
    "id": "inv_abc123",
    "email": "newmember@example.com",
    "role": "AGENT",
    "status": "PENDING",
    "expiresAt": "2024-12-13T10:00:00Z"
  }
}
```

---

### PATCH /team/:userId/role

Update team member role.

**Required Role:** OWNER, ADMIN

**Request:**

```json
{
  "role": "MANAGER"
}
```

**Response:** `200 OK`

---

### DELETE /team/:userId

Remove team member.

**Required Role:** OWNER, ADMIN

**Response:** `200 OK`

```json
{
  "removed": true
}
```

---

## Calls Endpoints

### GET /calls

List call history with filtering.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Results per page (default: 20, max: 100) |
| direction | string | INBOUND or OUTBOUND |
| status | string | Call status filter |
| dateFrom | string | Start date (ISO 8601) |
| dateTo | string | End date (ISO 8601) |
| handledByAI | boolean | AI-handled calls only |

**Response:** `200 OK`

```json
{
  "calls": [
    {
      "id": "call_abc123",
      "callSid": "CAxxxxxxxxxxxxxxxx",
      "direction": "INBOUND",
      "fromNumber": "+15551234567",
      "toNumber": "+15559876543",
      "status": "COMPLETED",
      "duration": 180,
      "handledByAI": true,
      "aiConfidence": 0.95,
      "sentiment": "positive",
      "createdAt": "2024-12-06T10:00:00Z",
      "hasTranscript": true,
      "hasRecording": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

### GET /calls/:id

Get call details with transcript.

**Response:** `200 OK`

```json
{
  "id": "call_abc123",
  "callSid": "CAxxxxxxxxxxxxxxxx",
  "direction": "INBOUND",
  "fromNumber": "+15551234567",
  "toNumber": "+15559876543",
  "status": "COMPLETED",
  "duration": 180,
  "handledByAI": true,
  "transcript": {
    "fullText": "AI: Thank you for calling...\nCaller: Hi, I'm interested in...",
    "messages": [
      {
        "role": "assistant",
        "content": "Thank you for calling Acme Corp. How may I help you?",
        "timestamp": "2024-12-06T10:00:05Z"
      },
      {
        "role": "user",
        "content": "Hi, I'm interested in your services.",
        "timestamp": "2024-12-06T10:00:12Z"
      }
    ],
    "summary": "Caller inquired about services. Lead captured.",
    "sentiment": "positive"
  },
  "lead": {
    "id": "lead_xyz789",
    "name": "John Smith",
    "phone": "+15551234567"
  }
}
```

---

### GET /calls/:id/recording

Get signed URL for call recording.

**Response:** `200 OK`

```json
{
  "url": "https://s3.amazonaws.com/recordings/...",
  "expiresAt": "2024-12-06T10:15:00Z"
}
```

---

## Leads Endpoints

### GET /leads

List leads with filtering.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number |
| limit | number | Results per page |
| status | string | Lead status filter |
| temperature | string | HOT, WARM, COLD |
| urgency | string | LOW, MEDIUM, HIGH, CRITICAL |
| assignedTo | string | User ID |
| search | string | Search name/phone/email |

**Response:** `200 OK`

```json
{
  "leads": [
    {
      "id": "lead_xyz789",
      "name": "John Smith",
      "phone": "+15551234567",
      "email": "john@example.com",
      "company": "Smith Industries",
      "reason": "Interested in enterprise plan",
      "status": "NEW",
      "temperature": "HOT",
      "urgency": "HIGH",
      "score": 85,
      "createdAt": "2024-12-06T10:00:00Z",
      "assignedTo": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45
  }
}
```

---

### GET /leads/:id

Get lead details.

**Response:** `200 OK`

```json
{
  "id": "lead_xyz789",
  "name": "John Smith",
  "phone": "+15551234567",
  "email": "john@example.com",
  "company": "Smith Industries",
  "jobTitle": "CEO",
  "reason": "Interested in enterprise plan",
  "serviceInterest": "AI Receptionist",
  "status": "QUALIFIED",
  "temperature": "HOT",
  "urgency": "HIGH",
  "score": 85,
  "estimatedValue": 5000,
  "notes": "Follow up next week",
  "call": {
    "id": "call_abc123",
    "duration": 180,
    "createdAt": "2024-12-06T10:00:00Z"
  },
  "createdAt": "2024-12-06T10:00:00Z",
  "updatedAt": "2024-12-06T12:00:00Z"
}
```

---

### PATCH /leads/:id

Update lead.

**Request:**

```json
{
  "status": "CONTACTED",
  "notes": "Scheduled demo for next week",
  "assignedToId": "user_abc123"
}
```

**Response:** `200 OK`

---

### POST /leads/:id/convert

Convert lead to customer.

**Request:**

```json
{
  "actualValue": 4800,
  "notes": "Signed annual contract"
}
```

**Response:** `200 OK`

---

## Usage Endpoints

### GET /usage

Get current usage statistics.

**Response:** `200 OK`

```json
{
  "period": {
    "start": "2024-12-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  },
  "callMinutes": {
    "used": 450,
    "limit": 2000,
    "percentage": 22.5,
    "addon": 0
  },
  "aiMinutes": {
    "used": 120,
    "limit": 500,
    "percentage": 24,
    "addon": 100
  },
  "phoneNumbers": {
    "current": 2,
    "limit": 3
  },
  "teamMembers": {
    "current": 4,
    "limit": 5
  }
}
```

---

### GET /usage/history

Get usage history by period.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| period | string | daily, weekly, monthly |
| months | number | Number of months (max: 12) |

**Response:** `200 OK`

```json
{
  "history": [
    {
      "period": "2024-12",
      "callMinutes": 450,
      "aiMinutes": 120,
      "calls": 85,
      "leads": 23
    },
    {
      "period": "2024-11",
      "callMinutes": 520,
      "aiMinutes": 145,
      "calls": 92,
      "leads": 28
    }
  ]
}
```

---

## Billing Endpoints

### GET /billing

Get billing information.

**Response:** `200 OK`

```json
{
  "plan": "BUSINESS_PRO",
  "status": "ACTIVE",
  "billingCycle": "monthly",
  "currentPeriod": {
    "start": "2024-12-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  },
  "nextBillingDate": "2025-01-01T00:00:00Z",
  "amount": 7900,
  "currency": "usd"
}
```

---

### POST /billing/create-checkout

Create Stripe checkout session.

**Request:**

```json
{
  "priceId": "price_xxxxx",
  "interval": "monthly"
}
```

**Response:** `200 OK`

```json
{
  "url": "https://checkout.stripe.com/..."
}
```

---

### POST /billing/create-portal

Create Stripe billing portal session.

**Response:** `200 OK`

```json
{
  "url": "https://billing.stripe.com/..."
}
```

---

### GET /billing/invoices

Get invoice history.

**Response:** `200 OK`

```json
{
  "invoices": [
    {
      "id": "inv_abc123",
      "amount": 7900,
      "currency": "usd",
      "status": "paid",
      "date": "2024-12-01T00:00:00Z",
      "pdfUrl": "https://..."
    }
  ]
}
```

---

### POST /billing/purchase-addon

Purchase minute add-on pack.

**Request:**

```json
{
  "productId": "call_boost_1000"
}
```

**Response:** `200 OK`

```json
{
  "clientSecret": "pi_xxx_secret_xxx"
}
```

---

## CRM Integration Endpoints

### GET /crm/providers

List available CRM providers.

**Response:** `200 OK`

```json
{
  "providers": [
    {
      "id": "hubspot",
      "name": "HubSpot",
      "connected": true
    },
    {
      "id": "salesforce",
      "name": "Salesforce",
      "connected": false
    }
  ]
}
```

---

### GET /crm/connect/:provider

Get OAuth authorization URL.

**Response:** `200 OK`

```json
{
  "authUrl": "https://app.hubspot.com/oauth/authorize?..."
}
```

---

### DELETE /crm/integrations/:id

Disconnect CRM integration.

**Response:** `200 OK`

```json
{
  "disconnected": true
}
```

---

## Calendar Integration Endpoints

### GET /calendar/providers

List available calendar providers.

**Response:** `200 OK`

```json
{
  "providers": [
    {
      "id": "google",
      "name": "Google Calendar",
      "connected": true
    },
    {
      "id": "outlook",
      "name": "Microsoft Outlook",
      "connected": false
    }
  ]
}
```

---

### GET /calendar/availability

Check available appointment slots.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| date | string | Date to check (YYYY-MM-DD) |
| duration | number | Appointment duration in minutes |

**Response:** `200 OK`

```json
{
  "date": "2024-12-10",
  "slots": [
    { "start": "09:00", "end": "09:30" },
    { "start": "10:00", "end": "10:30" },
    { "start": "14:00", "end": "14:30" }
  ]
}
```

---

### POST /calendar/book

Book an appointment.

**Request:**

```json
{
  "date": "2024-12-10",
  "time": "10:00",
  "duration": 30,
  "callerName": "John Smith",
  "callerPhone": "+15551234567",
  "callerEmail": "john@example.com",
  "purpose": "Product demo"
}
```

**Response:** `201 Created`

```json
{
  "booking": {
    "id": "booking_abc123",
    "scheduledAt": "2024-12-10T10:00:00Z",
    "duration": 30,
    "meetLink": "https://meet.google.com/xxx-xxxx-xxx",
    "status": "CONFIRMED"
  }
}
```

---

## Phone Numbers Endpoints

### GET /phone-numbers

List organization phone numbers.

**Response:** `200 OK`

```json
{
  "numbers": [
    {
      "id": "pn_abc123",
      "number": "+15551234567",
      "friendlyName": "Main Line",
      "routeToAI": true,
      "status": "active"
    }
  ]
}
```

---

### GET /phone-numbers/available

Search available phone numbers.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| areaCode | string | Area code (e.g., "415") |
| contains | string | Number pattern |
| country | string | Country code (default: US) |

**Response:** `200 OK`

```json
{
  "numbers": [
    {
      "number": "+14155551234",
      "friendlyName": "(415) 555-1234",
      "region": "CA",
      "capabilities": {
        "voice": true,
        "sms": true,
        "mms": true
      }
    }
  ]
}
```

---

### POST /phone-numbers/purchase

Purchase a phone number.

**Request:**

```json
{
  "number": "+14155551234",
  "friendlyName": "Sales Line"
}
```

**Response:** `201 Created`

---

## Voice Endpoints

### POST /voice/incoming

Twilio webhook for incoming calls.

**Note:** This endpoint is called by Twilio, not the frontend.

---

### GET /voice/token

Get WebRTC access token for softphone.

**Response:** `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "identity": "user_abc123",
  "expiresAt": "2024-12-06T11:00:00Z"
}
```

---

## Stats Endpoints

### GET /stats/dashboard

Get dashboard statistics.

**Response:** `200 OK`

```json
{
  "today": {
    "calls": 12,
    "leads": 4,
    "avgDuration": 145,
    "aiHandled": 10
  },
  "thisWeek": {
    "calls": 85,
    "leads": 23,
    "avgDuration": 156,
    "aiHandled": 72
  },
  "thisMonth": {
    "calls": 320,
    "leads": 89,
    "avgDuration": 148,
    "aiHandled": 280
  }
}
```

---

## Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 5 requests | 1 minute |
| General API | 100 requests | 1 minute |
| AI Operations | 10 concurrent | Per org |
| Webhooks | 1000 requests | 1 minute |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1701849660
```

---

## Webhooks (Outbound)

### Webhook Events

| Event | Description |
|-------|-------------|
| lead.captured | New lead from AI call |
| call.started | Incoming call began |
| call.completed | Call ended |
| call.transferred | Call transferred to human |
| appointment.created | AI booked appointment |
| appointment.cancelled | Appointment cancelled |

### Webhook Payload

```json
{
  "event": "lead.captured",
  "timestamp": "2024-12-06T10:30:00Z",
  "organizationId": "org_xyz789",
  "data": {
    "leadId": "lead_abc123",
    "name": "John Smith",
    "phone": "+15551234567",
    "email": "john@example.com",
    "reason": "Interested in services",
    "callId": "call_def456"
  }
}
```

### Webhook Security

```
X-HEKAX-Signature: sha256=xxxxxxxxxxxxxxxx
X-HEKAX-Timestamp: 1701849600
```

---

*This document is updated when API endpoints change.*
