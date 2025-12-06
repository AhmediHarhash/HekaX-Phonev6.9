# HEKAX Phone Documentation

**Enterprise AI-Powered Business Phone System**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone is a multi-tenant SaaS platform that provides businesses with an AI-powered phone system. The platform handles inbound calls with an intelligent AI receptionist, captures leads, books appointments, and seamlessly transfers calls to human operators when needed.

This documentation provides comprehensive technical details for developers, architects, and stakeholders interested in understanding the system's design, implementation, and capabilities.

---

## Table of Contents

### Core Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./ARCHITECTURE.md) | System design, tech stack, and infrastructure overview |
| [API Reference](./API-REFERENCE.md) | Complete REST API documentation with endpoints and examples |
| [Database](./DATABASE.md) | Prisma schema, data models, and relationships |

### Feature Documentation

| Document | Description |
|----------|-------------|
| [AI Receptionist](./AI-RECEPTIONIST.md) | OpenAI integration, conversation flow, and real-time processing |
| [Telephony](./TELEPHONY.md) | Twilio integration, WebRTC softphone, and call management |
| [Integrations](./INTEGRATIONS.md) | CRM systems, calendar providers, and webhook configuration |
| [Billing](./BILLING.md) | Stripe integration, subscription plans, and usage metering |

### Infrastructure Documentation

| Document | Description |
|----------|-------------|
| [Authentication](./AUTHENTICATION.md) | JWT implementation, multi-tenant security, and OAuth flows |
| [Email Service](./EMAIL-SERVICE.md) | Transactional email with Resend, SendGrid, and AWS SES |
| [Deployment](./DEPLOYMENT.md) | Production deployment, environment configuration, and scaling |
| [Frontend](./FRONTEND.md) | React architecture, state management, and UI components |

### Project History

| Document | Description |
|----------|-------------|
| [Challenges & Solutions](./CHALLENGES.md) | Engineering problems encountered and how they were solved |
| [Changelog](./CHANGELOG.md) | Version history and feature timeline |

---

## Quick Stats

| Metric | Value |
|--------|-------|
| **Backend** | Node.js + Express |
| **Frontend** | React + TypeScript + Vite |
| **Database** | PostgreSQL + Prisma ORM |
| **AI Provider** | OpenAI GPT-4 + Realtime API |
| **Telephony** | Twilio Programmable Voice |
| **Payments** | Stripe Subscriptions |
| **Email** | Resend / SendGrid / AWS SES |
| **Deployment** | Railway (Backend) + Vercel/Railway (Frontend) |

---

## Key Features

### For Businesses
- 24/7 AI receptionist that never misses a call
- Automatic lead capture with caller information
- Appointment scheduling with calendar integration
- Real-time call transfers to team members
- Full call transcripts and recordings
- CRM synchronization (HubSpot, Salesforce, Zoho, Pipedrive)

### For Developers
- Multi-tenant architecture with organization isolation
- RESTful API with JWT authentication
- WebSocket support for real-time features
- Webhook system for custom integrations
- Comprehensive audit logging
- Role-based access control (OWNER, ADMIN, MANAGER, AGENT)

---

## Architecture Highlights

```
                                   HEKAX Phone Architecture

    +------------------+     +------------------+     +------------------+
    |   Web Browser    |     |   Mobile App     |     |  Twilio Voice    |
    |   (React SPA)    |     |   (Future)       |     |   (Inbound)      |
    +--------+---------+     +--------+---------+     +--------+---------+
             |                        |                        |
             v                        v                        v
    +------------------------------------------------------------------------+
    |                           API Gateway (Express)                         |
    |   - JWT Authentication    - Rate Limiting    - Request Validation      |
    +------------------------------------------------------------------------+
             |                        |                        |
             v                        v                        v
    +------------------+     +------------------+     +------------------+
    |  Auth Service    |     |  Call Service    |     |   AI Service     |
    |  - Login/Signup  |     |  - Twilio SDK    |     |  - OpenAI GPT-4  |
    |  - JWT Tokens    |     |  - Call Routing  |     |  - Realtime API  |
    |  - Email Verify  |     |  - Recording     |     |  - TTS/STT       |
    +------------------+     +------------------+     +------------------+
             |                        |                        |
             v                        v                        v
    +------------------------------------------------------------------------+
    |                        PostgreSQL Database                              |
    |              (Prisma ORM with Multi-tenant Isolation)                  |
    +------------------------------------------------------------------------+
             |                        |                        |
             v                        v                        v
    +------------------+     +------------------+     +------------------+
    |  Stripe Billing  |     |  CRM Providers   |     | Calendar Providers|
    |  - Subscriptions |     |  - HubSpot       |     |  - Google Cal    |
    |  - Usage Meters  |     |  - Salesforce    |     |  - Outlook       |
    |  - Webhooks      |     |  - Zoho/Pipedrive|     |  - Calendly      |
    +------------------+     +------------------+     +------------------+
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Twilio Account
- OpenAI API Key
- Stripe Account (for billing)

### Quick Start
```bash
# Clone repository
git clone https://github.com/AhmediHarhash/HekaX-Phonev6.9.git
cd HekaX-Phonev6.9

# Backend setup
cd backend
npm install
cp .env.example .env  # Configure environment variables
npx prisma migrate dev
npm run dev

# Frontend setup (new terminal)
cd ..
npm install
npm run dev
```

---

## Project Structure

```
HekaX-Phone/
├── backend/
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic services
│   │   ├── ai-receptionist.js
│   │   ├── calendar/
│   │   ├── crm/
│   │   └── email/
│   ├── middleware/       # Auth, validation, rate limiting
│   ├── lib/              # Prisma client, utilities
│   └── prisma/           # Database schema and migrations
├── src/
│   ├── components/       # React components
│   ├── pages/            # Page components
│   ├── context/          # React context providers
│   ├── hooks/            # Custom React hooks
│   └── utils/            # Utility functions
├── docs/                 # Documentation (you are here)
└── dist/                 # Production build output
```

---

## Contact

**Project Lead:** Ahmed Ibrahim

For questions about this project or collaboration opportunities, please reach out through the repository's issue tracker or contact information provided in the main README.

---

*This documentation is maintained as part of the HEKAX Phone project and is updated with each major feature release.*
