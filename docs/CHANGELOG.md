# Changelog

**Version History and Release Notes**

All notable changes to HEKAX Phone are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Multilingual AI support (Spanish, French, German)
- Custom voice cloning for enterprise
- Real-time sentiment analysis during calls
- Smart call routing based on caller history
- Mobile application (React Native)

---

## [2.0.0] - 2024-12

### Added
- **AI Receptionist with OpenAI Realtime API**
  - Sub-second response latency (600-800ms)
  - Streaming speech-to-text and text-to-speech
  - Function calling for lead capture and appointment booking
  - Barge-in detection for human takeover

- **Multi-Provider Email Service**
  - Resend as primary email provider
  - SendGrid as backup provider
  - AWS SES for enterprise scale
  - Automatic failover between providers

- **Calendar Integrations**
  - Google Calendar OAuth integration
  - Microsoft Outlook integration
  - Calendly integration
  - AI-powered appointment booking during calls

- **CRM Integrations**
  - HubSpot OAuth integration
  - Salesforce OAuth integration
  - Zoho CRM integration
  - Pipedrive integration
  - Generic webhook integration
  - Automatic lead sync

- **Enhanced Billing System**
  - Stripe subscription management
  - Usage-based metering
  - Add-on minute packs
  - Overage handling
  - Billing portal integration

- **Team Management**
  - Multi-organization support
  - Role-based access control (Owner, Admin, Manager, Agent, Viewer)
  - Team member invitations with email
  - Role assignment and management

- **Data Retention and Compliance**
  - Configurable retention periods
  - GDPR/CCPA data export
  - Automated data cleanup
  - Comprehensive audit logging

- **Enterprise Features**
  - BYO API keys (OpenAI, Twilio)
  - API key management
  - Custom domains
  - SLA guarantees

### Changed
- Migrated from OpenAI Chat API to Realtime API for voice
- Improved WebRTC softphone stability across browsers
- Enhanced lead scoring algorithm
- Optimized database queries with proper indexing
- Updated subscription plan limits and pricing

### Fixed
- WebSocket reconnection issues during long calls
- Token refresh race conditions in OAuth integrations
- Call recording storage reliability
- Timezone handling in appointment scheduling

---

## [1.5.0] - 2024-11

### Added
- WebRTC softphone in browser
- Call recording with S3 storage
- Transcript generation and storage
- Lead pipeline management
- Usage analytics dashboard

### Changed
- Improved AI response quality
- Enhanced call routing logic
- Better error handling in voice webhooks

### Fixed
- Audio quality issues on Safari
- Memory leaks in long-running WebSocket connections

---

## [1.4.0] - 2024-10

### Added
- Twilio subaccount auto-provisioning
- Phone number search and purchase
- Call forwarding configuration
- Business hours settings
- After-hours AI handling

### Changed
- Refactored organization provisioning flow
- Improved Twilio credential security

### Fixed
- Phone number webhook configuration
- Call status tracking accuracy

---

## [1.3.0] - 2024-09

### Added
- Email verification flow
- Password reset functionality
- User preferences
- Notification settings
- Timezone support

### Changed
- Enhanced security with bcrypt cost factor 12
- JWT token structure with organization context

### Fixed
- Session management edge cases
- Email delivery reliability

---

## [1.2.0] - 2024-08

### Added
- Lead capture from AI calls
- Lead status management
- Lead assignment to agents
- Basic analytics

### Changed
- Improved AI conversation flow
- Better lead extraction accuracy

### Fixed
- Duplicate lead creation
- Lead update concurrency issues

---

## [1.1.0] - 2024-07

### Added
- Basic Stripe integration
- Subscription management
- Usage tracking
- Plan limits enforcement

### Changed
- Updated pricing tiers
- Improved billing UX

### Fixed
- Subscription state sync issues
- Payment webhook reliability

---

## [1.0.0] - 2024-06

### Added
- Initial release
- Core telephony with Twilio
- Basic AI receptionist
- User authentication
- Organization management
- Call logging
- Simple dashboard

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 2.0.0 | Dec 2024 | Realtime API, Integrations, Multi-org |
| 1.5.0 | Nov 2024 | Softphone, Recordings, Transcripts |
| 1.4.0 | Oct 2024 | Phone provisioning, Business hours |
| 1.3.0 | Sep 2024 | Email verification, User settings |
| 1.2.0 | Aug 2024 | Lead management, Analytics |
| 1.1.0 | Jul 2024 | Stripe billing, Usage tracking |
| 1.0.0 | Jun 2024 | Initial release |

---

## Migration Notes

### Upgrading to 2.0.0

1. **Database Migration**
   - Run `npx prisma migrate deploy`
   - New tables: CrmIntegration, CalendarIntegration, UserOrganization
   - New columns on Organization for calendar/crm settings

2. **Environment Variables**
   - Add email provider credentials (Resend, SendGrid, or AWS SES)
   - Add CRM OAuth credentials (HubSpot, Salesforce, etc.)
   - Add Calendar OAuth credentials (Google, Microsoft)

3. **Twilio Configuration**
   - Update webhooks to new endpoints
   - Configure TwiML apps for softphone

4. **Frontend Changes**
   - Update API client for new endpoints
   - Add new pages for integrations
   - Update settings page structure

### Breaking Changes in 2.0.0

- Organization schema changes (run migrations)
- New authentication token structure
- Updated API response formats for calls and leads
- Removed deprecated AI model configurations

---

## Deprecation Schedule

| Feature | Deprecated | Removal | Replacement |
|---------|------------|---------|-------------|
| Direct Twilio accounts | 2.0.0 | 3.0.0 | Subaccounts |
| Legacy AI model config | 2.0.0 | 3.0.0 | Realtime API |
| Single-org users | 2.0.0 | 3.0.0 | Multi-org |

---

*This changelog is updated with each release.*
