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

    // DYNAMIC speech threshold - will be calibrated based on background noise
    this.SPEECH_THRESHOLD = 50; // Starting threshold, will adjust dynamically
    this.baselineNoiseLevel = 0; // Calibrated background noise level
    this.calibrationSamples = []; // Samples for calibration
    this.isCalibrated = false;
    this.CALIBRATION_FRAMES = 20; // ~0.4 seconds to calibrate
    this.SPEECH_MARGIN = 15; // How much above baseline to consider speech

    this.SPEECH_CONFIRM_CHUNKS = 3; // Need 3 consecutive chunks above threshold to start

    // Speech detection state
    this.consecutiveSpeechChunks = 0;
    this.consecutiveSilenceChunks = 0;
    this.SILENCE_CONFIRM_CHUNKS = 25; // ~0.5 seconds of silence to confirm end of speech (was 40)
    this.inSpeechSegment = false; // Track if we're currently in a speech segment

    // Audio level tracking for debugging
    this.recentLevels = [];

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
      const hasAudio = this.audioBuffer.length > 0;
      const speechDuration = this.speechStartTime ? (this.lastSpeechTime - this.speechStartTime) : 0;

      // Debug log every 2 seconds
      if (Date.now() % 2000 < 250) {
        console.log(`🔍 buffer=${this.audioBuffer.length}, silence=${Math.round(timeSinceLastSpeech/1000)}s, hasSpeech=${this.hasSpeechInBuffer}, inSpeech=${this.inSpeechSegment}, speaking=${this.isSpeaking}, processing=${this.isProcessing}`);
      }

      // Process when:
      // 1. We have audio in buffer
      // 2. We detected speech at some point (hasSpeechInBuffer)
      // 3. Enough silence has passed (caller stopped talking)
      // 4. Not currently in a speech segment
      // 5. Not already processing or speaking
      if (
        hasAudio &&
        this.hasSpeechInBuffer &&
        timeSinceLastSpeech > this.SILENCE_THRESHOLD_MS &&
        !this.inSpeechSegment &&
        !this.isProcessing &&
        !this.isSpeaking
      ) {
        console.log(`🎯 Processing: ${this.audioBuffer.length} chunks, ${Math.round(speechDuration/1000)}s speech, ${Math.round(timeSinceLastSpeech/1000)}s silence`);
        await this.processBufferedAudio();
      }
    }, 150); // Check frequently for responsiveness
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

    // Dynamic calibration: learn the baseline noise level from first few frames
    if (!this.isCalibrated) {
      this.calibrationSamples.push(audioLevel);
      if (this.calibrationSamples.length >= this.CALIBRATION_FRAMES) {
        // Use the median of samples as baseline (more robust than average)
        const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
        this.baselineNoiseLevel = sorted[Math.floor(sorted.length / 2)];
        // Set threshold above baseline
        this.SPEECH_THRESHOLD = this.baselineNoiseLevel + this.SPEECH_MARGIN;
        this.isCalibrated = true;
        console.log(`🎚️ Calibrated: baseline=${this.baselineNoiseLevel}, threshold=${this.SPEECH_THRESHOLD}`);
      }
      return; // Don't process during calibration
    }

    // Speech is when level is significantly above baseline
    const isSpeech = audioLevel > this.SPEECH_THRESHOLD;

    // Track recent levels for debugging
    this.recentLevels.push(audioLevel);
    if (this.recentLevels.length > 50) this.recentLevels.shift();

    if (isSpeech) {
      this.consecutiveSpeechChunks++;
      this.consecutiveSilenceChunks = 0;

      // Confirm speech after consecutive chunks (debounce)
      if (this.consecutiveSpeechChunks >= this.SPEECH_CONFIRM_CHUNKS) {
        if (!this.inSpeechSegment) {
          this.inSpeechSegment = true;
          this.speechStartTime = Date.now();
          console.log(`🗣️ Caller started speaking (level=${audioLevel}, threshold=${this.SPEECH_THRESHOLD})`);
        }
        this.lastSpeechTime = Date.now();
        this.hasSpeechInBuffer = true;
      }
    } else {
      this.consecutiveSilenceChunks++;
      this.consecutiveSpeechChunks = 0;

      // Only mark end of speech after sustained silence
      if (this.inSpeechSegment && this.consecutiveSilenceChunks >= this.SILENCE_CONFIRM_CHUNKS) {
        console.log(`🔇 Caller stopped speaking (silentChunks=${this.consecutiveSilenceChunks}, level=${audioLevel})`);
        this.inSpeechSegment = false;
      }
    }

    // Log every 100 chunks for debugging
    if (this.audioBuffer.length % 100 === 0) {
      const silenceMs = Date.now() - this.lastSpeechTime;
      console.log(`🎤 buffer=${this.audioBuffer.length}, level=${audioLevel}, thresh=${this.SPEECH_THRESHOLD}, inSpeech=${this.inSpeechSegment}, silence=${(silenceMs/1000).toFixed(1)}s`);
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
    const durationSec = (chunkCount * 20) / 1000; // Each chunk ~20ms

    console.log(`🎯 Processing audio: ${chunkCount} chunks, ${combinedAudio.length} bytes, ~${durationSec.toFixed(1)}s`);

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
  // CONVERSATION PROCESSING (JSON-based)
  // ===========================================================================
  async processUserInput(userText) {
    this.turnCount++;

    if (this.turnCount > this.maxTurns) {
      await this.speak("Thank you for your time. I'll make sure your information is passed to our team. Have a great day!");
      return;
    }

    try {
      // Add user message to history (just the text, not JSON)
      this.conversationHistory.push({ role: "user", content: userText });

      // Generate AI response with JSON format
      console.log("🧠 Generating response...");
      const response = await this.openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: this.getSystemPrompt() },
          ...this.conversationHistory,
        ],
        max_completion_tokens: 250,
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
        // Fallback: treat raw content as plain reply
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

      // Add only the reply to conversation history (not the full JSON)
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

        setTimeout(() => {
          this.transferToHumanWithMusic().catch(err => {
            console.error("❌ Transfer failed:", err.message);
          });
        }, 800);
        return;
      }

      // Handle end call
      if (aiJson.end_call) {
        await this.speak(reply);
        console.log("📞 AI decided to end call");
        return;
      }

      // Normal response
      await this.speak(reply);
    } catch (error) {
      console.error("❌ Process error:", error.message);
      await this.speak("I apologize, could you please repeat that?");
    }
  }

  // ===========================================================================
  // APPLY AI RESULT TO CALLER INFO
  // ===========================================================================
  applyAIResult(aiJson) {
    // Map slots to callerInfo
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

    // Set urgency if provided
    if (aiJson.urgency && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(aiJson.urgency)) {
      this.callerInfo.urgency = aiJson.urgency;
    }

    // Set human transfer flag
    if (aiJson.needs_human === true) {
      this.wantsHumanTransfer = true;
      this.callerInfo.wantsHumanAgent = true;
      console.log("🙋 Caller wants human transfer");
    }

    // Log if we identified the caller
    if (this.callerInfo.name) {
      console.log("📋 Caller identified:", this.callerInfo.name);
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

      // Clear buffer and reset speech detection before speaking
      this.audioBuffer = [];
      this.speechStartTime = null;
      this.hasSpeechInBuffer = false;
      this.inSpeechSegment = false;
      this.consecutiveSpeechChunks = 0;
      this.consecutiveSilenceChunks = 0;

      const audioBuffer = await this.textToSpeech(text);
      if (audioBuffer) {
        await this.sendAudioToTwilio(audioBuffer);
      }

      // Reset speaking flag IMMEDIATELY after sending audio
      // The sendAudioToTwilio function blocks until all audio is sent
      this.isSpeaking = false;
      this.lastSpeechTime = Date.now(); // Reset timer for new speech detection
      this.audioBuffer = []; // Clear any audio that came during speaking
      console.log("🎤 Listening...");
    } catch (error) {
      console.error("❌ Speak error:", error);
      this.isSpeaking = false;
      this.lastSpeechTime = Date.now();
      this.audioBuffer = [];
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
        model: "gpt-5-mini",
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
        max_completion_tokens: 100,
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

    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
    }

    if (this.audioBuffer.length > 0 && !this.isProcessing && this.hasSpeechInBuffer) {
      await this.processBufferedAudio();
    }

    const callDuration = Math.round((Date.now() - this.callStartTime) / 1000);
    console.log(`📞 Call duration: ${callDuration}s, Turns: ${this.turnCount}, Transcript entries: ${this.transcript.length}`);

    // Always save call log, even if no transcript
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

    // Save transcript if we have conversation data
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
      console.log("⚠️ No transcript to save (call may have ended before conversation)");
    }

    console.log("🧹 Cleanup complete");
  }
}

module.exports = { AIReceptionist, VOICE_OPTIONS, DEFAULT_VOICE };
