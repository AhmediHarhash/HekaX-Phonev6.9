# Telephony System

**Twilio Integration and WebRTC Softphone Documentation**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone uses Twilio as its telephony backbone, providing phone number provisioning, call routing, media streaming, and WebRTC softphone capabilities. Each organization gets auto-provisioned Twilio subaccounts for complete isolation.

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Voice Platform | Twilio Programmable Voice | Call handling |
| Media Streams | Twilio Media Streams | Real-time audio |
| WebRTC | Twilio Client SDK | Browser softphone |
| Recording | Twilio Recording | Call recordings |
| Numbers | Twilio Phone Numbers | DID provisioning |

---

## Architecture

```
                    Telephony Architecture

    PSTN                   Twilio                    Backend
      |                      |                          |
      |   Incoming Call      |                          |
      |--------------------->|                          |
      |                      |                          |
      |                      |   Webhook: /voice        |
      |                      |------------------------->|
      |                      |                          |
      |                      |                    +-----+-----+
      |                      |                    | Determine |
      |                      |                    |  Route    |
      |                      |                    +-----+-----+
      |                      |                          |
      |                      |   TwiML Response         |
      |                      |<-------------------------|
      |                      |                          |
      |                      |   (If AI enabled)        |
      |                      |                          |
      |                      |   Media Stream           |
      |                      |------------------------->|
      |                      |                          |
      |   Audio <----------->|<------------------------>| OpenAI
      |                      |                          | Realtime
      |                      |                          |
```

---

## Subaccount Provisioning

### Auto-Provisioning Flow

Each organization receives its own Twilio subaccount for billing isolation and security.

```
                    Subaccount Provisioning

    Signup                  Backend                   Twilio
      |                        |                        |
      |   Create Account       |                        |
      |----------------------->|                        |
      |                        |                        |
      |                        |   Create Subaccount    |
      |                        |----------------------->|
      |                        |                        |
      |                        |   Subaccount SID       |
      |                        |<-----------------------|
      |                        |                        |
      |                        |   Create TwiML App     |
      |                        |----------------------->|
      |                        |                        |
      |                        |   TwiML App SID        |
      |                        |<-----------------------|
      |                        |                        |
      |                        |   Create API Key       |
      |                        |----------------------->|
      |                        |                        |
      |                        |   API Key + Secret     |
      |                        |<-----------------------|
      |                        |                        |
      |                        |   Store Credentials    |
      |                        |   (Encrypted)          |
      |                        |                        |
      |   Ready to Use         |                        |
      |<-----------------------|                        |
```

### Provisioned Resources

| Resource | Purpose | Per Organization |
|----------|---------|------------------|
| Subaccount | Billing isolation | 1 |
| TwiML App | Webhook routing | 1 |
| API Key | Access tokens | 1 |
| Phone Numbers | DID assignment | Based on plan |

### Provisioning Code Structure

```javascript
// Subaccount creation
const subaccount = await twilioClient.api.accounts.create({
  friendlyName: `HEKAX - ${organization.name}`,
});

// TwiML App creation
const twimlApp = await twilioClient.applications.create({
  friendlyName: `${organization.name} - Voice`,
  voiceUrl: `${BACKEND_URL}/api/voice/incoming`,
  voiceMethod: 'POST',
  statusCallback: `${BACKEND_URL}/api/voice/status`,
  statusCallbackMethod: 'POST',
});

// API Key for access tokens
const apiKey = await twilioClient.newKeys.create({
  friendlyName: `${organization.name} - Softphone`,
});
```

---

## Phone Number Management

### Number Provisioning

```
                    Number Purchase Flow

    User                    Backend                   Twilio
      |                        |                        |
      |   Search Numbers       |                        |
      |   (area code, etc.)    |                        |
      |----------------------->|                        |
      |                        |                        |
      |                        |   Search Available     |
      |                        |----------------------->|
      |                        |                        |
      |                        |   Number List          |
      |                        |<-----------------------|
      |                        |                        |
      |   Available Numbers    |                        |
      |<-----------------------|                        |
      |                        |                        |
      |   Select Number        |                        |
      |----------------------->|                        |
      |                        |                        |
      |                        |   Purchase Number      |
      |                        |----------------------->|
      |                        |                        |
      |                        |   Configure Webhooks   |
      |                        |----------------------->|
      |                        |                        |
      |                        |   Number SID           |
      |                        |<-----------------------|
      |                        |                        |
      |   Number Assigned      |                        |
      |<-----------------------|                        |
```

### Number Configuration

Each phone number can be configured independently:

