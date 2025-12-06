# Third-Party Integrations

**CRM, Calendar, and Webhook Integration Documentation**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone integrates with popular business tools to synchronize data and automate workflows. All integrations use OAuth 2.0 where available for secure, user-authorized connections.

---

## Integration Architecture

```
                    Integration Layer Architecture

    +------------------+     +------------------+     +------------------+
    |   CRM Service    |     |Calendar Service  |     |Webhook Service   |
    +--------+---------+     +--------+---------+     +--------+---------+
             |                        |                        |
             v                        v                        v
    +--------+---------+     +--------+---------+     +--------+---------+
    |  Provider Layer  |     |  Provider Layer  |     |  Delivery Layer  |
    +--------+---------+     +--------+---------+     +--------+---------+
             |                        |                        |
      +------+------+          +------+------+                 |
      |      |      |          |      |      |                 |
      v      v      v          v      v      v                 v
   +---+  +---+  +---+      +---+  +---+  +---+           +----+----+
   |Hub|  |SF |  |Zoho|     |Ggl|  |Out|  |Cal|           |HTTP POST|
   |Spt|  |   |  |   |      |Cal|  |lok|  |dly|           |to URL   |
   +---+  +---+  +---+      +---+  +---+  +---+           +---------+
```

---

## CRM Integrations

### Supported Providers

| Provider | OAuth | Features | API Type |
|----------|-------|----------|----------|
| HubSpot | Yes | Contacts, Deals, Tasks, Notes | REST |
| Salesforce | Yes | Leads, Contacts, Tasks, Events | REST |
| Zoho CRM | Yes | Leads, Calls, Events, Notes | REST |
| Pipedrive | Yes | Persons, Activities, Deals, Notes | REST |

### OAuth Flow

```
                    CRM OAuth Connection Flow

    User                    HEKAX                    CRM Provider
      |                       |                           |
      |  1. Click Connect     |                           |
      |---------------------->|                           |
      |                       |                           |
      |                       |  2. Generate state token  |
      |                       |  3. Build auth URL        |
      |                       |                           |
      |  4. Redirect to CRM   |                           |
      |<----------------------|                           |
      |                       |                           |
      |  5. Login & Authorize |                           |
      |---------------------------------------------->    |
      |                       |                           |
      |  6. Redirect with code|                           |
      |<----------------------------------------------|   |
      |                       |                           |
      |  7. Forward code      |                           |
      |---------------------->|                           |
      |                       |                           |
      |                       |  8. Exchange code         |
      |                       |-------------------------->|
      |                       |                           |
      |                       |  9. Access + Refresh token|
      |                       |<--------------------------|
      |                       |                           |
      |                       | 10. Store encrypted tokens|
      |                       |                           |
      | 11. Success redirect  |                           |
      |<----------------------|                           |
```

### Data Synchronization

#### What Gets Synced

| HEKAX Event | CRM Action |
|-------------|------------|
| Lead captured | Create Contact/Lead |
| Call completed | Log Activity |
| Transcript ready | Attach Note |
| Appointment booked | Create Event/Task |

#### Sync Configuration

```json
{
  "integrationId": "int_abc123",
  "provider": "HUBSPOT",
  "syncSettings": {
    "syncLeads": true,
    "syncCalls": true,
    "syncTranscripts": true,
    "syncAppointments": true
  },
  "fieldMapping": {
    "callerName": "firstname,lastname",
    "callerPhone": "phone",
    "callerEmail": "email",
    "reason": "description"
  }
}
```

---

### HubSpot Integration

#### Setup Requirements

1. HubSpot account (free or paid)
2. OAuth app created in HubSpot developer portal
3. Required scopes: `crm.objects.contacts.write`, `crm.objects.deals.write`

#### Environment Variables

```
HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
```

#### API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /crm/v3/objects/contacts` | Create contact |
| `POST /crm/v3/objects/deals` | Create deal |
| `POST /crm/v3/objects/notes` | Add note |
| `POST /engagements/v1/engagements` | Log call activity |

