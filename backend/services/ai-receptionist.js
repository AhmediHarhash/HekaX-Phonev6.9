// ============================================================================
// HEKAX Phone - AI Receptionist Service
// Enterprise-Grade Voice AI with Deepgram Real-Time STT
// ============================================================================

require("dotenv").config();
const OpenAI = require("openai");
const WebSocket = require("ws");
const twilio = require("twilio");

// ============================================================================
// VOICE OPTIONS (OpenAI TTS)
// ============================================================================
const VOICE_OPTIONS = {
  nova: { name: "Nova", description: "Calm & professional" },
  sage: { name: "Sage", description: "Warm & wise" },
  alloy: { name: "Alloy", description: "Neutral & balanced" },
  echo: { name: "Echo", description: "Friendly & warm" },
  onyx: { name: "Onyx", description: "Deep & authoritative" },
  shimmer: { name: "Shimmer", description: "Soft & gentle" },
};

const DEFAULT_VOICE = "nova";

// ============================================================================
// HOLD MUSIC URL (royalty-free)
// ============================================================================
const HOLD_MUSIC_URL = "http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-B8.mp3";

// ============================================================================
// DEEPGRAM CONFIGURATION
// ============================================================================
const DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen";
const DEEPGRAM_OPTIONS = {
  model: "nova-2",
  language: "en-US",
  smart_format: true,
  encoding: "mulaw",
  sample_rate: 8000,
  channels: 1,
  punctuate: true,
  interim_results: true,
  utterance_end_ms: 1000,
  vad_events: true,
  endpointing: 300,
};