```
Phone Number Configuration
├── Voice Handling
│   ├── routeToAI (true/false)
│   ├── routeToUser (specific user)
│   └── routeToQueue (call queue)
│
├── Customization
│   ├── greeting (override org default)
│   ├── voiceId (override org default)
│   └── callFlowId (custom call flow)
│
├── Capabilities
│   ├── voice (boolean)
│   ├── sms (boolean)
│   └── mms (boolean)
│
└── Webhook URLs
    ├── voiceUrl: /api/voice/incoming
    ├── voiceFallbackUrl: /api/voice/fallback
    └── statusCallback: /api/voice/status
```

---

## Call Routing

### Inbound Call Flow

```
                        Inbound Call Routing

    +------------------+
    | Incoming Call    |
    +--------+---------+
             |
             v
    +--------+---------+
    | Find Phone Number|
    | & Organization   |
    +--------+---------+
             |
             v
    +--------+---------+
    | Check Business   |
    | Hours            |
    +--------+---------+
             |
      +------+------+
      |             |
   During        After
   Hours         Hours
      |             |
      v             v
    +---+---+   +---+---+
    | Check |   | After |
    | Route |   | Hours |
    +---+---+   | Mode  |
        |       +---+---+
        |           |
   +----+----+      |
   |    |    |      |
   v    v    v      v
 +--+ +--+ +--+  +----+
 |AI| |Usr||Que| |VM/ |
 +--+ +--+ +--+  |Msg |
   |    |    |   +----+
   v    v    v
 TwiML Response
```

### TwiML Generation

```javascript
// AI Receptionist routing
function generateAITwiML(organization) {
  const response = new VoiceResponse();

  // Connect to media stream for AI
  const connect = response.connect();
  connect.stream({
    url: `wss://${BACKEND_URL}/media-stream`,
    track: 'inbound_track',
  });

  return response.toString();
}

// Human routing
function generateHumanTwiML(user, organization) {
  const response = new VoiceResponse();

  response.dial({
    callerId: organization.twilioNumber,
    timeout: 30,
    action: '/api/voice/dial-status',
  }).number(user.phone);

  return response.toString();
}

// Voicemail
function generateVoicemailTwiML(organization) {
  const response = new VoiceResponse();

  response.say({
    voice: organization.voiceId || 'Polly.Amy',
  }, organization.afterHoursGreeting || 'Please leave a message after the beep.');

  response.record({
    maxLength: 120,
    action: '/api/voice/recording-complete',
    transcribe: true,
    transcribeCallback: '/api/voice/transcription-complete',
  });

  return response.toString();
}
```

---

## WebRTC Softphone

### Softphone Architecture

```
                    WebRTC Softphone Architecture

    Browser                  Backend                   Twilio
      |                        |                        |
      |   Request Token        |                        |
      |----------------------->|                        |
      |                        |                        |
      |                        |   Generate Access      |
      |                        |   Token (JWT)          |
      |                        |                        |
      |   Access Token         |                        |
      |<-----------------------|                        |
      |                        |                        |
      |   Initialize Device    |                        |
      |                        |                        |
      |   Register with Twilio |                        |
      |----------------------------------------------->|
      |                        |                        |
      |   Registered           |                        |
      |<-----------------------------------------------|
      |                        |                        |
      |   (Incoming Call)      |                        |
      |<-----------------------------------------------|
      |                        |                        |
      |   Accept/Reject        |                        |
      |----------------------------------------------->|
      |                        |                        |
      |   WebRTC Media         |                        |
      |<---------------------------------------------->|
```

### Access Token Generation

```javascript
const AccessToken = require('twilio').jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

function generateAccessToken(user, organization) {
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    organization.twilioApiKeySid,
    organization.twilioApiKeySecret,
    { identity: user.twilioIdentity }
  );

  const grant = new VoiceGrant({
    outgoingApplicationSid: organization.twimlAppSid,
    incomingAllow: true,
  });

  token.addGrant(grant);

  return token.toJwt();
}
```

### Browser Integration

```javascript
// Frontend softphone initialization
import { Device } from '@twilio/voice-sdk';

class Softphone {
  constructor() {
    this.device = null;
    this.activeCall = null;
  }

  async initialize(token) {
    this.device = new Device(token, {
      codecPreferences: ['opus', 'pcmu'],
      edge: 'ashburn',
      enableRingingState: true,
    });

    // Event handlers
    this.device.on('registered', () => {
      console.log('Softphone registered');
    });

    this.device.on('incoming', (call) => {
      this.handleIncoming(call);
    });

    this.device.on('error', (error) => {
      console.error('Softphone error:', error);
    });

    await this.device.register();
  }

