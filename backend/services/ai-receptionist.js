// ============================================================================
// HEKAX Phone - AI Receptionist Service
// Phase 6.6: OpenAI STT + TTS Stack (Cost Optimized)
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
  nova: { name: "Nova", description: "Calm & professional" },      // DEFAULT
  sage: { name: "Sage", description: "Warm & wise" },
  alloy: { name: "Alloy", description: "Neutral & balanced" },
  echo: { name: "Echo", description: "Friendly & warm" },
  onyx: { name: "Onyx", description: "Deep & authoritative" },
  shimmer: { name: "Shimmer", description: "Soft & gentle" },
};

const DEFAULT_VOICE = "nova";

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
    this.orgName = organization?.name || "HEKAX";
    this.greeting = organization?.greeting || "Thank you for calling. May I have your name please?";
    this.customParameters = customParameters || {};

    // Voice selection - use org's voice or default to nova
    this.voiceId = organization?.voiceId || DEFAULT_VOICE;
    // Validate voice exists
    if (!VOICE_OPTIONS[this.voiceId]) {
      this.voiceId = DEFAULT_VOICE;
    }

    // State
    this.cleanedUp = false;
    this.transferredToHuman = false;
    this.turnCount = 0;
    this.maxTurns = 20;
    this.isProcessing = false;
    this.isSpeaking = false;
    this.wantsHumanTransfer = false;

    // Audio buffer for STT
    this.audioBuffer = [];
    this.silenceTimer = null;
    this.lastAudioTime = Date.now();
    this.SILENCE_THRESHOLD_MS = 1500; // 1.5 seconds of silence = end of speech
    this.MIN_AUDIO_LENGTH = 3200; // Minimum ~0.2 seconds of audio to process

    // Conversation history
    this.conversationHistory = [];
    this.transcript = [];

    // Caller information extracted from conversation
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

    // Services - OpenAI only now
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  async initialize() {
    console.log("🤖 Initializing AI Receptionist for:", this.orgName);
    console.log("🎤 Using OpenAI STT + TTS (voice:", this.voiceId, ")");

    try {
      // Start silence detection loop
      this.startSilenceDetection();

      // Delay greeting slightly for better audio quality
      setTimeout(async () => {
        await this.speak(this.greeting);
      }, 2000);
    } catch (error) {
      console.error("❌ Failed to initialize:", error.message);
      await this.speak("Thank you for calling. Please hold.");
    }
  }

  // ===========================================================================
  // OPENAI STT - Collect audio and transcribe on silence
  // ===========================================================================

  startSilenceDetection() {
    // Check every 500ms if we have audio to process
    this.silenceTimer = setInterval(async () => {
      const timeSinceLastAudio = Date.now() - this.lastAudioTime;

      // Debug log every 5 seconds
      if (Date.now() % 5000 < 500) {
        console.log(`🔍 Status: buffer=${this.audioBuffer.length}, silence=${Math.round(timeSinceLastAudio/1000)}s, processing=${this.isProcessing}, speaking=${this.isSpeaking}`);
      }

      // If we have audio buffered and enough silence has passed
      if (
        this.audioBuffer.length > 0 &&
        timeSinceLastAudio > this.SILENCE_THRESHOLD_MS &&
        !this.isProcessing &&
        !this.isSpeaking
      ) {
        console.log("🎯 Silence detected, processing audio...");
        await this.processBufferedAudio();
      }
    }, 500);
  }

  async handleAudio(payload) {
    if (this.transferredToHuman) return;
    if (this.isSpeaking) return; // Don't record while AI is speaking

    // Buffer the audio
    const audioData = Buffer.from(payload, "base64");
    this.audioBuffer.push(audioData);
    this.lastAudioTime = Date.now();

    // Log occasionally to confirm audio is being received
    if (this.audioBuffer.length % 100 === 0) {
      console.log(`🎤 Audio buffered: ${this.audioBuffer.length} chunks (${Math.round(this.audioBuffer.length * 20 / 1000)}s)`);
    }
  }

  async processBufferedAudio() {
    if (this.audioBuffer.length === 0) return;
    if (this.isProcessing) return;

    // Combine all audio chunks
    const combinedAudio = Buffer.concat(this.audioBuffer);
    const audioLength = this.audioBuffer.length;
    this.audioBuffer = []; // Clear buffer

    console.log(`🎤 Processing ${audioLength} audio chunks (${combinedAudio.length} bytes)`);

    // Skip if too short (likely just noise)
    if (combinedAudio.length < this.MIN_AUDIO_LENGTH) {
      console.log("⚠️ Audio too short, skipping");
      return;
    }

    this.isProcessing = true;

    try {
      // Convert mulaw 8kHz to WAV for OpenAI
      const wavBuffer = this.mulawToWav(combinedAudio);
      console.log(`🔄 Converted to WAV: ${wavBuffer.length} bytes`);

      // Write to temp file (OpenAI SDK needs a file)
      const tempFile = path.join(os.tmpdir(), `hekax-audio-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, wavBuffer);

      // Transcribe with OpenAI Whisper
      console.log("🎯 Sending to Whisper for transcription...");
      const transcript = await this.transcribeAudio(tempFile);

      // Clean up temp file
      try { fs.unlinkSync(tempFile); } catch (e) {}

      if (transcript && transcript.trim().length > 0) {
        console.log("🎤 Caller said:", transcript);
        this.transcript.push({
          role: "user",
          content: transcript,
          timestamp: new Date().toISOString(),
        });
        await this.processUserInput(transcript);
      } else {
        console.log("⚠️ Whisper returned empty transcript");
      }
    } catch (error) {
      console.error("❌ Audio processing error:", error.message);
      console.error(error.stack);
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
      console.error("❌ Transcription error:", error.message);
      return null;
    }
  }

  // Convert mulaw 8kHz to WAV format
  mulawToWav(mulawBuffer) {
    const sampleRate = 8000;
    const numChannels = 1;
    const bitsPerSample = 16;

    // Decode mulaw to PCM
    const pcmSamples = new Int16Array(mulawBuffer.length);
    for (let i = 0; i < mulawBuffer.length; i++) {
      pcmSamples[i] = this.mulawDecode(mulawBuffer[i]);
    }

    // Create WAV header
    const wavHeader = Buffer.alloc(44);
    const dataSize = pcmSamples.length * 2;
    const fileSize = dataSize + 36;

    // RIFF header
    wavHeader.write("RIFF", 0);
    wavHeader.writeUInt32LE(fileSize, 4);
    wavHeader.write("WAVE", 8);

    // fmt chunk
    wavHeader.write("fmt ", 12);
    wavHeader.writeUInt32LE(16, 16); // chunk size
    wavHeader.writeUInt16LE(1, 20); // PCM format
    wavHeader.writeUInt16LE(numChannels, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
    wavHeader.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
    wavHeader.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    wavHeader.write("data", 36);
    wavHeader.writeUInt32LE(dataSize, 40);

    // Combine header and PCM data
    const pcmBuffer = Buffer.from(pcmSamples.buffer);
    return Buffer.concat([wavHeader, pcmBuffer]);
  }

  // Mulaw decode lookup table
  mulawDecode(mulawByte) {
    // Invert bits
    mulawByte = ~mulawByte & 0xFF;
    
    const sign = (mulawByte & 0x80) ? -1 : 1;
    const exponent = (mulawByte >> 4) & 0x07;
    const mantissa = mulawByte & 0x0F;
    
    let sample = (mantissa << (exponent + 3)) + (1 << (exponent + 3)) - 132;
    sample = sign * sample;
    
    return Math.max(-32768, Math.min(32767, sample));
  }

  async processUserInput(userText) {
    if (this.isProcessing && this.conversationHistory.length > 0) return;
    this.isProcessing = true;
    this.turnCount++;

    if (this.turnCount > this.maxTurns) {
      await this.speak("Thank you for your time. I'll pass your details to the team.");
      this.isProcessing = false;
      return;
    }

    // Small delay for natural conversation flow
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      this.conversationHistory.push({ role: "user", content: userText });

      // Extract caller information
      await this.extractCallerInfo(userText);

      // Check if human transfer requested
      if ((this.callerInfo.wantsHumanAgent || this.wantsHumanTransfer) && !this.transferredToHuman) {
        this.transferredToHuman = true;
        await this.speak("Of course, let me transfer you to one of our team members. Please hold.");
        
        setTimeout(() => {
          this.transferToHuman().catch(err => {
            console.error("❌ Transfer failed:", err.message);
          });
        }, 1200);
        
        this.isProcessing = false;
        return;
      }

      // Generate AI response
      console.log("🧠 Generating response...");
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // Using mini for cost efficiency
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
      await this.speak("I'm sorry, could you repeat that?");
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
- "wantsHumanAgent": true if caller asks to speak to a human, real person, agent, or be transferred
- Only extract information that is clearly stated`,
          },
          {
            role: "user",
            content: `Current info: ${JSON.stringify(this.callerInfo)}
Text: "${userText}"
Extract any new information:`,
          },
        ],
        max_tokens: 150,
        response_format: { type: "json_object" },
      });

      const extracted = JSON.parse(response.choices[0].message.content);
      
      // Update caller info with extracted data
      for (const key of Object.keys(this.callerInfo)) {
        if (extracted[key] !== undefined && extracted[key] !== null && extracted[key] !== "") {
          this.callerInfo[key] = extracted[key];
        }
      }

      if (extracted.wantsHumanAgent === true) {
        this.wantsHumanTransfer = true;
      }

      console.log("📋 Caller info updated:", this.callerInfo.name || "Unknown");
    } catch (error) {
      console.error("⚠️ Info extraction error:", error.message);
    }
  }

  async transferToHuman() {
    try {
      console.log("🔁 Transferring to human agent...");
      this.transferredToHuman = true;

      const callerId = this.toNumber || process.env.TWILIO_NUMBER;

      await this.twilioClient.calls(this.callSid).update({
        twiml: `
          <Response>
            <Dial callerId="${callerId}">
              <Client>ahmed-web</Client>
            </Dial>
          </Response>
        `,
      });
    } catch (err) {
      console.error("❌ Transfer failed:", err.message);
      await this.speak("I'm sorry, something went wrong. Please call back.");
    }
  }

  async speak(text) {
    try {
      console.log("🔊 Speaking:", text.substring(0, 50) + "...");
      this.isSpeaking = true;

      // Safety timeout - never stay in speaking mode for more than 30 seconds
      const safetyTimeout = setTimeout(() => {
        if (this.isSpeaking) {
          console.log("⚠️ Speaking safety timeout triggered");
          this.isSpeaking = false;
        }
      }, 30000);

      const audioBuffer = await this.textToSpeech(text);
      if (audioBuffer) {
        console.log(`🔊 Sending ${audioBuffer.length} bytes of audio to Twilio`);
        await this.sendAudioToTwilio(audioBuffer);
      } else {
        console.log("⚠️ No audio buffer generated from TTS");
      }

      clearTimeout(safetyTimeout);
    } catch (error) {
      console.error("❌ Speak error:", error);
    } finally {
      // Add small delay before allowing audio capture again
      setTimeout(() => {
        this.isSpeaking = false;
        console.log("🎤 Ready to listen again");
      }, 500);
    }
  }

  // ===========================================================================
  // OPENAI TTS
  // ===========================================================================
  async textToSpeech(text) {
    try {
      // Use OpenAI TTS
      const mp3Response = await this.openai.audio.speech.create({
        model: "tts-1", // Use tts-1 for speed, tts-1-hd for quality
        voice: this.voiceId,
        input: text,
        response_format: "pcm", // Raw PCM for easier conversion
      });

      // Get the audio data
      const arrayBuffer = await mp3Response.arrayBuffer();
      const pcmBuffer = Buffer.from(arrayBuffer);

      // Convert PCM (24kHz, 16-bit) to mulaw (8kHz) for Twilio
      const mulawBuffer = this.pcmToMulaw(pcmBuffer);

      return mulawBuffer;
    } catch (error) {
      console.error("❌ OpenAI TTS error:", error.message);
      return null;
    }
  }

  // Convert PCM 24kHz 16-bit to mulaw 8kHz for Twilio
  pcmToMulaw(pcmBuffer) {
    // OpenAI PCM is 24kHz, 16-bit mono
    // Twilio expects 8kHz mulaw
    // We need to: 1) Downsample 24kHz -> 8kHz (factor of 3), 2) Convert to mulaw

    const inputSamples = new Int16Array(
      pcmBuffer.buffer, 
      pcmBuffer.byteOffset, 
      Math.floor(pcmBuffer.length / 2)
    );
    const outputLength = Math.floor(inputSamples.length / 3); // Downsample by 3
    const mulawOutput = Buffer.alloc(outputLength);

    for (let i = 0; i < outputLength; i++) {
      // Simple downsampling: take every 3rd sample
      const sample = inputSamples[i * 3];
      mulawOutput[i] = this.linearToMulaw(sample);
    }

    return mulawOutput;
  }

  // Linear PCM to mulaw encoding
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

  // ===========================================================================
  // DEPRECATED: ElevenLabs TTS (kept commented for future premium voice support)
  // ===========================================================================
  /*
  async textToSpeechElevenLabs(text) {
    try {
      const voiceId = this.organization?.elevenlabsVoiceId || 
        process.env.ELEVENLABS_VOICE_ID || 
        "21m00Tcm4TlvDq8ikWAM";

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      );

      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.error("❌ ElevenLabs TTS error:", error);
      return null;
    }
  }
  */

  // ===========================================================================
  // DEPRECATED: Deepgram STT (kept commented for future BYO keys support)
  // ===========================================================================
  /*
  async initializeDeepgram() {
    console.log("🎤 Connecting to Deepgram...");

    const apiKey = process.env.DEEPGRAM_API_KEY;
    const url =
      "wss://api.deepgram.com/v1/listen" +
      "?model=nova-3" +
      "&encoding=mulaw" +
      "&sample_rate=8000" +
      "&channels=1" +
      "&interim_results=true" +
      "&endpointing=600" +
      "&utterance_end_ms=1200" +
      "&vad_events=true" +
      "&smart_format=true";

    return new Promise((resolve, reject) => {
      this.deepgramWs = new WebSocket(url, {
        headers: { Authorization: `Token ${apiKey}` },
      });

      this.deepgramWs.on("open", () => {
        console.log("✅ Deepgram connected");
        resolve();
      });

      this.deepgramWs.on("message", async (data) => {
        try {
          const response = JSON.parse(data.toString());
          const transcript = response.channel?.alternatives?.[0]?.transcript;
          const isFinal = response.is_final || response.speech_final;

          if (transcript && transcript.trim() && isFinal && !this.isProcessing) {
            console.log("🎤 Caller said:", transcript);
            this.transcript.push({
              role: "user",
              content: transcript,
              timestamp: new Date().toISOString(),
            });
            await this.processUserInput(transcript);
          }
        } catch (e) {
          // Ignore parse errors
        }
      });

      this.deepgramWs.on("error", (err) => {
        console.error("❌ Deepgram error:", err.message);
        reject(err);
      });

      this.deepgramWs.on("close", (code) => {
        console.log("📴 Deepgram closed:", code);
      });

      setTimeout(() => {
        if (this.deepgramWs?.readyState !== WebSocket.OPEN) {
          reject(new Error("Deepgram connection timeout"));
        }
      }, 5000);
    });
  }
  */

  async sendAudioToTwilio(audioBuffer) {
    const chunkSize = 160; // 20ms of 8kHz mulaw audio
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      const chunk = audioBuffer.slice(i, Math.min(i + chunkSize, audioBuffer.length));
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          event: "media",
          streamSid: this.streamSid,
          media: { payload: chunk.toString("base64") },
        }));
      }
      // Small delay to prevent buffer overflow
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }

  handleMark(mark) {
    // Handle TTS completion marks if needed
  }

  getSystemPrompt() {
    return `You are the AI receptionist for ${this.orgName}.

PERSONALITY:
- Warm, professional, and efficient
- Speak naturally like a skilled human receptionist
- Keep responses to 1-2 sentences maximum

TASKS:
1. Greet callers warmly
2. Get their name if not provided
3. Understand why they're calling
4. Collect relevant details (appointment times, contact info)
5. Offer to transfer to a human if requested
6. End calls professionally

CURRENT CALLER INFO:
- Phone: ${this.callerInfo.phone || "Unknown"}
- Name: ${this.callerInfo.name || "Not yet provided"}
- Company: ${this.callerInfo.company || "Not mentioned"}
- Email: ${this.callerInfo.email || "Not provided"}
- Reason: ${this.callerInfo.reason || "Not yet stated"}

RULES:
- Never use emojis or markdown
- Ask ONE question at a time
- If caller wants a human, say you'll transfer them
- If caller says goodbye, wish them well and end professionally`;
  }

  async generateSummary() {
    if (this.transcript.length < 2) return "Brief call - no significant conversation";

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Summarize this call in 1-2 sentences. Focus on: who called, why, and outcome.",
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
      console.error("⚠️ Summary error:", error.message);
      return "Summary unavailable";
    }
  }

  async cleanup() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    console.log("🧹 Cleaning up...");

    // Stop silence detection
    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
    }

    // Process any remaining audio
    if (this.audioBuffer.length > 0 && !this.isProcessing) {
      await this.processBufferedAudio();
    }

    if (this.transcript.length > 0) {
      try {
        const summary = await this.generateSummary();
        console.log("📝 Summary:", summary);

        // Update or create CallLog
        await this.prisma.callLog.upsert({
          where: { callSid: this.callSid },
          update: {
            handledByAI: true,
            transferredToHuman: this.transferredToHuman,
            organizationId: this.organization?.id,
          },
          create: {
            callSid: this.callSid,
            direction: "INBOUND",
            fromNumber: this.callerInfo.phone || "Unknown",
            toNumber: this.toNumber || "Unknown",
            status: "COMPLETED",
            handledByAI: true,
            transferredToHuman: this.transferredToHuman,
            organizationId: this.organization?.id,
          },
        });

        // Save Transcript
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

        // Save Lead if we have useful info
        if (this.callerInfo.name || this.callerInfo.reason) {
          await this.prisma.lead.create({
            data: {
              callSid: this.callSid,
              name: this.callerInfo.name || "Unknown",
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
          console.log("✅ Lead saved:", this.callerInfo.name);
        }
      } catch (err) {
        console.error("❌ Cleanup save error:", err.message);
      }
    }

    console.log("🧹 Cleanup complete");
  }
}

module.exports = { AIReceptionist, VOICE_OPTIONS, DEFAULT_VOICE };
