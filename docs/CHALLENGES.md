# Engineering Challenges and Solutions

**Technical Problems Solved During Development**

Version 2.0 | Last Updated: December 2024

---

## Overview

This document chronicles significant engineering challenges encountered during the development of HEKAX Phone and the solutions implemented. Each challenge includes context, the problem encountered, solutions considered, and the final implementation.

---

## Challenge 1: Real-time Voice Processing Latency

### Context

The AI receptionist must respond to callers with minimal delay to maintain natural conversation flow. Users expect response times similar to human conversation.

### Problem

Initial implementation had 3-4 second delays between caller speech and AI response, making conversations feel robotic and frustrating.

```
Original Flow:
Caller speaks -> Record audio -> Send to Whisper -> Get text ->
Send to GPT-4 -> Get response -> Send to TTS -> Play audio

Total latency: 3-4 seconds
```

### Solutions Considered

1. **Pre-recorded responses**: Limited flexibility, not truly AI
2. **Local speech processing**: Requires significant infrastructure
3. **OpenAI Realtime API**: New streaming API with integrated STT/TTS

### Solution Implemented

Migrated to OpenAI Realtime API which provides:
- Streaming speech-to-text (words appear as spoken)
- GPT-4 processing begins before speech ends
- Streaming text-to-speech (audio plays while generating)

```
Optimized Flow:
Caller speaks -> Stream to Realtime API ->
Simultaneous: STT + GPT-4 + TTS streaming

New latency: 600-800ms
```

### Technical Details

```javascript
// WebSocket connection to OpenAI Realtime API
const ws = new WebSocket('wss://api.openai.com/v1/realtime', {
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'OpenAI-Beta': 'realtime=v1'
  }
});

// Stream audio directly from Twilio to OpenAI
twilioStream.on('media', (data) => {
  ws.send(JSON.stringify({
    type: 'input_audio_buffer.append',
    audio: data.payload  // base64 audio
  }));
});
```

### Outcome

- Response latency reduced from 3-4s to under 1s
- Conversation feels natural
- Caller satisfaction improved significantly

---

## Challenge 2: Multi-tenant Data Isolation

### Context

As a SaaS platform, HEKAX Phone serves multiple organizations. Each organization's data must be completely isolated from others.

### Problem

Early queries sometimes leaked data between organizations due to missing filters, and there was no systematic way to enforce isolation.

### Solutions Considered

1. **Separate databases per tenant**: Maximum isolation but high cost and complexity
2. **Separate schemas per tenant**: PostgreSQL schemas, moderate isolation
3. **Shared database with row-level filtering**: Single database, organization column

### Solution Implemented

Shared database with organization ID on every table, enforced at multiple levels:

```
Enforcement Layers:

1. Middleware (auth.middleware.js)
   - Extract organizationId from JWT
   - Attach to request object

2. Query Level
   - All queries include organizationId WHERE clause
   - Prisma middleware validates queries

3. Route Level
   - Verify resource belongs to organization before operations
```

### Technical Details

```javascript
// Middleware extracts tenant context
const authMiddleware = async (req, res, next) => {
  const decoded = jwt.verify(token, JWT_SECRET);
  req.userId = decoded.userId;
  req.organizationId = decoded.organizationId;  // Always set
  next();
};

// Every query includes tenant filter
const leads = await prisma.lead.findMany({
  where: {
    organizationId: req.organizationId,  // Mandatory
    // ... other filters
  }
});

// Resource ownership check
const lead = await prisma.lead.findFirst({
  where: {
    id: req.params.id,
    organizationId: req.organizationId  // Prevents accessing other orgs
  }
});
if (!lead) return res.status(404).json({ error: 'Not found' });
```

### Outcome

- Zero data leakage incidents
- Simple mental model for developers
- Easy to audit and verify

---

## Challenge 3: Barge-in Detection for Human Takeover

### Context

Team members need to be able to take over calls from the AI receptionist. When a human starts speaking, the AI should stop and listen.

### Problem

The AI would keep talking over the human operator, creating chaos on the call. Standard VAD (Voice Activity Detection) wasn't distinguishing between caller and operator.

### Solutions Considered

1. **Button-based takeover**: Operator presses button to mute AI
2. **Separate audio channels**: Complex Twilio configuration
3. **Intelligent barge-in detection**: Detect human voice and pause AI

### Solution Implemented

Multi-level barge-in detection system:

```
Detection Algorithm:

1. Monitor audio levels continuously
2. When audio > threshold during AI speech:
   - Pause AI audio output
   - Enter "listening" state
3. If human speaks for > 300ms:
   - Cancel AI response
   - Let human continue
4. If silence > 1500ms:
   - Resume AI if needed
```

