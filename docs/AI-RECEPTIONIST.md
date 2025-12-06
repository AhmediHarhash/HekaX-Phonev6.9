# AI Receptionist System

**Intelligent Voice Agent Documentation**

Version 2.0 | Last Updated: December 2024

---

## Overview

The AI Receptionist is the core feature of HEKAX Phone, providing 24/7 intelligent call handling for businesses. It uses OpenAI's GPT-4 and Realtime API to conduct natural conversations, capture leads, book appointments, and transfer calls when necessary.

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Language Model | OpenAI GPT-4 | Conversation intelligence |
| Voice Processing | OpenAI Realtime API | Real-time speech-to-text and text-to-speech |
| Telephony | Twilio Media Streams | Audio transport |
| Voice Synthesis | OpenAI TTS | Natural voice output |
| Speech Recognition | OpenAI Whisper | Accurate transcription |

---

## System Architecture

```
                    AI Receptionist Architecture

  Caller                  Twilio                    Backend
    |                       |                          |
    |   Voice Call          |                          |
    |---------------------->|                          |
    |                       |                          |
    |                       |   WebSocket Stream       |
    |                       |------------------------->|
    |                       |                          |
    |                       |                     +----+----+
    |                       |                     |   AI    |
    |                       |                     | Service |
    |                       |                     +----+----+
    |                       |                          |
    |                       |                     +----+----+
    |                       |                     | OpenAI  |
    |                       |                     |Realtime |
    |                       |                     |   API   |
    |                       |                     +----+----+
    |                       |                          |
    |   AI Voice Response   |   Audio Stream           |
    |<----------------------|<-------------------------|
    |                       |                          |
```

---

## Conversation Flow

### Standard Call Flow

```
                        AI Receptionist Call Flow

    +------------------+
    |   Incoming Call  |
    +--------+---------+
             |
             v
    +--------+---------+
    |  Load Org Config |
    |  - Greeting      |
    |  - Voice ID      |
    |  - Business Info |
    +--------+---------+
             |
             v
    +--------+---------+
    |  Play Greeting   |
    |  "Thank you for  |
    |   calling..."    |
    +--------+---------+
             |
             v
    +--------+---------+
    |  Listen & Process|<-----------+
    |  Caller Speech   |            |
    +--------+---------+            |
             |                      |
             v                      |
    +--------+---------+            |
    |  GPT-4 Analysis  |            |
    |  - Intent        |            |
    |  - Entities      |            |
    |  - Next Action   |            |
    +--------+---------+            |
             |                      |
             v                      |
    +--------+---------+            |
    | Determine Action |            |
    +---+----+----+----+            |
        |    |    |                 |
        v    v    v                 |
    +---++ +--+--+ ++---+           |
    |Info| |Book | |Xfer|           |
    +---++ +--+--+ ++---+           |
        |    |    |                 |
        v    v    v                 |
    +--------+---------+            |
    |  Generate Reply  |------------+
    +--------+---------+
             |
             v
    +--------+---------+
    |  End Call?       |
    +---+----------+---+
        |          |
        v          v
    +---+---+  +---+---+
    |  Yes  |  |   No  |----> Continue Conversation
    +---+---+  +-------+
        |
        v
    +---+---+
    | Save  |
    | Lead  |
    +---+---+
        |
        v
    +---+---+
    |  Sync |
    |  CRM  |
    +-------+
```

---

## AI Configuration

### System Prompt Structure

The AI receives a detailed system prompt that defines its behavior:

```
SYSTEM PROMPT COMPONENTS:

1. IDENTITY
   - Business name
   - Role (receptionist)
   - Personality traits

2. BUSINESS CONTEXT
   - Services offered
   - Operating hours
   - Location/contact info
   - Pricing (if applicable)

3. CAPABILITIES
   - Answer questions
   - Capture lead information
   - Book appointments
   - Transfer to human

4. CONSTRAINTS
   - What NOT to discuss
   - Privacy guidelines
   - Escalation triggers

5. CONVERSATION STYLE
   - Tone (professional, friendly)
   - Response length
   - Language preferences
```

### Example System Prompt

```
You are the AI receptionist for [Business Name], a [business type]
located in [city]. Your role is to professionally handle incoming
calls and assist callers.

BUSINESS INFORMATION:
- Services: [list of services]
- Hours: Monday-Friday 9am-5pm
- Address: [address]
- Phone: [phone]

YOUR CAPABILITIES:
1. Answer questions about our services
2. Collect caller information (name, phone, email, reason for calling)
3. Schedule appointments during business hours
4. Transfer urgent calls to a team member

GUIDELINES:
- Be concise and professional
- Always collect caller's name and phone number
- If asked about pricing, provide general ranges
- For emergencies, offer to transfer immediately
- Do not make promises about availability without checking

IMPORTANT: If the caller asks to speak with a human or the conversation
becomes complex, offer to transfer the call.
```

