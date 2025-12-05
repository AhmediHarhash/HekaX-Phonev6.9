// ============================================================================
// HEKAX Phone - AI Receptionist Service
// Enterprise-Grade Voice AI with Natural Conversation Flow
// ============================================================================

require("dotenv").config();
const OpenAI = require("openai");
const WebSocket = require("ws");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");
const os = require("os");

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
    // AUDIO BUFFERING - Enterprise Settings
    // =========================================================================
    this.audioBuffer = [];
    this.silenceTimer = null;
    this.lastAudioTime = Date.now();
    this.lastSpeechTime = Date.now();
    this.speechStartTime = null; // When caller started current utterance
    this.hasSpeechInBuffer = false; // Whether buffer contains any speech

    // Tuned thresholds for natural conversation
    this.SILENCE_THRESHOLD_MS = 1200; // 1.2 seconds - wait for caller to finish
    this.MIN_SPEECH_DURATION_MS = 300; // Minimum speech duration to process
    this.MIN_AUDIO_LENGTH = 1600; // Minimum ~0.1 seconds of audio
    this.SPEECH_THRESHOLD = 15; // Audio level threshold (lowered for sensitivity)
    this.SPEECH_CONFIRM_CHUNKS = 3; // Need 3 consecutive chunks above threshold

    // Speech detection state
    this.consecutiveSpeechChunks = 0;
    this.consecutiveSilenceChunks = 0;
    this.SILENCE_CONFIRM_CHUNKS = 15; // ~300ms of silence to confirm end of speech

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
    console.log("🎤 Voice:", this.voiceId, "| Silence threshold:", this.SILENCE_THRESHOLD_MS, "ms");

    try {
      this.startSilenceDetection();

      // Small delay for audio stream to stabilize, then greet
      setTimeout(async () => {
        await this.speak(this.greeting);
      }, 1500);
    } catch (error) {
      console.error("❌ Initialization error:", error.message);
      await this.speak("Thank you for calling. Please hold.");
    }
  }

  // ===========================================================================
  // SMART SILENCE DETECTION
  // Waits for caller to completely finish speaking
  // ===========================================================================
  startSilenceDetection() {
    this.silenceTimer = setInterval(async () => {
      const timeSinceLastSpeech = Date.now() - this.lastSpeechTime;
      const hasSufficientAudio = this.audioBuffer.length > 0 && this.hasSpeechInBuffer;
      const speechDuration = this.speechStartTime ? (this.lastSpeechTime - this.speechStartTime) : 0;

      // Debug log every 3 seconds
      if (Date.now() % 3000 < 500) {
        console.log(`🔍 buffer=${this.audioBuffer.length}, silence=${Math.round(timeSinceLastSpeech/1000)}s, hasSpeech=${this.hasSpeechInBuffer}, speaking=${this.isSpeaking}`);
      }

      // Process when:
      // 1. We have audio with speech in it
      // 2. Enough silence has passed (caller stopped talking)
      // 3. Not already processing or speaking
      // 4. Speech was long enough to be meaningful
      if (
        hasSufficientAudio &&
        timeSinceLastSpeech > this.SILENCE_THRESHOLD_MS &&
        !this.isProcessing &&
        !this.isSpeaking &&
        speechDuration > this.MIN_SPEECH_DURATION_MS
      ) {
        console.log(`🎯 Caller finished speaking (${Math.round(speechDuration/1000)}s speech, ${Math.round(timeSinceLastSpeech/1000)}s silence)`);
        await this.processBufferedAudio();
      }
    }, 200); // Check more frequently for responsiveness
  }

  // ===========================================================================
  // AUDIO HANDLING WITH SPEECH DETECTION
  // ===========================================================================
  async handleAudio(payload) {
    if (this.transferredToHuman) return;
    if (this.isSpeaking) return;

    const audioData = Buffer.from(payload, "base64");
    this.audioBuffer.push(audioData);
    this.lastAudioTime = Date.now();

    // Detect speech level
    const audioLevel = this.getAudioLevel(audioData);
    const isSpeech = audioLevel > this.SPEECH_THRESHOLD;

    if (isSpeech) {
      this.consecutiveSpeechChunks++;
      this.consecutiveSilenceChunks = 0;

      // Confirm speech after consecutive chunks (debounce)
      if (this.consecutiveSpeechChunks >= this.SPEECH_CONFIRM_CHUNKS) {
        if (!this.speechStartTime) {
          this.speechStartTime = Date.now();
          console.log("🗣️ Caller started speaking...");
        }
        this.lastSpeechTime = Date.now();
        this.hasSpeechInBuffer = true;
      }
    } else {
      this.consecutiveSilenceChunks++;
      this.consecutiveSpeechChunks = 0;
    }

    // Log occasionally
    if (this.audioBuffer.length % 150 === 0) {
      console.log(`🎤 Buffered: ${this.audioBuffer.length} chunks, level=${audioLevel}, speech=${this.hasSpeechInBuffer}`);
    }
  }

  getAudioLevel(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      // Mulaw: center is around 0x7F/0xFF, deviation = sound
      const sample = audioData[i];
      const deviation = Math.abs(sample - 0x7F);
      sum += deviation;
    }
    return Math.round(sum / audioData.length);
  }

  // ===========================================================================
  // AUDIO PROCESSING
  // ===========================================================================
  async processBufferedAudio() {
    if (this.audioBuffer.length === 0) return;
    if (this.isProcessing) return;

    const combinedAudio = Buffer.concat(this.audioBuffer);
    const chunkCount = this.audioBuffer.length;

    // Reset buffer state
    this.audioBuffer = [];
    this.hasSpeechInBuffer = false;
    this.speechStartTime = null;
    this.consecutiveSpeechChunks = 0;
    this.consecutiveSilenceChunks = 0;

    if (combinedAudio.length < this.MIN_AUDIO_LENGTH) {
      console.log("⚠️ Audio too short, skipping");
      return;
    }

    this.isProcessing = true;
    console.log(`🎤 Processing ${chunkCount} chunks (${combinedAudio.length} bytes)`);

    try {
      const wavBuffer = this.mulawToWav(combinedAudio);
      const tempFile = path.join(os.tmpdir(), `hekax-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, wavBuffer);

      console.log("🎯 Transcribing with Whisper...");
      const transcript = await this.transcribeAudio(tempFile);

      try { fs.unlinkSync(tempFile); } catch (e) {}

      if (transcript && transcript.trim().length > 1) {
        console.log("🎤 Caller:", transcript);
        this.transcript.push({
          role: "user",
          content: transcript,
          timestamp: new Date().toISOString(),
        });
        await this.processUserInput(transcript);
      } else {
        console.log("⚠️ Empty transcript, might be noise");
      }
    } catch (error) {
      console.error("❌ Processing error:", error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  async transcribeAudio(filePath) {
    try {
      const response = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
        language: "en",
        response_format: "text",
      });
      return response;
    } catch (error) {
      console.error("❌ Whisper error:", error.message);
      return null;
    }
  }

  // ===========================================================================
  // CONVERSATION PROCESSING
  // ===========================================================================
  async processUserInput(userText) {
    if (this.isProcessing && this.conversationHistory.length > 0) return;
    this.isProcessing = true;
    this.turnCount++;

    if (this.turnCount > this.maxTurns) {
      await this.speak("Thank you for your time. I'll make sure your information is passed to our team. Have a great day!");
      this.isProcessing = false;
      return;
    }

    try {
      this.conversationHistory.push({ role: "user", content: userText });

      // Extract caller info
      await this.extractCallerInfo(userText);

      // Check for transfer request
      if ((this.callerInfo.wantsHumanAgent || this.wantsHumanTransfer) && !this.transferredToHuman) {
        this.transferredToHuman = true;
        await this.speak("Absolutely, let me connect you with a team member right away. Please hold for just a moment.");

        setTimeout(() => {
          this.transferToHumanWithMusic().catch(err => {
            console.error("❌ Transfer failed:", err.message);
          });
        }, 800);

        this.isProcessing = false;
        return;
      }

      // Generate AI response
      console.log("🧠 Generating response...");
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: this.getSystemPrompt() },
          ...this.conversationHistory,
        ],
        max_tokens: 150,
        temperature: 0.7,
      });

      const aiResponse = response.choices[0].message.content;
      console.log("🤖 AI:", aiResponse);

      this.conversationHistory.push({ role: "assistant", content: aiResponse });
      this.transcript.push({
        role: "assistant",
        content: aiResponse,
        timestamp: new Date().toISOString(),
      });

      await this.speak(aiResponse);
    } catch (error) {
      console.error("❌ Process error:", error.message);
      await this.speak("I apologize, could you please repeat that?");
    } finally {
      this.isProcessing = false;
    }
  }

  async extractCallerInfo(userText) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Extract caller information from the text. Return JSON only:
{
  "name": "extracted name or null",
  "email": "extracted email or null",
  "company": "company name or null",
  "reason": "reason for calling or null",
  "serviceInterest": "which service interests them or null",
  "preferredCallbackTime": "preferred time for callback or null",
  "appointmentDate": "requested appointment date or null",
  "appointmentTime": "requested appointment time or null",
  "urgency": "LOW/MEDIUM/HIGH/CRITICAL based on tone and need, or null",
  "referralSource": "how they heard about us or null",
  "wantsHumanAgent": true or false
}
Rules:
- "wantsHumanAgent": true if caller asks for human, real person, agent, representative, someone, transfer, speak to someone
- Only extract clearly stated information`,
          },
          {
            role: "user",
            content: `Current info: ${JSON.stringify(this.callerInfo)}
Text: "${userText}"`,
          },
        ],
        max_tokens: 150,
        response_format: { type: "json_object" },
      });

      const extracted = JSON.parse(response.choices[0].message.content);

      for (const key of Object.keys(this.callerInfo)) {
        if (extracted[key] !== undefined && extracted[key] !== null && extracted[key] !== "") {
          this.callerInfo[key] = extracted[key];
        }
      }

      if (extracted.wantsHumanAgent === true) {
        this.wantsHumanTransfer = true;
      }

      if (this.callerInfo.name) {
        console.log("📋 Caller identified:", this.callerInfo.name);
      }
    } catch (error) {
      console.error("⚠️ Extraction error:", error.message);
    }
  }

  // ===========================================================================
  // TRANSFER WITH HOLD MUSIC
  // ===========================================================================
  async transferToHumanWithMusic() {
    try {
      console.log("🔁 Transferring to human with hold music...");
      this.transferredToHuman = true;

      const callerId = this.toNumber || process.env.TWILIO_NUMBER;

      // Use Play for hold music while connecting
      await this.twilioClient.calls(this.callSid).update({
        twiml: `
          <Response>
            <Play loop="10">${HOLD_MUSIC_URL}</Play>
            <Dial callerId="${callerId}" timeout="30" action="${process.env.PUBLIC_BASE_URL}/twilio/transfer/status">
              <Client>web-user</Client>
            </Dial>
            <Say voice="Polly.Amy">We're sorry, no one is available right now. Please leave a message after the beep.</Say>
            <Record maxLength="120" transcribe="true" />
          </Response>
        `,
      });

      console.log("✅ Transfer initiated with hold music");
    } catch (err) {
      console.error("❌ Transfer error:", err.message);
      await this.speak("I apologize, I'm having trouble connecting you. Please try calling back in a moment.");
    }
  }

  // Legacy transfer without music
  async transferToHuman() {
    return this.transferToHumanWithMusic();
  }

  // ===========================================================================
  // TEXT-TO-SPEECH
  // ===========================================================================
  async speak(text) {
    try {
      console.log("🔊 Speaking:", text.substring(0, 60) + (text.length > 60 ? "..." : ""));
      this.isSpeaking = true;

      // Reset speech detection for fresh listening after AI speaks
      this.lastSpeechTime = Date.now();
      this.speechStartTime = null;
      this.hasSpeechInBuffer = false;

      const safetyTimeout = setTimeout(() => {
        if (this.isSpeaking) {
          console.log("⚠️ Speaking timeout, resetting");
          this.isSpeaking = false;
        }
      }, 20000);

      const audioBuffer = await this.textToSpeech(text);
      if (audioBuffer) {
        await this.sendAudioToTwilio(audioBuffer);
      }

      clearTimeout(safetyTimeout);
    } catch (error) {
      console.error("❌ Speak error:", error);
    } finally {
      // Brief pause before listening again
      setTimeout(() => {
        this.isSpeaking = false;
        this.lastSpeechTime = Date.now(); // Reset so we wait for new speech
        console.log("🎤 Listening...");
      }, 300);
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

  // ===========================================================================
  // MULAW TO WAV CONVERSION
  // ===========================================================================
  mulawToWav(mulawBuffer) {
    const sampleRate = 8000;
    const numChannels = 1;
    const bitsPerSample = 16;

    const pcmSamples = new Int16Array(mulawBuffer.length);
    for (let i = 0; i < mulawBuffer.length; i++) {
      pcmSamples[i] = this.mulawDecode(mulawBuffer[i]);
    }

    const wavHeader = Buffer.alloc(44);
    const dataSize = pcmSamples.length * 2;
    const fileSize = dataSize + 36;

    wavHeader.write("RIFF", 0);
    wavHeader.writeUInt32LE(fileSize, 4);
    wavHeader.write("WAVE", 8);
    wavHeader.write("fmt ", 12);
    wavHeader.writeUInt32LE(16, 16);
    wavHeader.writeUInt16LE(1, 20);
    wavHeader.writeUInt16LE(numChannels, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
    wavHeader.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
    wavHeader.writeUInt16LE(bitsPerSample, 34);
    wavHeader.write("data", 36);
    wavHeader.writeUInt32LE(dataSize, 40);

    const pcmBuffer = Buffer.from(pcmSamples.buffer);
    return Buffer.concat([wavHeader, pcmBuffer]);
  }

  mulawDecode(mulawByte) {
    mulawByte = ~mulawByte & 0xFF;
    const sign = (mulawByte & 0x80) ? -1 : 1;
    const exponent = (mulawByte >> 4) & 0x07;
    const mantissa = mulawByte & 0x0F;
    let sample = (mantissa << (exponent + 3)) + (1 << (exponent + 3)) - 132;
    return Math.max(-32768, Math.min(32767, sign * sample));
  }

  handleMark(mark) {
    // TTS mark handling
  }

  // ===========================================================================
  // SYSTEM PROMPT
  // ===========================================================================
  getSystemPrompt() {
    return `You are the professional AI receptionist for ${this.orgName}.

VOICE PERSONA:
- Warm, confident, and genuinely helpful
- Speak naturally like a skilled human receptionist
- Use conversational language, not robotic phrases
- Show empathy and understanding

RESPONSE RULES:
- Keep responses to 1-2 SHORT sentences maximum
- Never use more than 30 words per response
- Ask ONE question at a time
- Use the caller's name once you know it
- Never use emojis, asterisks, or special characters
- Never say "I'm an AI" - just be helpful

CONVERSATION FLOW:
1. If you don't have their name, ask for it naturally
2. Understand their reason for calling
3. Gather relevant details (appointments, contact info)
4. Offer to transfer to a human if they ask or seem frustrated
5. End calls warmly

CURRENT CALLER:
- Phone: ${this.callerInfo.phone || "Unknown"}
- Name: ${this.callerInfo.name || "Not yet provided"}
- Company: ${this.callerInfo.company || "Not mentioned"}
- Reason: ${this.callerInfo.reason || "Not yet stated"}
- Call Duration: ${Math.round((Date.now() - this.callStartTime) / 1000)}s

TRANSFER TRIGGERS:
If caller says any of: "speak to someone", "real person", "human", "transfer", "representative", "agent" - immediately agree to transfer them.`;
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
    console.log("🧹 Cleaning up call...");

    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
    }

    if (this.audioBuffer.length > 0 && !this.isProcessing && this.hasSpeechInBuffer) {
      await this.processBufferedAudio();
    }

    const callDuration = Math.round((Date.now() - this.callStartTime) / 1000);
    console.log(`📞 Call duration: ${callDuration}s, Turns: ${this.turnCount}`);

    if (this.transcript.length > 0) {
      try {
        const summary = await this.generateSummary();
        console.log("📝 Summary:", summary);

        await this.prisma.callLog.upsert({
          where: { callSid: this.callSid },
          update: {
            handledByAI: true,
            transferredToHuman: this.transferredToHuman,
            duration: callDuration,
            organizationId: this.organization?.id,
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

        await this.prisma.transcript.create({
          data: {
            callSid: this.callSid,
            fullText: this.transcript.map(t => `${t.role}: ${t.content}`).join("\n"),
            messages: this.transcript,
            summary,
            organizationId: this.organization?.id,
          },
        });

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

        console.log("✅ Call data saved");
      } catch (err) {
        console.error("❌ Save error:", err.message);
      }
    }

    console.log("🧹 Cleanup complete");
  }
}

module.exports = { AIReceptionist, VOICE_OPTIONS, DEFAULT_VOICE };