### Technical Details

```javascript
const BARGE_IN_CONFIG = {
  silenceThreshold: 0.02,
  speechThreshold: 0.05,
  minSpeechDuration: 300,
  resumeDelay: 1500,
};

let bargeInState = 'normal';
let speechStartTime = null;

function processAudio(audioLevel) {
  if (bargeInState === 'ai_speaking' && audioLevel > BARGE_IN_CONFIG.speechThreshold) {
    if (!speechStartTime) {
      speechStartTime = Date.now();
    } else if (Date.now() - speechStartTime > BARGE_IN_CONFIG.minSpeechDuration) {
      // Human is speaking, pause AI
      bargeInState = 'human_detected';
      pauseAIResponse();
    }
  }
}
```

### Outcome

- Smooth handoff between AI and human
- No more talking over each other
- Professional call experience

---

## Challenge 4: OAuth Token Management

### Context

CRM and Calendar integrations use OAuth 2.0 with access tokens that expire (typically 1 hour).

### Problem

Integration would randomly fail when tokens expired, requiring users to reconnect.

### Solutions Considered

1. **Manual reconnect**: Poor user experience
2. **Proactive refresh**: Refresh before expiry
3. **Just-in-time refresh**: Refresh on 401 error

### Solution Implemented

Hybrid approach with proactive refresh and fallback:

```
Token Refresh Strategy:

1. Store access_token, refresh_token, expires_at
2. Before API call:
   - If expires_at < now + 5min, refresh proactively
3. On API call:
   - If 401 response, attempt refresh and retry
4. If refresh fails:
   - Mark integration as disconnected
   - Notify user via email/UI
```

### Technical Details

```javascript
async function getValidToken(integration) {
  const now = new Date();
  const expiresAt = new Date(integration.tokenExpiresAt);
  const fiveMinutes = 5 * 60 * 1000;

  // Proactive refresh if expiring soon
  if (expiresAt - now < fiveMinutes) {
    try {
      const newTokens = await refreshToken(integration);
      await prisma.crmIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token || integration.refreshToken,
          tokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
        }
      });
      return newTokens.access_token;
    } catch (error) {
      // Mark as needing reconnect
      await markDisconnected(integration.id);
      throw new Error('Token refresh failed');
    }
  }

  return integration.accessToken;
}
```

### Outcome

- Integrations stay connected indefinitely
- Automatic recovery from token expiry
- Clear user notification when reconnect needed

---

## Challenge 5: WebRTC Softphone Browser Compatibility

### Context

The softphone feature allows users to make and receive calls directly in the browser using WebRTC.

### Problem

Audio issues across different browsers:
- Chrome: Audio would cut out randomly
- Safari: Microphone permission issues
- Firefox: Echo and feedback problems

### Solutions Considered

1. **Desktop app**: Native Electron app
2. **Mobile app**: React Native
3. **Browser fixes**: Address each browser's quirks

### Solution Implemented

Browser-specific handling with fallbacks:

```javascript
// Browser detection and config
function getAudioConfig() {
  const browser = detectBrowser();

  switch (browser) {
    case 'chrome':
      return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
    case 'safari':
      return {
        echoCancellation: true,
        // Safari has issues with noise suppression
        noiseSuppression: false,
        autoGainControl: false,
      };
    case 'firefox':
      return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,  // Firefox AGC causes issues
      };
    default:
      return defaultConfig;
  }
}

// Twilio Device initialization with browser-specific settings
const device = new Device(token, {
  codecPreferences: ['opus', 'pcmu'],
  edge: 'ashburn',  // Closest edge location
  ...getAudioConfig(),
});
```

### Outcome

- Consistent audio quality across browsers
- Clear documentation of known limitations
- Graceful degradation where needed

---

## Challenge 6: Stripe Subscription Lifecycle

### Context

Billing system needs to handle complex subscription states: trials, upgrades, downgrades, cancellations, failed payments.

### Problem

Subscription state could get out of sync between Stripe and database, leading to incorrect access or billing.

### Solutions Considered

1. **Always query Stripe**: Slow, rate limits
2. **Periodic sync job**: Can be out of date
3. **Webhook-driven sync**: Real-time but complex

### Solution Implemented

Webhook-driven with verification layer:

```
Subscription State Machine:

TRIAL -> ACTIVE (payment received)
ACTIVE -> PAST_DUE (payment failed)
PAST_DUE -> ACTIVE (payment recovered)
PAST_DUE -> CANCELLED (too many failures)
ACTIVE -> CANCELLED (user cancelled)
Any -> SUSPENDED (admin action)
```

### Technical Details