---

## Voice Configuration

### Available Voices

| Voice ID | Name | Characteristics | Best For |
|----------|------|-----------------|----------|
| nova | Nova | Calm, professional | Default for businesses |
| sage | Sage | Warm, wise | Consulting, advisory |
| alloy | Alloy | Neutral, balanced | General purpose |
| echo | Echo | Friendly, warm | Customer service |
| onyx | Onyx | Deep, authoritative | Legal, financial |
| shimmer | Shimmer | Soft, gentle | Healthcare, wellness |

### Voice Selection Factors

- **Industry**: Legal firms prefer authoritative (Onyx), healthcare prefers gentle (Shimmer)
- **Brand**: Startup vs. enterprise tone
- **Demographics**: Consider caller expectations

---

## Real-time Processing

### OpenAI Realtime API Integration

```
                    Realtime API Data Flow

    Audio In                 Processing                Audio Out
        |                        |                         |
        v                        v                         v
   +----+----+            +------+------+            +----+----+
   | Twilio  |            |   OpenAI    |            | Twilio  |
   | Media   |----------->|  Realtime   |----------->| Media   |
   | Stream  |   Audio    |    API      |   Audio    | Stream  |
   +----+----+  (base64)  +------+------+  (base64)  +----+----+
        |                        |                         |
        |                        v                         |
        |                 +------+------+                  |
        |                 |   Events    |                  |
        |                 +------+------+                  |
        |                        |                         |
        |           +------------+------------+            |
        |           |            |            |            |
        |           v            v            v            |
        |    +------+--+  +------+--+  +------+--+        |
        |    |Transcript|  |Function |  | Audio  |        |
        |    |  Update  |  |  Call   |  | Delta  |        |
        |    +---------+   +---------+  +---------+        |
        |                        |                         |
        +------------------------+-------------------------+
                                 |
                                 v
                          +------+------+
                          |   Backend   |
                          |  Processing |
                          +-------------+
```

### Event Types Handled

| Event | Description | Action |
|-------|-------------|--------|
| `session.created` | Connection established | Send initial config |
| `conversation.item.created` | New message in conversation | Log transcript |
| `response.audio.delta` | Audio chunk ready | Stream to caller |
| `response.done` | Response complete | Check for function calls |
| `input_audio_buffer.speech_started` | Caller started speaking | Pause AI response |
| `input_audio_buffer.speech_stopped` | Caller stopped speaking | Process input |

---

## Function Calling

### Available Functions

The AI can execute specific functions during conversation:

#### 1. capture_lead

```json
{
  "name": "capture_lead",
  "description": "Save caller information as a lead",
  "parameters": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Caller's full name"
      },
      "phone": {
        "type": "string",
        "description": "Caller's phone number"
      },
      "email": {
        "type": "string",
        "description": "Caller's email address"
      },
      "reason": {
        "type": "string",
        "description": "Reason for calling"
      },
      "urgency": {
        "type": "string",
        "enum": ["low", "medium", "high"],
        "description": "How urgent is the inquiry"
      }
    },
    "required": ["name", "phone", "reason"]
  }
}
```

#### 2. book_appointment

```json
{
  "name": "book_appointment",
  "description": "Schedule an appointment",
  "parameters": {
    "type": "object",
    "properties": {
      "date": {
        "type": "string",
        "description": "Requested date (YYYY-MM-DD)"
      },
      "time": {
        "type": "string",
        "description": "Requested time (HH:MM)"
      },
      "duration": {
        "type": "integer",
        "description": "Duration in minutes"
      },
      "purpose": {
        "type": "string",
        "description": "Purpose of appointment"
      }
    },
    "required": ["date", "time", "purpose"]
  }
}
```

#### 3. transfer_call

```json
{
  "name": "transfer_call",
  "description": "Transfer caller to a team member",
  "parameters": {
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "description": "Why the transfer is needed"
      },
      "target": {
        "type": "string",
        "description": "Who to transfer to (if specified)"
      }
    },
    "required": ["reason"]
  }
}
```

#### 4. check_availability

```json
{
  "name": "check_availability",
  "description": "Check available appointment slots",
  "parameters": {
    "type": "object",
    "properties": {
      "date": {
        "type": "string",
        "description": "Date to check (YYYY-MM-DD)"
      }
    },
    "required": ["date"]
  }
}
```

---

## Barge-In Detection

### Human Override System

The AI receptionist includes "barge-in" detection, allowing team members to take over a call:

