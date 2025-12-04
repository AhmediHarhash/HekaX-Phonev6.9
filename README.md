# HEKAX Phone

AI-Powered Business Phone System - Multi-tenant SaaS Platform

## Features

- 🤖 **AI Receptionist** - Handles calls, captures leads, schedules appointments
- 📞 **Softphone** - Browser-based calling with Twilio
- 📊 **Dashboard** - Real-time analytics and call stats
- 👥 **Multi-tenant** - Organizations with team management
- 🎯 **Lead Management** - Automatic lead capture from AI calls
- 📝 **Transcripts** - Full call transcriptions with AI summaries

## Tech Stack

### Frontend
- React 19 + TypeScript
- Tailwind CSS
- Twilio Voice SDK
- Vite

### Backend
- Node.js + Express
- PostgreSQL + Prisma
- WebSocket for real-time audio
- OpenAI GPT-4 for conversations
- Deepgram for speech-to-text
- ElevenLabs for text-to-speech

## Project Structure

```
hekax-phone/
├── src/                    # Frontend
│   ├── components/
│   │   ├── common/        # Reusable components
│   │   ├── layout/        # Sidebar, headers
│   │   └── softphone/     # Dial pad
│   ├── context/           # Auth context
│   ├── hooks/             # Custom hooks (useTwilio)
│   ├── pages/             # Page components
│   ├── types/             # TypeScript types
│   ├── utils/             # API, formatters, constants
│   └── styles/            # Global CSS
│
├── backend/               # Backend
│   ├── lib/              # Prisma client
│   ├── middleware/       # Auth middleware
│   ├── routes/           # API routes
│   ├── services/         # AI Receptionist
│   └── prisma/           # Database schema
│
└── public/               # Static assets
```

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL
- Twilio account
- OpenAI API key
- Deepgram API key
- ElevenLabs API key

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend && npm install

# Setup database
cp .env.example .env
# Fill in your environment variables
npx prisma db push
```

### Development

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
npm run dev
```

### Production

```bash
# Build frontend
npm run build

# Start backend
cd backend && npm start
```

## Environment Variables

See `backend/.env.example` for required environment variables.

## API Endpoints

### Auth
- `POST /auth/register` - Create organization + user
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user

### API
- `GET /api/calls` - List calls
- `GET /api/calls/:id/details` - Call with transcript
- `GET /api/leads` - List leads
- `PATCH /api/leads/:id` - Update lead
- `GET /api/team` - List team members
- `POST /api/team/invite` - Invite member
- `GET /api/organization` - Get org settings
- `PATCH /api/organization` - Update settings
- `GET /api/stats` - Dashboard stats

### Twilio
- `GET /token` - Get Twilio access token
- `POST /twilio/voice/incoming` - Handle incoming calls
- `POST /twilio/voice/outbound` - Handle outbound calls

## License

Proprietary - HEKAX LLC