  handleIncoming(call) {
    this.activeCall = call;

    call.on('accept', () => {
      console.log('Call accepted');
    });

    call.on('disconnect', () => {
      this.activeCall = null;
    });

    // Show incoming call UI
    this.showIncomingCallUI(call);
  }

  accept() {
    if (this.activeCall) {
      this.activeCall.accept();
    }
  }

  reject() {
    if (this.activeCall) {
      this.activeCall.reject();
    }
  }

  hangup() {
    if (this.activeCall) {
      this.activeCall.disconnect();
    }
  }

  async makeCall(number) {
    this.activeCall = await this.device.connect({
      params: { To: number }
    });
  }

  mute(muted) {
    if (this.activeCall) {
      this.activeCall.mute(muted);
    }
  }
}
```

---

## Media Streams

### Real-time Audio Processing

For AI receptionist, Twilio Media Streams provide bidirectional audio:

```
                    Media Stream Flow

    Caller          Twilio           Backend         OpenAI
      |               |                 |               |
      |   Audio       |                 |               |
      |-------------->|                 |               |
      |               |                 |               |
      |               |   WebSocket     |               |
      |               |   (mulaw 8kHz)  |               |
      |               |---------------->|               |
      |               |                 |               |
      |               |                 |   Resample    |
      |               |                 |   to PCM16    |
      |               |                 |               |
      |               |                 |   WebSocket   |
      |               |                 |   (PCM16)     |
      |               |                 |-------------->|
      |               |                 |               |
      |               |                 |   AI Audio    |
      |               |                 |<--------------|
      |               |                 |               |
      |               |                 |   Convert to  |
      |               |                 |   mulaw 8kHz  |
      |               |                 |               |
      |               |   Audio         |               |
      |               |<----------------|               |
      |               |                 |               |
      |   AI Voice    |                 |               |
      |<--------------|                 |               |
```

### Audio Format Conversion

```javascript
// Twilio sends mulaw 8kHz, OpenAI expects PCM16 24kHz
function convertMulawToPCM(mulawBuffer) {
  // Expand mulaw to 16-bit PCM
  const pcm16 = new Int16Array(mulawBuffer.length);
  for (let i = 0; i < mulawBuffer.length; i++) {
    pcm16[i] = mulawDecode(mulawBuffer[i]);
  }

  // Resample from 8kHz to 24kHz
  return resample(pcm16, 8000, 24000);
}

// OpenAI sends PCM16 24kHz, Twilio expects mulaw 8kHz
function convertPCMToMulaw(pcmBuffer) {
  // Resample from 24kHz to 8kHz
  const resampled = resample(pcmBuffer, 24000, 8000);

  // Compress to mulaw
  const mulaw = new Uint8Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    mulaw[i] = mulawEncode(resampled[i]);
  }

  return mulaw;
}
```

---

## Call Recording

### Recording Configuration

```
Recording Options
├── Automatic Recording
│   ├── recordingChannels: 'dual' (separate caller/agent)
│   ├── recordingStatusCallback: /api/voice/recording-status
│   └── recordingStatusCallbackMethod: 'POST'
│
├── Storage
│   ├── Temporary: Twilio (7 days)
│   ├── Permanent: AWS S3 (download and store)
│   └── Access: Signed URLs (15 min expiry)
│
└── Compliance
    ├── Recording disclosure (configurable)
    ├── Encryption at rest (S3 SSE)
    └── Access audit logging
```

### Recording Retrieval

```javascript
async function processRecording(recordingSid, callId, orgId) {
  // Fetch from Twilio
  const recording = await twilioClient.recordings(recordingSid).fetch();
  const audioUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;

  // Download audio
  const response = await fetch(audioUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
      ).toString('base64')}`
    }
  });
  const audioBuffer = await response.buffer();

  // Upload to S3
  const s3Key = `recordings/${orgId}/${callId}.mp3`;
  await s3.putObject({
    Bucket: RECORDINGS_BUCKET,
    Key: s3Key,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
    ServerSideEncryption: 'AES256',
  });

  // Store reference
  await prisma.callLog.update({
    where: { id: callId },
    data: { recordingKey: s3Key }
  });

  // Delete from Twilio (optional, for cost savings)
  await twilioClient.recordings(recordingSid).remove();
}
```

---

## Call Status Tracking

### Status Webhook Events

| Event | Description | Action |
|-------|-------------|--------|
| `initiated` | Call created | Log call start |
| `ringing` | Ringing at destination | Update status |
| `in-progress` | Call connected | Start duration timer |
| `completed` | Call ended normally | Process duration, costs |
| `busy` | Busy signal | Log attempt |
| `no-answer` | No answer | Log attempt |
| `failed` | Technical failure | Log error |
| `canceled` | Caller hung up | Log cancellation |

