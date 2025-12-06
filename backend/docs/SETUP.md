# HEKAX Phone - Setup Guide

## Prerequisites

- **Node.js** v18.0.0 or higher
- **npm** v8.0.0 or higher
- **PostgreSQL** v14 or higher (or use a cloud provider like Supabase)
- **Twilio** account for voice/SMS capabilities
- **OpenAI** API key for AI features
- **Stripe** account for billing (optional)

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/hekax/hekax-phone.git
cd hekax-phone
```

### 2. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
```

### 3. Configure Environment Variables

Create `.env` file in the `backend` directory:

```env
# =============================================================================
# DATABASE
# =============================================================================
DATABASE_URL="postgresql://user:password@localhost:5432/hekax_phone"

# =============================================================================
# JWT & SECURITY
# =============================================================================
JWT_SECRET="your-very-secure-jwt-secret-at-least-32-characters"
JWT_REFRESH_SECRET="your-refresh-token-secret"
ENCRYPTION_KEY="32-character-encryption-key-here"

# =============================================================================
# TWILIO (Required for Voice/SMS)
# =============================================================================
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
TWILIO_API_KEY="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_API_SECRET="your-twilio-api-secret"

# =============================================================================
# OPENAI (Required for AI Features)
# =============================================================================
OPENAI_API_KEY="sk-..."

# =============================================================================
# DEEPGRAM (Optional - for enhanced transcription)
# =============================================================================
DEEPGRAM_API_KEY="your-deepgram-api-key"

# =============================================================================
# STRIPE (Optional - for billing)
# =============================================================================
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_STARTER_PRICE_ID="price_..."
STRIPE_GROWTH_PRICE_ID="price_..."
STRIPE_SCALE_PRICE_ID="price_..."

# =============================================================================
# AWS SES (Optional - for email)
# =============================================================================
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"
SES_FROM_EMAIL="noreply@yourdomain.com"

# =============================================================================
# REDIS (Optional - for rate limiting & caching)
# =============================================================================
REDIS_URL="redis://localhost:6379"

# =============================================================================
# SERVER CONFIG
# =============================================================================
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### 4. Setup Database

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# (Optional) Seed initial data
npx prisma db seed
```

### 5. Start Development Servers

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd ..
npm run dev
```

The frontend will be available at `http://localhost:5173` and backend at `http://localhost:3001`.

---

## Twilio Setup

### 1. Create a Twilio Account
Visit [twilio.com](https://www.twilio.com) and create an account.

### 2. Get API Credentials
From the Twilio Console:
- Account SID
- Auth Token
- Create an API Key and Secret

### 3. Configure TwiML App
1. Go to Voice > TwiML Apps
2. Create a new TwiML App
3. Set Voice Request URL to: `https://your-domain.com/api/voice/incoming`
4. Note the TwiML App SID

### 4. Purchase a Phone Number
1. Go to Phone Numbers > Buy a Number
2. Select a number with Voice capability
3. Configure the number to use your TwiML App

### 5. Setup Webhooks
Configure these webhook URLs in your Twilio Console:
- Voice incoming: `POST /api/voice/incoming`
- Voice status: `POST /api/voice/status`
- SMS incoming: `POST /api/twilio/sms`

---

## OpenAI Setup

### 1. Create API Key
1. Go to [platform.openai.com](https://platform.openai.com)
2. Navigate to API Keys
3. Create a new secret key
4. Add it to your `.env` file

### 2. Recommended Settings
The AI receptionist uses GPT-4o by default. You can customize:
- Model selection in organization settings
- System prompts for different use cases
- Voice selection for TTS

---

## Stripe Setup (Optional)

### 1. Create Products
In your Stripe Dashboard:
1. Create products for each plan (Starter, Growth, Scale)
2. Create monthly pricing for each product
3. Note the Price IDs

### 2. Configure Webhooks
1. Go to Developers > Webhooks
2. Add endpoint: `https://your-domain.com/api/billing/webhook`
3. Select events:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the webhook secret to your `.env`

---

## Production Deployment

### Environment Variables
Ensure all production environment variables are set:
- Use strong, unique secrets
- Use production API keys (not test keys)
- Set `NODE_ENV=production`

### Database
- Use a managed PostgreSQL service (Supabase, AWS RDS, etc.)
- Enable SSL connections
- Set up regular backups

### Hosting Options

#### Vercel (Frontend)
```bash
npm install -g vercel
vercel --prod
```

#### Railway/Render (Backend)
1. Connect your GitHub repository
2. Configure environment variables
3. Set start command: `npm start`

#### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### SSL/TLS
- Twilio requires HTTPS for webhooks
- Use a service like Cloudflare for SSL termination
- Or configure SSL certificates directly

---

## Troubleshooting

### Database Connection Issues
```bash
# Test connection
npx prisma db pull

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset
```

### Twilio Webhook Errors
- Verify webhook URLs are HTTPS
- Check server logs for errors
- Use Twilio's webhook debugger

### Build Errors
```bash
# Clear caches and reinstall
rm -rf node_modules
rm -rf backend/node_modules
npm install
cd backend && npm install
```

### Port Already in Use
```bash
# Find and kill process on port 3001
lsof -i :3001
kill -9 <PID>
```

---

## Testing

### Backend Tests
```bash
cd backend
npm test
npm run test:coverage
```

### Frontend Tests
```bash
npm run test:run
npm run test:coverage
```

---

## Support

- GitHub Issues: [github.com/hekax/hekax-phone/issues](https://github.com/hekax/hekax-phone/issues)
- Documentation: [docs.hekaxphone.com](https://docs.hekaxphone.com)
- Email: support@hekaxphone.com