#### Data Mapping

```
HEKAX Lead           ->    HubSpot Contact
-----------                ---------------
name                 ->    firstname + lastname
phone                ->    phone
email                ->    email
reason               ->    lead_status (note)
source               ->    hs_lead_status = "NEW"
```

---

### Salesforce Integration

#### Setup Requirements

1. Salesforce account (any edition)
2. Connected App in Salesforce Setup
3. Required scopes: `api`, `refresh_token`

#### Environment Variables

```
SALESFORCE_CLIENT_ID=your_consumer_key
SALESFORCE_CLIENT_SECRET=your_consumer_secret
```

#### API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /services/data/vXX.0/sobjects/Lead` | Create lead |
| `POST /services/data/vXX.0/sobjects/Task` | Create task |
| `POST /services/data/vXX.0/sobjects/Event` | Create event |

#### Data Mapping

```
HEKAX Lead           ->    Salesforce Lead
-----------                ---------------
name                 ->    FirstName + LastName
phone                ->    Phone
email                ->    Email
company              ->    Company (required)
reason               ->    Description
```

---

### Zoho CRM Integration

#### Setup Requirements

1. Zoho CRM account
2. API client in Zoho API Console
3. Required scopes: `ZohoCRM.modules.ALL`

#### Environment Variables

```
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
```

#### Data Mapping

```
HEKAX Lead           ->    Zoho Lead
-----------                ----------
name                 ->    Last_Name (First_Name)
phone                ->    Phone
email                ->    Email
reason               ->    Description
```

---

### Pipedrive Integration

#### Setup Requirements

1. Pipedrive account
2. OAuth app in Pipedrive Developer Hub
3. Scopes: `contacts:full`, `deals:full`, `activities:full`

#### Environment Variables

```
PIPEDRIVE_CLIENT_ID=your_client_id
PIPEDRIVE_CLIENT_SECRET=your_client_secret
```

#### Data Mapping

```
HEKAX Lead           ->    Pipedrive Person
-----------                ----------------
name                 ->    name
phone                ->    phone[0].value
email                ->    email[0].value
```

---

## Calendar Integrations

### Supported Providers

| Provider | OAuth | Features |
|----------|-------|----------|
| Google Calendar | Yes | Events, Availability, Meet links |
| Microsoft Outlook | Yes | Events, Availability, Teams links |
| Calendly | Yes | Event types, Bookings |

### Calendar OAuth Flow

Same OAuth 2.0 flow as CRM integrations with provider-specific scopes.

---

### Google Calendar

#### Setup Requirements

1. Google Cloud project
2. OAuth consent screen configured
3. Calendar API enabled

#### Environment Variables

```
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
```

#### Scopes Required

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

#### Features

- Read calendar availability
- Create events with attendees
- Generate Google Meet links
- Access multiple calendars

---

### Microsoft Outlook

#### Setup Requirements

1. Azure AD app registration
2. Microsoft Graph API permissions

#### Environment Variables

```
MICROSOFT_CLIENT_ID=your_application_id
MICROSOFT_CLIENT_SECRET=your_client_secret
```

#### Scopes Required

```
Calendars.ReadWrite
User.Read
```

#### Features

- Read calendar availability
- Create events
- Generate Teams meeting links
- Access shared calendars

---

### Calendly

#### Setup Requirements

1. Calendly account (Professional or higher)
2. OAuth app in Calendly integrations

#### Environment Variables

```
CALENDLY_CLIENT_ID=your_client_id
CALENDLY_CLIENT_SECRET=your_client_secret
```

#### Features

- List event types
- Get booking availability
- Create invitee bookings
- Webhook for booking notifications

---

## Webhook Integration

### Overview

Webhooks allow HEKAX Phone to send real-time notifications to external systems when events occur.