### Status Callback Handler

```javascript
router.post('/status', async (req, res) => {
  const {
    CallSid,
    CallStatus,
    CallDuration,
    From,
    To,
    Direction,
    Price,
    PriceUnit,
  } = req.body;

  // Find or create call record
  let call = await prisma.callLog.findUnique({
    where: { callSid: CallSid }
  });

  if (!call) {
    // Create new call record
    const org = await findOrgByNumber(To);
    call = await prisma.callLog.create({
      data: {
        callSid: CallSid,
        fromNumber: From,
        toNumber: To,
        direction: Direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
        status: mapStatus(CallStatus),
        organizationId: org?.id,
      }
    });
  }

  // Update call record
  await prisma.callLog.update({
    where: { callSid: CallSid },
    data: {
      status: mapStatus(CallStatus),
      duration: parseInt(CallDuration) || 0,
      twilioPrice: Price ? parseFloat(Price) : null,
    }
  });

  // If completed, update usage
  if (CallStatus === 'completed' && CallDuration) {
    await updateUsage(call.organizationId, parseInt(CallDuration));
  }

  res.sendStatus(200);
});
```

---

## Error Handling

### Fallback Strategies

```
Error Recovery Flow
│
├── Primary TwiML Error
│   └── Fallback URL responds with basic TwiML
│       └── "We're experiencing issues. Please try again."
│
├── Media Stream Disconnect
│   └── Automatic reconnection attempt (3 retries)
│       └── If fails, gracefully end call with message
│
├── AI Processing Error
│   └── Fallback to voicemail or forwarding
│       └── Store caller info for callback
│
└── Complete Outage
    └── Static TwiML response
        └── "Please call back later" message
```

### Fallback TwiML

```javascript
router.post('/fallback', async (req, res) => {
  const response = new VoiceResponse();

  response.say({
    voice: 'Polly.Amy',
  }, 'We are experiencing technical difficulties. Please leave a message or try again later.');

  response.record({
    maxLength: 60,
    action: '/api/voice/emergency-recording',
  });

  res.type('text/xml');
  res.send(response.toString());
});
```

---

## Cost Optimization

### Pricing Considerations

| Resource | Cost | Optimization |
|----------|------|--------------|
| Phone Numbers | $1-2/month | Provision only needed numbers |
| Inbound Calls | $0.0085/min | Efficient AI, quick transfers |
| Outbound Calls | $0.013/min | Minimize unnecessary calls |
| Recording Storage | $0.0025/min | S3 migration, retention policies |
| Media Streams | Included | - |

### Cost Tracking

```javascript
// After each call, calculate and log costs
async function logCallCost(callSid, organizationId) {
  const call = await twilioClient.calls(callSid).fetch();

  const costs = {
    twilioVoice: parseFloat(call.price) || 0,
    aiMinutes: call.aiTokensUsed ? (call.aiTokensUsed / 1000) * 0.06 : 0,
    recording: call.recordingDuration ? (call.recordingDuration / 60) * 0.0025 : 0,
  };

  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);

  await prisma.usageLog.create({
    data: {
      type: 'call_cost',
      quantity: totalCost,
      unit: 'usd',
      periodStart: new Date(),
      periodEnd: new Date(),
      organizationId,
    }
  });
}
```

---

## Browser Compatibility

### Supported Browsers

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 70+ | Full support |
| Firefox | 70+ | Full support |
| Safari | 14+ | Microphone permission quirks |
| Edge | 79+ | Chromium-based |

### Browser-Specific Handling

```javascript
function getAudioConstraints() {
  const browser = detectBrowser();

  const base = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  switch (browser) {
    case 'safari':
      // Safari has issues with some audio processing
      return {
        ...base,
        noiseSuppression: false,
        autoGainControl: false,
      };
    case 'firefox':
      // Firefox AGC can cause feedback
      return {
        ...base,
        autoGainControl: false,
      };
    default:
      return base;
  }
}
```

---

## Security Considerations

### Credential Management

| Credential | Storage | Access |
|------------|---------|--------|
| Account SID | Environment | Backend only |
| Auth Token | Environment | Backend only |
| API Key SID | Database | Per organization |
| API Key Secret | Database (encrypted) | Per organization |
| Access Tokens | JWT (short-lived) | Client, 1 hour expiry |

### Webhook Security

```javascript
// Validate Twilio webhook signatures
const validateTwilioSignature = (req, res, next) => {
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    return res.status(403).send('Invalid signature');
  }

  next();
};
```

---

*This document is updated when telephony features change.*