```
                    Barge-In Flow

    AI Handling Call              Team Member
          |                            |
          |   1. Team member joins     |
          |<---------------------------|
          |                            |
          v                            |
    +-----+-----+                      |
    |  Detect   |                      |
    |  Voice    |                      |
    +-----+-----+                      |
          |                            |
          v                            |
    +-----+-----+                      |
    | Pause AI  |                      |
    | Response  |                      |
    +-----+-----+                      |
          |                            |
          v                            |
    +-----+-----+                      |
    | Listen    |                      |
    | For Human |                      |
    +-----+-----+                      |
          |                            |
          |   2. Human speaking        |
          |--------------------------->|
          |                            |
          v                            |
    +-----+-----+                      |
    | AI Stays  |                      |
    | Silent    |                      |
    +-----+-----+                      |
          |                            |
          |   3. Human finishes        |
          |<---------------------------|
          |                            |
          v                            |
    +-----+-----+                      |
    | Resume AI |                      |
    | if needed |                      |
    +-----------+                      |
```

### Technical Implementation

```javascript
// Barge-in detection parameters
const BARGE_IN_CONFIG = {
  silenceThreshold: 0.02,      // Audio level considered silence
  speechThreshold: 0.05,       // Audio level considered speech
  minSpeechDuration: 300,      // ms of speech to trigger pause
  resumeDelay: 1500,           // ms of silence before AI resumes
};

// State machine for barge-in
const states = {
  AI_SPEAKING: 'ai_speaking',
  LISTENING: 'listening',
  HUMAN_DETECTED: 'human_detected',
  PAUSED: 'paused',
};
```

---

## Transcript Management

### Real-time Transcription

Every call generates a complete transcript:

```json
{
  "callId": "call_abc123",
  "organizationId": "org_xyz",
  "transcript": [
    {
      "timestamp": "2024-12-06T10:00:00Z",
      "speaker": "AI",
      "text": "Thank you for calling Acme Services. How may I help you today?"
    },
    {
      "timestamp": "2024-12-06T10:00:05Z",
      "speaker": "Caller",
      "text": "Hi, I'm interested in getting a quote for your services."
    },
    {
      "timestamp": "2024-12-06T10:00:10Z",
      "speaker": "AI",
      "text": "I'd be happy to help you with that. May I have your name?"
    }
  ],
  "summary": "Caller inquired about service pricing. Lead captured.",
  "sentiment": "positive",
  "duration": 180
}
```

### Transcript Storage

| Field | Type | Description |
|-------|------|-------------|
| callId | String | Unique call identifier |
| organizationId | String | Tenant identifier |
| transcript | JSON Array | Timestamped conversation |
| summary | String | AI-generated summary |
| sentiment | Enum | positive/neutral/negative |
| leadId | String | Associated lead if captured |

---

## Performance Metrics

### Latency Targets

| Metric | Target | Typical |
|--------|--------|---------|
| First response | < 1s | 600-800ms |
| Turn-around time | < 2s | 1-1.5s |
| Transcription | Real-time | < 500ms delay |

### Quality Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Lead capture rate | Calls resulting in lead | > 70% |
| Transfer rate | Calls transferred to human | < 20% |
| Completion rate | Calls handled without errors | > 95% |
| CSAT equivalent | Caller satisfaction proxy | > 4.0/5.0 |

---

## Error Handling

### Failure Scenarios

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| OpenAI timeout | 10s no response | Apologize, offer callback |
| Audio quality poor | High packet loss | Request caller to repeat |
| Function failure | Exception caught | Continue conversation |
| WebSocket disconnect | Connection lost | Graceful call termination |

### Fallback Behavior

```
If AI cannot understand after 3 attempts:
  -> Offer to transfer to human
  -> If no human available:
     -> Capture callback number
     -> Promise return call
     -> End call gracefully
```

---

## Cost Analysis

### OpenAI API Costs (Approximate)

| Component | Rate | Per Call (2 min avg) |
|-----------|------|---------------------|
| Realtime API | $0.06/min audio | $0.12 |
| GPT-4 tokens | $0.03/1K input | ~$0.02 |
| TTS output | Included in Realtime | - |

**Average cost per AI-handled call: ~$0.15**

### Cost Optimization Strategies

1. **Efficient prompts**: Minimize system prompt token count
2. **Quick resolution**: Train AI to resolve calls faster
3. **Smart transfers**: Transfer complex calls early
4. **Caching**: Cache common responses (future)

---

## Future Enhancements

### Planned Features

1. **Multilingual Support**: Spanish, French, German
2. **Voice Cloning**: Custom brand voices
3. **Sentiment Analysis**: Real-time caller mood detection
4. **Smart Routing**: AI decides best team member for transfer
5. **Learning**: Improve from successful call patterns

### Research Areas

- Emotion detection from voice
- Predictive intent modeling
- Automated quality scoring
- Conversation summarization improvements

---

*This document is updated as new AI capabilities are added.*