### Supported Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `lead.captured` | New lead from AI | Lead details |
| `call.started` | Incoming call begins | Call metadata |
| `call.completed` | Call ends | Duration, transcript |
| `call.transferred` | Call transferred | Transfer details |
| `appointment.created` | AI books appointment | Booking details |
| `appointment.cancelled` | Appointment cancelled | Cancellation reason |

### Webhook Configuration

```json
{
  "webhookUrl": "https://your-system.com/webhook",
  "secret": "whsec_xxxxxxxxxxxx",
  "events": [
    "lead.captured",
    "call.completed",
    "appointment.created"
  ],
  "enabled": true
}
```

### Payload Format

```json
{
  "event": "lead.captured",
  "timestamp": "2024-12-06T10:30:00Z",
  "organizationId": "org_abc123",
  "data": {
    "leadId": "lead_xyz789",
    "name": "John Smith",
    "phone": "+1234567890",
    "email": "john@example.com",
    "reason": "Interested in services",
    "source": "AI_CALL",
    "callId": "call_def456"
  }
}
```

### Security

#### HMAC Signature Verification

All webhooks include a signature header for verification:

```
X-HEKAX-Signature: sha256=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Verification Code

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return `sha256=${expected}` === signature;
}
```

### Retry Policy

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | Immediate | 0s |
| 2 | 30 seconds | 30s |
| 3 | 2 minutes | 2.5min |
| 4 | 10 minutes | 12.5min |
| 5 | 30 minutes | 42.5min |

After 5 failed attempts, the webhook is marked as failing and admin is notified.

---

## Integration Use Cases

### Zapier Integration

Connect HEKAX to 5,000+ apps via Zapier:

```
Trigger: HEKAX Webhook (lead.captured)
    |
    v
Action: Google Sheets (Add Row)
    |
    v
Action: Slack (Send Message)
    |
    v
Action: Mailchimp (Add Subscriber)
```

### Make (Integromat) Integration

```
Webhook Module
    |
    v
Router (by event type)
    |
    +---> lead.captured ---> CRM Module
    |
    +---> call.completed ---> Analytics Module
    |
    +---> appointment.created ---> Calendar Module
```

### n8n Integration

Self-hosted workflow automation with full control.

---

## API Reference

### CRM Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/crm/providers` | List available CRM providers |
| GET | `/api/crm/integrations` | List connected integrations |
| GET | `/api/crm/connect/:provider` | Start OAuth flow |
| GET | `/api/crm/callback/:provider` | OAuth callback |
| DELETE | `/api/crm/integrations/:id` | Disconnect integration |
| PATCH | `/api/crm/integrations/:id` | Update sync settings |
| POST | `/api/crm/sync/:id` | Force sync |

### Calendar Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/calendar/providers` | List available providers |
| GET | `/api/calendar/integrations` | List connected calendars |
| GET | `/api/calendar/connect/:provider` | Start OAuth flow |
| GET | `/api/calendar/callback/:provider` | OAuth callback |
| GET | `/api/calendar/availability` | Check available slots |
| POST | `/api/calendar/book` | Book appointment |
| GET | `/api/calendar/bookings` | List bookings |

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/crm/webhook` | Configure webhook |
| GET | `/api/crm/webhook` | Get webhook config |
| DELETE | `/api/crm/webhook` | Remove webhook |
| POST | `/api/crm/webhook/test` | Send test event |

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| OAuth fails | Invalid redirect URI | Check URI in provider console |
| Token expired | Refresh token failed | Reconnect integration |
| Sync not working | API rate limit | Wait and retry |
| Webhook not received | URL unreachable | Check firewall, verify URL |
| Data not mapping | Field mismatch | Update field mapping config |

### Debug Logging

Enable integration debug logs:

```
DEBUG_CRM=true
DEBUG_CALENDAR=true
DEBUG_WEBHOOK=true
```

---

*This document is updated when new integrations are added.*