class AIReceptionist {
  constructor({
    streamSid,
    callSid,
    ws,
    prisma,
    fromNumber,
    toNumber,
    customParameters,
    organization,
  }) {
    this.streamSid = streamSid;
    this.callSid = callSid;
    this.ws = ws;
    this.prisma = prisma;
    this.fromNumber = fromNumber;
    this.toNumber = toNumber;
    this.organization = organization || null;
    this.orgName = organization?.name || "our company";
    this.greeting = organization?.greeting || `Thank you for calling ${this.orgName}. How may I help you today?`;
    this.customParameters = customParameters || {};

    // Voice selection
    this.voiceId = organization?.voiceId || DEFAULT_VOICE;
    if (!VOICE_OPTIONS[this.voiceId]) {
      this.voiceId = DEFAULT_VOICE;
    }

    // =========================================================================
    // STATE MANAGEMENT
    // =========================================================================
    this.cleanedUp = false;
    this.transferredToHuman = false;
    this.turnCount = 0;
    this.maxTurns = 25;
    this.isProcessing = false;
    this.isSpeaking = false;
    this.wantsHumanTransfer = false;
    this.callStartTime = Date.now();

    // =========================================================================
    // DEEPGRAM STREAMING STT
    // =========================================================================
    this.deepgramWs = null;
    this.deepgramReady = false;
    this.currentUtterance = ""; // Accumulates interim results
    this.lastFinalTranscript = ""; // Last finalized transcript

    // =========================================================================
    // CONVERSATION TRACKING
    // =========================================================================
    this.conversationHistory = [];
    this.transcript = [];
    this.callerInfo = {
      name: null,
      email: null,
      company: null,
      reason: null,
      serviceInterest: null,
      preferredCallbackTime: null,
      appointmentDate: null,
      appointmentTime: null,
      urgency: "MEDIUM",
      referralSource: null,
      phone: fromNumber,
      wantsHumanAgent: false,
    };

    // =========================================================================
    // API CLIENTS
    // =========================================================================
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  async initialize() {
    console.log("🤖 Initializing AI Receptionist for:", this.orgName);
    console.log("🎤 Voice:", this.voiceId, "| Using Deepgram streaming STT");

    try {
      // Connect to Deepgram streaming STT
      await this.connectToDeepgram();

      // Small delay for audio stream to stabilize, then greet
      setTimeout(async () => {
        await this.speak(this.greeting);
      }, 1000);
    } catch (error) {
      console.error("❌ Initialization error:", error.message);
      await this.speak("Thank you for calling. Please hold.");
    }
  }

  // ===========================================================================
  // DEEPGRAM STREAMING CONNECTION
  // ===========================================================================
  async connectToDeepgram() {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        console.error("❌ DEEPGRAM_API_KEY not found in environment");
        reject(new Error("Missing Deepgram API key"));
        return;
      }

      // Build URL with query params
      const params = new URLSearchParams(DEEPGRAM_OPTIONS).toString();
      const url = `${DEEPGRAM_URL}?${params}`;

      console.log("🎙️ Connecting to Deepgram...");

      this.deepgramWs = new WebSocket(url, {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      });

      this.deepgramWs.on("open", () => {
        console.log("✅ Deepgram connected");
        this.deepgramReady = true;
        resolve();
      });

      this.deepgramWs.on("message", (data) => {
        this.handleDeepgramMessage(data);
      });

      this.deepgramWs.on("error", (error) => {
        console.error("❌ Deepgram error:", error.message);
        this.deepgramReady = false;
      });

      this.deepgramWs.on("close", (code, reason) => {
        console.log("📴 Deepgram disconnected:", code, reason?.toString());
        this.deepgramReady = false;
      });

      // Timeout for connection
      setTimeout(() => {
        if (!this.deepgramReady) {
          reject(new Error("Deepgram connection timeout"));
        }
      }, 5000);
    });
  }

  // ===========================================================================
  // HANDLE DEEPGRAM MESSAGES (Real-time transcripts)
  // ===========================================================================
  handleDeepgramMessage(data) {
    try {
      const response = JSON.parse(data.toString());

      // Handle speech started event
      if (response.type === "SpeechStarted") {
        console.log("🗣️ Caller started speaking");
        return;
      }

      // Handle utterance end event (Deepgram detected end of speech)
      if (response.type === "UtteranceEnd") {
        console.log("🔇 Utterance end detected");
        // Process accumulated utterance if we have one
        if (this.currentUtterance.trim()) {
          this.handleFinalTranscript(this.currentUtterance.trim());
          this.currentUtterance = "";
        }
        return;
      }

      // Handle transcript results
      if (response.channel?.alternatives?.[0]) {
        const alt = response.channel.alternatives[0];
        const transcript = alt.transcript || "";
        const isFinal = response.is_final;
        const speechFinal = response.speech_final;

        if (!transcript) return;

        if (isFinal) {
          // Final result for this segment
          this.currentUtterance += (this.currentUtterance ? " " : "") + transcript;
          console.log(`📝 Interim: "${this.currentUtterance}"`);

          // If speech_final is true, the speaker has finished talking
          if (speechFinal) {
            console.log(`✅ Final: "${this.currentUtterance}"`);
            this.handleFinalTranscript(this.currentUtterance.trim());
            this.currentUtterance = "";
          }
        }
      }
    } catch (error) {
      console.error("❌ Deepgram parse error:", error.message);
    }
  }

  // ===========================================================================
  // HANDLE FINAL TRANSCRIPT (Trigger AI response)
  // ===========================================================================
  async handleFinalTranscript(text) {
    if (!text || text.length < 2) {
      console.log("⚠️ Empty transcript, ignoring");
      return;
    }

    // Don't process if we're speaking or already processing
    if (this.isSpeaking) {
      console.log("⚠️ Still speaking, queuing transcript");
      return;
    }

    if (this.isProcessing) {
      console.log("⚠️ Already processing, queuing transcript");
      return;
    }

    if (this.transferredToHuman) {
      console.log("⚠️ Transferred to human, ignoring");
      return;
    }

    console.log("🎤 Caller:", text);
    this.transcript.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    await this.processUserInput(text);
  }

  // ===========================================================================
  // AUDIO HANDLING - Send to Deepgram
  // ===========================================================================
  handleAudio(payload) {
    if (this.transferredToHuman) return;
    if (this.isSpeaking) return;

    // Send raw mulaw audio directly to Deepgram
    if (this.deepgramReady && this.deepgramWs?.readyState === WebSocket.OPEN) {
      const audioData = Buffer.from(payload, "base64");
      this.deepgramWs.send(audioData);
    }
  }

  // ===========================================================================
  // CONVERSATION PROCESSING (JSON-based)
  // ===========================================================================
  async processUserInput(userText) {
    this.isProcessing = true;
    this.turnCount++;

    if (this.turnCount > this.maxTurns) {
      await this.speak("Thank you for your time. I'll make sure your information is passed to our team. Have a great day!");
      this.isProcessing = false;
      return;
    }

    try {
      // Add user message to history
      this.conversationHistory.push({ role: "user", content: userText });

      // Generate AI response with JSON format
      console.log("🧠 Generating response...");
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: this.getSystemPrompt() },
          ...this.conversationHistory,
        ],
        max_tokens: 250,
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices[0].message.content;

      // Safe JSON parse with fallback
      let aiJson;
      try {
        aiJson = JSON.parse(rawContent);
      } catch (parseError) {
        console.warn("⚠️ JSON parse failed, using raw as reply:", rawContent?.substring(0, 100));
        const lowerText = userText.toLowerCase();
        const humanKeywords = ["human", "person", "agent", "representative", "transfer", "speak to someone", "real person"];
        const needsHuman = humanKeywords.some(kw => lowerText.includes(kw));
        aiJson = {
          reply: rawContent || "I apologize, could you please repeat that?",
          intent: "other",
          needs_human: needsHuman,
          slots: {},
          end_call: false,
          urgency: "MEDIUM"
        };
      }

      const reply = aiJson.reply || "I apologize, could you please repeat that?";
      console.log("🤖 AI reply:", reply);
      if (aiJson.intent) console.log("📋 Intent:", aiJson.intent, "| needs_human:", aiJson.needs_human);

      // Apply extracted slots to callerInfo
      this.applyAIResult(aiJson);

      // Add only the reply to conversation history
      this.conversationHistory.push({ role: "assistant", content: reply });
      this.transcript.push({
        role: "assistant",
        content: reply,
        timestamp: new Date().toISOString(),
      });

      // Handle human transfer request
      if (aiJson.needs_human && !this.transferredToHuman) {
        this.transferredToHuman = true;
        await this.speak(reply);

        // Wait for TTS audio to fully play on caller's end (network delay)
        // The speak() function sends audio but caller needs time to hear it
        console.log("⏳ Waiting for TTS to play before transfer...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Now initiate the transfer
        await this.transferToHumanWithMusic();
        this.isProcessing = false;
        return;
      }

      // Handle end call
      if (aiJson.end_call) {
        await this.speak(reply);
        console.log("📞 AI decided to end call");
        this.isProcessing = false;
        return;
      }

      // Normal response
      await this.speak(reply);
    } catch (error) {
      console.error("❌ Process error:", error.message);
      await this.speak("I apologize, could you please repeat that?");
    } finally {
      this.isProcessing = false;
    }
  }

  // ===========================================================================
  // APPLY AI RESULT TO CALLER INFO
  // ===========================================================================
  applyAIResult(aiJson) {
    if (aiJson.slots && typeof aiJson.slots === "object") {
      const slotMapping = {
        name: "name",
        email: "email",
        company: "company",
        reason: "reason",
        service_interest: "serviceInterest",
        callback_time: "preferredCallbackTime",
        appointment_date: "appointmentDate",
        appointment_time: "appointmentTime",
        referral_source: "referralSource"
      };

      for (const [slotKey, infoKey] of Object.entries(slotMapping)) {
        if (aiJson.slots[slotKey] && aiJson.slots[slotKey] !== null) {
          this.callerInfo[infoKey] = aiJson.slots[slotKey];
          console.log(`📝 Slot: ${infoKey} = ${aiJson.slots[slotKey]}`);
        }
      }
    }

    if (aiJson.urgency && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(aiJson.urgency)) {
      this.callerInfo.urgency = aiJson.urgency;
    }

    if (aiJson.needs_human === true) {
      this.wantsHumanTransfer = true;
      this.callerInfo.wantsHumanAgent = true;
      console.log("🙋 Caller wants human transfer");
    }

    if (this.callerInfo.name) {
      console.log("📋 Caller identified:", this.callerInfo.name);
    }
  }

  // ===========================================================================
  // TRANSFER TO HUMAN
  // ===========================================================================
  async transferToHuman() {
    try {
      console.log("🔁 Transferring to human agent...");
      this.transferredToHuman = true;

      // Close Deepgram connection first
      if (this.deepgramWs) {
        try {
          this.deepgramWs.send(JSON.stringify({ type: "CloseStream" }));
          this.deepgramWs.close();
        } catch (e) {}
      }
      this.deepgramReady = false;

      const callerId = this.toNumber || process.env.TWILIO_NUMBER;

      // Use organization-based client identity (matches token generation)
      // Format: {organizationId}-web
      const clientIdentity = this.organization?.id
        ? `${this.organization.id}-web`
        : "default-web";

      console.log("📞 Dialing client:", clientIdentity);

      // Simple direct dial to web client
      await this.twilioClient.calls(this.callSid).update({
        twiml: `<Response><Dial callerId="${callerId}"><Client>${clientIdentity}</Client></Dial></Response>`,
      });

      console.log("✅ Transfer initiated to", clientIdentity);
    } catch (err) {
      console.error("❌ Transfer error:", err.message);
    }
  }

  // Alias for compatibility
  async transferToHumanWithMusic() {
    return this.transferToHuman();
  }

  // ===========================================================================
  // TEXT-TO-SPEECH
  // ===========================================================================
  async speak(text) {
    try {
      console.log("🔊 Speaking:", text.substring(0, 60) + (text.length > 60 ? "..." : ""));
      this.isSpeaking = true;

      // Reset utterance tracking
      this.currentUtterance = "";

      const audioBuffer = await this.textToSpeech(text);
      if (audioBuffer) {
        await this.sendAudioToTwilio(audioBuffer);
      }

      // Small delay after speaking to let Deepgram settle
      await new Promise(resolve => setTimeout(resolve, 200));

      this.isSpeaking = false;
      console.log("🎤 Listening...");
    } catch (error) {
      console.error("❌ Speak error:", error);
      this.isSpeaking = false;
      console.log("🎤 Listening...");
    }
  }

  async textToSpeech(text) {
    try {
      const mp3Response = await this.openai.audio.speech.create({
        model: "tts-1",
        voice: this.voiceId,
        input: text,
        response_format: "pcm",
        speed: 1.0,
      });

      const arrayBuffer = await mp3Response.arrayBuffer();
      const pcmBuffer = Buffer.from(arrayBuffer);
      return this.pcmToMulaw(pcmBuffer);
    } catch (error) {
      console.error("❌ TTS error:", error.message);
      return null;
    }
  }

  pcmToMulaw(pcmBuffer) {
    const inputSamples = new Int16Array(
      pcmBuffer.buffer,
      pcmBuffer.byteOffset,
      Math.floor(pcmBuffer.length / 2)
    );
    const outputLength = Math.floor(inputSamples.length / 3);
    const mulawOutput = Buffer.alloc(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sample = inputSamples[i * 3];
      mulawOutput[i] = this.linearToMulaw(sample);
    }

    return mulawOutput;
  }

  linearToMulaw(sample) {
    const MULAW_MAX = 0x1FFF;
    const MULAW_BIAS = 33;

    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;

    sample = Math.min(sample, MULAW_MAX);
    sample += MULAW_BIAS;

    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}

    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulawByte = ~(sign | (exponent << 4) | mantissa);

    return mulawByte & 0xFF;
  }

  async sendAudioToTwilio(audioBuffer) {
    const chunkSize = 160;
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      const chunk = audioBuffer.slice(i, Math.min(i + chunkSize, audioBuffer.length));
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          event: "media",
          streamSid: this.streamSid,
          media: { payload: chunk.toString("base64") },
        }));
      }
      await new Promise(resolve => setTimeout(resolve, 18));
    }
  }

  handleMark(mark) {
    // TTS mark handling
  }

  // ===========================================================================
  // SYSTEM PROMPT (JSON Response Format)
  // ===========================================================================
  getSystemPrompt() {
    return `You are the professional AI receptionist for ${this.orgName}.

VOICE PERSONA:
- Warm, confident, and genuinely helpful
- Speak naturally like a skilled human receptionist
- Use conversational language, not robotic phrases
- Show empathy and understanding

RESPONSE FORMAT:
You MUST respond with valid JSON in this exact format:
{
  "reply": "Your spoken response to the caller (1-2 short sentences, max 30 words)",
  "intent": "greeting|inquiry|appointment|complaint|transfer_request|callback|other",
  "needs_human": false,
  "slots": {
    "name": null,
    "email": null,
    "company": null,
    "reason": null,
    "service_interest": null,
    "callback_time": null,
    "appointment_date": null,
    "appointment_time": null,
    "referral_source": null
  },
  "end_call": false,
  "urgency": "LOW|MEDIUM|HIGH|CRITICAL"
}

RULES FOR JSON FIELDS:
- "reply": Your natural spoken response. Keep it short (1-2 sentences). No emojis or special characters.
- "intent": Classify what the caller wants.
- "needs_human": Set to true ONLY if caller explicitly asks for human/agent/representative/transfer/real person.
- "slots": Extract any information the caller provides. Use null for unknown values. Only fill slots with clearly stated info.
- "end_call": Set to true when conversation is complete (caller says goodbye, issue resolved, etc.)
- "urgency": Based on caller's tone and situation.

CONVERSATION FLOW:
1. If you don't have their name, ask for it naturally
2. Understand their reason for calling
3. Gather relevant details (appointments, contact info)
4. If they ask for a human, set needs_human: true and reply with "Let me connect you with a team member right away."
5. End calls warmly when appropriate

CURRENT CALLER INFO:
- Phone: ${this.callerInfo.phone || "Unknown"}
- Name: ${this.callerInfo.name || "Not yet provided"}
- Company: ${this.callerInfo.company || "Not mentioned"}
- Reason: ${this.callerInfo.reason || "Not yet stated"}
- Call Duration: ${Math.round((Date.now() - this.callStartTime) / 1000)}s

IMPORTANT: Only output valid JSON. No explanations, no markdown, just the JSON object.`;
  }

  // ===========================================================================
  // CLEANUP & SUMMARY
  // ===========================================================================
  async generateSummary() {
    if (this.transcript.length < 2) return "Brief call - minimal conversation";

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Summarize this call in 1-2 sentences. Include: who called, why, and outcome.",
          },
          {
            role: "user",
            content: this.transcript.map(t => `${t.role}: ${t.content}`).join("\n"),
          },
        ],
        max_tokens: 100,
      });
      return response.choices[0].message.content;
    } catch (error) {
      return "Summary unavailable";
    }
  }

  async cleanup() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    console.log("🧹 Cleaning up call:", this.callSid);

    // Close Deepgram connection
    if (this.deepgramWs) {
      try {
        // Send close message to Deepgram
        this.deepgramWs.send(JSON.stringify({ type: "CloseStream" }));
        this.deepgramWs.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    const callDuration = Math.round((Date.now() - this.callStartTime) / 1000);
    console.log(`📞 Call duration: ${callDuration}s, Turns: ${this.turnCount}, Transcript entries: ${this.transcript.length}`);

    // Save call log
    try {
      await this.prisma.callLog.upsert({
        where: { callSid: this.callSid },
        update: {
          handledByAI: true,
          transferredToHuman: this.transferredToHuman,
          duration: callDuration,
          organizationId: this.organization?.id,
          status: "COMPLETED",
        },
        create: {
          callSid: this.callSid,
          direction: "INBOUND",
          fromNumber: this.callerInfo.phone || "Unknown",
          toNumber: this.toNumber || "Unknown",
          status: "COMPLETED",
          duration: callDuration,
          handledByAI: true,
          transferredToHuman: this.transferredToHuman,
          organizationId: this.organization?.id,
        },
      });
      console.log("✅ Call log saved");
    } catch (err) {
      console.error("❌ Call log save error:", err.message);
    }

    // Save transcript
    if (this.transcript.length > 0) {
      try {
        const summary = await this.generateSummary();
        console.log("📝 Summary:", summary);

        await this.prisma.transcript.create({
          data: {
            callSid: this.callSid,
            fullText: this.transcript.map(t => `${t.role}: ${t.content}`).join("\n"),
            messages: this.transcript,
            summary,
            organizationId: this.organization?.id,
          },
        });
        console.log("✅ Transcript saved");

        // Create lead if we have caller info
        if (this.callerInfo.name || this.callerInfo.reason) {
          await this.prisma.lead.create({
            data: {
              callSid: this.callSid,
              name: this.callerInfo.name || "Unknown Caller",
              phone: this.callerInfo.phone || "Unknown",
              email: this.callerInfo.email,
              company: this.callerInfo.company,
              reason: this.callerInfo.reason || "Not specified",
              serviceInterest: this.callerInfo.serviceInterest,
              preferredCallbackTime: this.callerInfo.preferredCallbackTime,
              appointmentDate: this.callerInfo.appointmentDate,
              appointmentTime: this.callerInfo.appointmentTime,
              urgency: this.callerInfo.urgency || "MEDIUM",
              referralSource: this.callerInfo.referralSource,
              status: this.wantsHumanTransfer ? "CONTACTED" : "NEW",
              organizationId: this.organization?.id,
            },
          });
          console.log("✅ Lead saved:", this.callerInfo.name || "Unknown");
        }
      } catch (err) {
        console.error("❌ Transcript/Lead save error:", err.message, err.stack);
      }
    } else {
      console.log("⚠️ No transcript to save");
    }

    console.log("🧹 Cleanup complete");
  }
}

module.exports = { AIReceptionist, VOICE_OPTIONS, DEFAULT_VOICE };
