# HEKAX Phone API Documentation

## Base URL
```
https://api.hekaxphone.com/api
```

## Authentication

All API endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Get Token

**POST** `/auth/login`

```json
{
  "email": "user@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "ADMIN"
  }
}
```

---

## Authentication Endpoints

### Register
**POST** `/auth/register`

```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe",
  "orgName": "My Company"
}
```

### Refresh Token
**POST** `/auth/refresh`

```json
{
  "refreshToken": "your-refresh-token"
}
```

### Logout
**POST** `/auth/logout`

### Get Current User
**GET** `/auth/me`

---

## Calls

### List Calls
**GET** `/calls`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | number | Results per page (default: 50, max: 500) |
| offset | number | Pagination offset |
| status | string | Filter by status (COMPLETED, FAILED, etc.) |
| startDate | date | Filter calls after this date |
| endDate | date | Filter calls before this date |

**Response:**
```json
{
  "calls": [
    {
      "id": "uuid",
      "from": "+14155551234",
      "to": "+14155555678",
      "status": "COMPLETED",
      "duration": 125,
      "direction": "INBOUND",
      "handledBy": "AI",
      "sentiment": "POSITIVE",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 150,
  "hasMore": true
}
```

### Get Call Details
**GET** `/calls/:id`

### Get Call Transcript
**GET** `/calls/:id/transcript`

### Get Call Recording
**GET** `/calls/:id/recording`

---

## Leads

### List Leads
**GET** `/leads`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status |
| urgency | string | Filter by urgency (HIGH, MEDIUM, LOW) |
| limit | number | Results per page |

**Response:**
```json
{
  "leads": [
    {
      "id": "uuid",
      "name": "John Smith",
      "phone": "+14155551234",
      "email": "john@company.com",
      "status": "QUALIFIED",
      "urgency": "HIGH",
      "temperature": "HOT",
      "notes": "Interested in premium plan",
      "callCount": 3,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Lead
**GET** `/leads/:id`

### Update Lead
**PATCH** `/leads/:id`

```json
{
  "status": "CONTACTED",
  "notes": "Left voicemail",
  "urgency": "MEDIUM"
}
```

### Delete Lead
**DELETE** `/leads/:id`

---

## Phone Numbers

### Search Available Numbers
**GET** `/phone-numbers/search`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| areaCode | string | 3-digit area code |
| country | string | Country code (default: US) |
| type | string | local, tollfree, mobile |
| contains | string | Pattern to match |

### List Organization Numbers
**GET** `/phone-numbers`

### Purchase Number
**POST** `/phone-numbers/purchase`

```json
{
  "phoneNumber": "+14155551234"
}
```

### Update Number Settings
**PATCH** `/phone-numbers/:id`

```json
{
  "friendlyName": "Main Line",
  "routeToAI": true,
  "voiceId": "alloy"
}
```

### Release Number
**DELETE** `/phone-numbers/:id`

---

## Team

### List Team Members
**GET** `/team`

### Invite Member
**POST** `/team/invite`

```json
{
  "email": "newmember@company.com",
  "name": "Jane Smith",
  "role": "AGENT"
}
```

**Roles:** `AGENT`, `MANAGER`, `ADMIN`, `OWNER`

### Update Member
**PATCH** `/team/:id`

```json
{
  "role": "MANAGER",
  "status": "ACTIVE"
}
```

### Remove Member
**DELETE** `/team/:id`

---

## Analytics

### Get Dashboard Analytics
**GET** `/analytics`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| startDate | date | Start of period |
| endDate | date | End of period |
| granularity | string | day, week, month |

### Get Call Metrics
**GET** `/analytics/calls`

### Get Sentiment Analysis
**GET** `/analytics/sentiment`

### Get Peak Hours
**GET** `/analytics/peak-hours`

### Get AI Performance
**GET** `/analytics/ai-performance`

### Get Lead Conversion
**GET** `/analytics/leads`

---

## Organization

### Get Organization
**GET** `/organization`

### Update Organization
**PATCH** `/organization`

```json
{
  "name": "My Company",
  "greeting": "Thank you for calling!",
  "aiEnabled": true,
  "voiceId": "nova",
  "personality": "friendly and professional",
  "timezone": "America/New_York"
}
```

### Get Organization Settings
**GET** `/organization/settings`

---

## Billing

### Get Current Plan
**GET** `/billing/plan`

### Get Usage Stats
**GET** `/billing/usage`

### Get Invoices
**GET** `/billing/invoices`

### Create Checkout Session
**POST** `/billing/checkout`

```json
{
  "plan": "GROWTH"
}
```

### Create Portal Session
**POST** `/billing/portal`

---

## Automation

### List Automation Rules
**GET** `/automation`

### Create Rule
**POST** `/automation`

```json
{
  "name": "VIP Lead Alert",
  "trigger": "lead_created",
  "conditions": [
    {
      "field": "temperature",
      "operator": "equals",
      "value": "HOT"
    }
  ],
  "actions": [
    {
      "type": "notify_team",
      "config": {
        "message": "New VIP lead!"
      }
    }
  ],
  "enabled": true
}
```

### Update Rule
**PATCH** `/automation/:id`

### Delete Rule
**DELETE** `/automation/:id`

### Test Rule
**POST** `/automation/:id/test`

---

## Webhooks

### List Webhooks
**GET** `/webhook`

### Create Webhook
**POST** `/webhook`

```json
{
  "url": "https://your-server.com/webhook",
  "events": ["call.completed", "lead.created"],
  "secret": "your-webhook-secret"
}
```

### Update Webhook
**PATCH** `/webhook/:id`

### Delete Webhook
**DELETE** `/webhook/:id`

---

## API Keys

### List API Keys
**GET** `/api-keys`

### Create API Key
**POST** `/api-keys`

```json
{
  "name": "Production Key",
  "permissions": ["calls:read", "leads:read", "analytics:read"],
  "expiresInDays": 365
}
```

### Revoke API Key
**DELETE** `/api-keys/:id`

---

## Data Management

### Export Data
**POST** `/data/export`

```json
{
  "type": "full_export",
  "format": "json"
}
```

### Get Export Status
**GET** `/data/exports`

### Update Retention Settings
**PATCH** `/data/retention`

```json
{
  "retentionEnabled": true,
  "retentionCallDays": 365,
  "retentionRecordingDays": 90
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid/missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

---

## Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| Authentication | 10 requests/minute |
| General API | 100 requests/minute |
| Analytics | 30 requests/minute |
| Exports | 5 requests/hour |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Webhook Events

### Call Events
- `call.initiated` - Call started
- `call.completed` - Call ended
- `call.failed` - Call failed
- `call.transcribed` - Transcript ready

### Lead Events
- `lead.created` - New lead captured
- `lead.updated` - Lead status changed
- `lead.converted` - Lead marked as won

### Team Events
- `member.invited` - Team member invited
- `member.joined` - Member accepted invite
- `member.removed` - Member removed

---

## SDK Examples

### JavaScript/Node.js
```javascript
const response = await fetch('https://api.hekaxphone.com/api/calls', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
```

### cURL
```bash
curl -X GET "https://api.hekaxphone.com/api/calls" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Python
```python
import requests

response = requests.get(
    "https://api.hekaxphone.com/api/calls",
    headers={"Authorization": f"Bearer {token}"}
)
data = response.json()
```