```javascript
// Webhook handler for subscription events
app.post('/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.headers['stripe-signature'],
    STRIPE_WEBHOOK_SECRET
  );

  switch (event.type) {
    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    case 'invoice.paid':
      await handlePaymentSucceeded(event.data.object);
      break;
  }

  res.json({ received: true });
});

// State update with verification
async function handleSubscriptionUpdate(subscription) {
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: subscription.customer }
  });

  if (!org) return;

  // Map Stripe status to our status
  const statusMap = {
    'active': 'ACTIVE',
    'past_due': 'PAST_DUE',
    'canceled': 'CANCELLED',
    'trialing': 'TRIAL',
  };

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      plan: subscription.items.data[0].price.lookup_key,
      status: statusMap[subscription.status],
      stripeSubscriptionId: subscription.id,
    }
  });
}
```

### Outcome

- Real-time billing state sync
- Accurate access control
- Proper handling of edge cases

---

## Challenge 7: Call Recording Storage and Retrieval

### Context

Calls can be recorded for quality and compliance. Recordings need secure storage and fast retrieval.

### Problem

Storing recordings in database (as base64) was slow and expensive. Direct Twilio URLs expire.

### Solutions Considered

1. **Database storage**: Simple but slow/expensive
2. **Twilio storage**: URLs expire, not permanent
3. **S3 with signed URLs**: Scalable, secure, cost-effective

### Solution Implemented

Download from Twilio, store in S3, serve via signed URLs:

```
Recording Flow:

1. Call ends -> Twilio generates recording
2. Webhook notifies backend
3. Backend downloads from Twilio
4. Upload to S3 with organization prefix
5. Store S3 key in database
6. On playback request:
   - Generate signed URL (15 min expiry)
   - Return to client
```

### Technical Details

```javascript
// Download from Twilio and upload to S3
async function processRecording(recordingSid, callId, orgId) {
  // Download from Twilio
  const recording = await twilio.recordings(recordingSid).fetch();
  const audioUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;

  const response = await fetch(audioUrl, {
    headers: { Authorization: `Basic ${twilioAuth}` }
  });
  const audioBuffer = await response.buffer();

  // Upload to S3
  const s3Key = `recordings/${orgId}/${callId}.mp3`;
  await s3.putObject({
    Bucket: RECORDINGS_BUCKET,
    Key: s3Key,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
  });

  // Store reference
  await prisma.call.update({
    where: { id: callId },
    data: { recordingKey: s3Key }
  });
}

// Generate signed URL for playback
async function getRecordingUrl(callId, orgId) {
  const call = await prisma.call.findFirst({
    where: { id: callId, organizationId: orgId }
  });

  if (!call?.recordingKey) return null;

  const signedUrl = await s3.getSignedUrl('getObject', {
    Bucket: RECORDINGS_BUCKET,
    Key: call.recordingKey,
    Expires: 900,  // 15 minutes
  });

  return signedUrl;
}
```

### Outcome

- Cost-effective storage (~$0.023/GB)
- Fast retrieval with CDN
- Secure access control

---

## Challenge 8: Rate Limiting Without Blocking Legitimate Traffic

### Context

API needs protection against abuse while allowing legitimate high-volume users.

### Problem

Simple rate limiting blocked legitimate users during peak times while not effectively stopping abuse.

### Solutions Considered

1. **Fixed window**: Simple but bursty
2. **Sliding window**: Smoother but memory intensive
3. **Token bucket**: Allows bursts, smooth average

### Solution Implemented

Tiered rate limiting based on endpoint sensitivity:

```
Rate Limit Tiers:

Tier 1 (Authentication):
  - 5 requests/minute per IP
  - Prevents brute force

Tier 2 (Read Operations):
  - 100 requests/minute per user
  - Normal API usage

Tier 3 (Write Operations):
  - 30 requests/minute per user
  - Prevents spam

Tier 4 (AI Operations):
  - 10 concurrent calls per org
  - Based on plan limits
```

### Technical Details

```javascript
const rateLimit = require('express-rate-limit');

// Auth endpoints - strict
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many attempts, try again later' }
});

// General API - moderate
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.userId || req.ip,
});

// Apply to routes
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);
```

### Outcome

- Effective abuse prevention
- No impact on legitimate users
- Clear error messages

---

## Summary

These challenges represent the core engineering problems solved during HEKAX Phone development. Each solution was chosen based on:

1. **Scalability**: Will it work at 10x, 100x scale?
2. **Maintainability**: Can future developers understand it?
3. **Cost**: Is it economically viable?
4. **User Experience**: Does it improve the product?

The solutions documented here form the foundation of a production-ready, enterprise-grade SaaS platform.

---

*This document is updated as new significant challenges are solved.*
