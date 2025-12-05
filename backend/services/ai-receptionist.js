// ============================================================================
// HEKAX Phone - AI Receptionist Service v3.0
// Enterprise-Grade Voice AI with Barge-In, Orchestration & Function Calling
// ============================================================================

require("dotenv").config();
const OpenAI = require("openai");
const WebSocket = require("ws");
const twilio = require("twilio");
const EventEmitter = require("events");
const { CalendarService } = require("./calendar");
const { CRMService } = require("./crm");

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

// ============================================================================
// CONVERSATION STATES (State Machine)
// ============================================================================
const ConversationState = {
  IDLE: "IDLE",
  GREETING: "GREETING",
  LISTENING: "LISTENING",
  PROCESSING: "PROCESSING",
  SPEAKING: "SPEAKING",
  GATHERING_INFO: "GATHERING_INFO",
  BOOKING_APPOINTMENT: "BOOKING_APPOINTMENT",
  LOOKING_UP_CUSTOMER: "LOOKING_UP_CUSTOMER",
  TRANSFERRING: "TRANSFERRING",
  VOICEMAIL: "VOICEMAIL",
  ENDING: "ENDING",
  ENDED: "ENDED",
};

// ============================================================================
// FUNCTION DEFINITIONS FOR AI
// ============================================================================
const AI_FUNCTIONS = [
  {
    name: "transfer_to_human",
    description: "Transfer the caller to a human agent. Use when caller explicitly requests to speak with a person, agent, or representative.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief reason for the transfer",
        },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Urgency level of the transfer",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "book_appointment",
    description: "Book an appointment for the caller. Use when caller wants to schedule a meeting or appointment.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Preferred date (e.g., 'tomorrow', 'next Monday', '2024-01-15')",
        },
        time: {
          type: "string",
          description: "Preferred time (e.g., '2pm', '14:00', 'morning')",
        },
        purpose: {
          type: "string",
          description: "Purpose of the appointment",
        },
        duration: {
          type: "number",
          description: "Duration in minutes (default: 30)",
        },
      },
      required: ["purpose"],
    },
  },
  {
    name: "lookup_customer",
    description: "Look up customer information by phone number or name. Use to personalize the conversation.",
    parameters: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: "Phone number to look up",
        },
        name: {
          type: "string",
          description: "Customer name to search",
        },
      },
    },
  },
  {
    name: "send_webhook",
    description: "Send event data to external system. Use for custom integrations.",
    parameters: {
      type: "object",
      properties: {
        event_type: {
          type: "string",
          enum: ["lead_captured", "appointment_requested", "callback_requested", "complaint", "urgent_issue"],
          description: "Type of event to send",
        },
        data: {
          type: "object",
          description: "Additional data to include",
        },
      },
      required: ["event_type"],
    },
  },
  {
    name: "end_call",
    description: "End the call gracefully. Use when conversation is complete or caller says goodbye.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Reason for ending the call",
        },
        follow_up_required: {
          type: "boolean",
          description: "Whether a follow-up is needed",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "collect_info",
    description: "Mark that specific information has been collected from the caller.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Caller's name" },
        email: { type: "string", description: "Caller's email" },
        company: { type: "string", description: "Caller's company" },
        reason: { type: "string", description: "Reason for calling" },
        service_interest: { type: "string", description: "Service they're interested in" },
        callback_time: { type: "string", description: "Preferred callback time" },
      },
    },
  },
];

// ============================================================================
// AI RECEPTIONIST CLASS
// ============================================================================
class AIReceptionist extends EventEmitter {
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
    super();

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
    this.state = ConversationState.IDLE;
    this.previousState = null;
    this.cleanedUp = false;
    this.transferredToHuman = false;
    this.turnCount = 0;
    this.maxTurns = 50;
    this.callStartTime = Date.now();

    // =========================================================================
    // BARGE-IN CONTROL
    // =========================================================================
    this.isSpeaking = false;
    this.isProcessing = false;
    this.currentAudioChunks = [];
    this.audioMarkId = 0;
    this.pendingMarks = new Map();
    this.bargeInEnabled = true;
    this.bargeInTriggered = false;
    this.interruptedText = "";
    this.speechStartedDuringSpeaking = false;

    // =========================================================================
    // DEEPGRAM STREAMING STT
    // =========================================================================
    this.deepgramWs = null;
    this.deepgramReady = false;
    this.currentUtterance = "";
    this.lastFinalTranscript = "";
    this.transcriptBuffer = [];

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
      sentiment: "neutral",
      isReturningCustomer: false,
      customerRecord: null,
    };

    // =========================================================================
    // ORCHESTRATION
    // =========================================================================
    this.pendingActions = [];
    this.completedActions = [];
    this.webhookQueue = [];

    // =========================================================================
    // API CLIENTS
    // =========================================================================
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.calendarService = new CalendarService(prisma);
    this.crmService = new CRMService(prisma);
  }

  // ===========================================================================
  // STATE MACHINE
  // ===========================================================================
  setState(newState) {
    if (this.state !== newState) {
      console.log(`🔄 State: ${this.state} → ${newState}`);
      this.previousState = this.state;
      this.state = newState;
      this.emit("stateChange", { from: this.previousState, to: newState });
    }
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  async initialize() {
    console.log("🤖 Initializing AI Receptionist v3.0 for:", this.orgName);
    console.log("🎤 Voice:", this.voiceId, "| Barge-in: ENABLED | Functions: ENABLED");
    this.setState(ConversationState.GREETING);

    try {
      // Connect to Deepgram streaming STT
      await this.connectToDeepgram();

      // Look up customer by phone number
      await this.lookupCustomerByPhone();

      // Personalized greeting if returning customer
      let greetingText = this.greeting;
      if (this.callerInfo.isReturningCustomer && this.callerInfo.name) {
        greetingText = `Welcome back, ${this.callerInfo.name}! Thank you for calling ${this.orgName}. How can I help you today?`;
      }

      // Small delay for audio stream to stabilize, then greet
      setTimeout(async () => {
        await this.speak(greetingText);
        this.setState(ConversationState.LISTENING);
      }, 800);
    } catch (error) {
      console.error("❌ Initialization error:", error.message);
      await this.speak("Thank you for calling. Please hold.");
    }
  }

  // ===========================================================================
  // CUSTOMER LOOKUP (CRM Integration)
  // ===========================================================================
  async lookupCustomerByPhone() {
    if (!this.fromNumber) return;

    try {
      // Look up in leads table
      const existingLead = await this.prisma.lead.findFirst({
        where: {
          phone: this.fromNumber,
          organizationId: this.organization?.id,
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingLead) {
        console.log("📋 Returning customer found:", existingLead.name);
        this.callerInfo.isReturningCustomer = true;
        this.callerInfo.name = existingLead.name;
        this.callerInfo.email = existingLead.email;
        this.callerInfo.company = existingLead.company;
        this.callerInfo.customerRecord = existingLead;
      }

      // Also check call history
      const callHistory = await this.prisma.callLog.count({
        where: {
          fromNumber: this.fromNumber,
          organizationId: this.organization?.id,
        },
      });

      if (callHistory > 0) {
        console.log(`📞 Caller has ${callHistory} previous calls`);
        this.callerInfo.isReturningCustomer = true;
      }
    } catch (error) {
      console.error("⚠️ Customer lookup error:", error.message);
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

      setTimeout(() => {
        if (!this.deepgramReady) {
          reject(new Error("Deepgram connection timeout"));
        }
      }, 5000);
    });
  }

  // ===========================================================================
  // HANDLE DEEPGRAM MESSAGES - WITH BARGE-IN DETECTION
  // ===========================================================================
  handleDeepgramMessage(data) {
    try {
      const response = JSON.parse(data.toString());

      // Handle speech started event - KEY FOR BARGE-IN
      if (response.type === "SpeechStarted") {
        console.log("🗣️ Caller started speaking");

        // BARGE-IN: If AI is speaking, trigger interruption
        if (this.isSpeaking && this.bargeInEnabled) {
          console.log("⚡ BARGE-IN DETECTED - Interrupting AI speech");
          this.bargeInTriggered = true;
          this.speechStartedDuringSpeaking = true;
          this.stopSpeaking();
        }
        return;
      }

      // Handle utterance end event
      if (response.type === "UtteranceEnd") {
        console.log("🔇 Utterance end detected");
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

        // If we're speaking and get transcript, that's barge-in
        if (this.isSpeaking && this.bargeInEnabled && transcript.length > 2) {
          console.log(`⚡ BARGE-IN: "${transcript}"`);
          this.bargeInTriggered = true;
          this.interruptedText = transcript;
          this.stopSpeaking();
        }

        if (isFinal) {
          this.currentUtterance += (this.currentUtterance ? " " : "") + transcript;
          console.log(`📝 Interim: "${this.currentUtterance}"`);

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
  // STOP SPEAKING (BARGE-IN)
  // ===========================================================================
  stopSpeaking() {
    if (!this.isSpeaking) return;

    console.log("🛑 Stopping AI speech (barge-in)");

    // Send clear message to Twilio to stop audio playback
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        event: "clear",
        streamSid: this.streamSid,
      }));
    }

    // Reset state
    this.isSpeaking = false;
    this.currentAudioChunks = [];
    this.setState(ConversationState.LISTENING);
  }

  // ===========================================================================
  // HANDLE FINAL TRANSCRIPT
  // ===========================================================================
  async handleFinalTranscript(text) {
    if (!text || text.length < 2) {
      console.log("⚠️ Empty transcript, ignoring");
      return;
    }

    // Don't process if already processing (but allow if barge-in)
    if (this.isProcessing && !this.bargeInTriggered) {
      console.log("⚠️ Already processing, queuing transcript");
      this.transcriptBuffer.push(text);
      return;
    }

    if (this.transferredToHuman) {
      console.log("⚠️ Transferred to human, ignoring");
      return;
    }

    // If this was a barge-in, include the interrupted context
    if (this.bargeInTriggered) {
      console.log("🔄 Processing barge-in input");
      this.bargeInTriggered = false;
    }

    console.log("🎤 Caller:", text);
    this.transcript.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      wasBargeIn: this.speechStartedDuringSpeaking,
    });

    this.speechStartedDuringSpeaking = false;
    await this.processUserInput(text);
  }

  // ===========================================================================
  // AUDIO HANDLING - Send to Deepgram (Always, even during speech for barge-in)
  // ===========================================================================
  handleAudio(payload) {
    if (this.transferredToHuman) return;
    if (this.state === ConversationState.ENDED) return;

    // IMPORTANT: Always send audio to Deepgram for barge-in detection
    if (this.deepgramReady && this.deepgramWs?.readyState === WebSocket.OPEN) {
      const audioData = Buffer.from(payload, "base64");
      this.deepgramWs.send(audioData);
    }
  }

  // ===========================================================================
  // CONVERSATION PROCESSING WITH FUNCTION CALLING
  // ===========================================================================
  async processUserInput(userText) {
    this.isProcessing = true;
    this.setState(ConversationState.PROCESSING);
    this.turnCount++;

    if (this.turnCount > this.maxTurns) {
      await this.speak("Thank you for your time. I'll make sure your information is passed to our team. Have a great day!");
      this.isProcessing = false;
      return;
    }

    try {
      // Add user message to history
      this.conversationHistory.push({ role: "user", content: userText });

      // Analyze sentiment
      this.analyzeSentiment(userText);

      // Generate AI response with function calling
      console.log("🧠 Generating response with functions...");
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: this.getSystemPrompt() },
          ...this.conversationHistory,
        ],
        tools: AI_FUNCTIONS.map(fn => ({
          type: "function",
          function: fn,
        })),
        tool_choice: "auto",
        max_tokens: 300,
        temperature: 0.7,
      });

      const message = response.choices[0].message;

      // Handle function calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        await this.handleFunctionCalls(message.tool_calls, userText);
      } else {
        // Regular text response
        const reply = message.content || "I apologize, could you please repeat that?";
        console.log("🤖 AI reply:", reply);

        this.conversationHistory.push({ role: "assistant", content: reply });
        this.transcript.push({
          role: "assistant",
          content: reply,
          timestamp: new Date().toISOString(),
        });

        await this.speak(reply);
      }

      // Process any buffered transcripts from barge-in
      if (this.transcriptBuffer.length > 0) {
        const buffered = this.transcriptBuffer.shift();
        console.log("📋 Processing buffered transcript:", buffered);
        await this.processUserInput(buffered);
      }

    } catch (error) {
      console.error("❌ Process error:", error.message);
      await this.speak("I apologize, could you please repeat that?");
    } finally {
      this.isProcessing = false;
      if (this.state === ConversationState.PROCESSING) {
        this.setState(ConversationState.LISTENING);
      }
    }
  }

  // ===========================================================================
  // HANDLE FUNCTION CALLS
  // ===========================================================================
  async handleFunctionCalls(toolCalls, userText) {
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      let args = {};

      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("❌ Failed to parse function arguments:", e.message);
      }

      console.log(`🔧 Function call: ${functionName}`, args);

      let result;
      let responseText;

      switch (functionName) {
        case "transfer_to_human":
          result = await this.executeTransferToHuman(args);
          responseText = "I'll connect you with a team member right away. Please hold.";
          break;

        case "book_appointment":
          result = await this.executeBookAppointment(args);
          responseText = result.success
            ? `I've noted your appointment request for ${args.purpose}. ${result.message}`
            : `I'd be happy to help schedule that. ${result.message}`;
          break;

        case "lookup_customer":
          result = await this.executeLookupCustomer(args);
          responseText = result.found
            ? `I found your information on file. How can I help you today?`
            : "I'll make sure to update our records.";
          break;

        case "send_webhook":
          result = await this.executeSendWebhook(args);
          responseText = null; // Silent action
          break;

        case "end_call":
          result = await this.executeEndCall(args);
          responseText = "Thank you for calling. Have a wonderful day!";
          break;

        case "collect_info":
          result = this.executeCollectInfo(args);
          responseText = null; // Silent action, AI should provide its own response
          break;

        default:
          console.warn(`⚠️ Unknown function: ${functionName}`);
          result = { success: false };
      }

      // Add function result to conversation
      this.conversationHistory.push({
        role: "assistant",
        content: null,
        tool_calls: [toolCall],
      });
      this.conversationHistory.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });

      // Get AI's follow-up response after function execution
      const followUp = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: this.getSystemPrompt() },
          ...this.conversationHistory,
        ],
        max_tokens: 150,
        temperature: 0.7,
      });

      const followUpText = followUp.choices[0].message.content || responseText;

      if (followUpText) {
        console.log("🤖 AI follow-up:", followUpText);
        this.conversationHistory.push({ role: "assistant", content: followUpText });
        this.transcript.push({
          role: "assistant",
          content: followUpText,
          timestamp: new Date().toISOString(),
          functionCalled: functionName,
        });

        await this.speak(followUpText);
      }

      // Handle state changes
      if (functionName === "transfer_to_human" && result.success) {
        await this.transferToHumanWithMusic();
        return;
      }

      if (functionName === "end_call") {
        return;
      }
    }
  }

  // ===========================================================================
  // FUNCTION IMPLEMENTATIONS
  // ===========================================================================

  async executeTransferToHuman(args) {
    console.log("📞 Executing transfer to human:", args);
    this.callerInfo.wantsHumanAgent = true;
    this.callerInfo.reason = args.reason || this.callerInfo.reason;
    this.callerInfo.urgency = args.urgency?.toUpperCase() || this.callerInfo.urgency;
    this.setState(ConversationState.TRANSFERRING);
    return { success: true, message: "Initiating transfer" };
  }

  async executeBookAppointment(args) {
    console.log("📅 Executing book appointment:", args);
    this.setState(ConversationState.BOOKING_APPOINTMENT);

    this.callerInfo.appointmentDate = args.date;
    this.callerInfo.appointmentTime = args.time;
    this.callerInfo.reason = args.purpose;

    // Try to book via calendar integration
    if (this.organization?.id) {
      try {
        // Parse the natural language date/time
        const startTime = this.calendarService.parseDateTime(args.date, args.time);
        const duration = args.duration || 30;
        const endTime = new Date(startTime.getTime() + duration * 60000);

        const calendarResult = await this.calendarService.bookAppointment(this.organization.id, {
          title: `Call with ${this.callerInfo.name || "Caller"}`,
          startTime,
          endTime,
          duration,
          callerName: this.callerInfo.name || "Unknown Caller",
          callerPhone: this.callerInfo.phone,
          callerEmail: this.callerInfo.email,
          purpose: args.purpose,
          callSid: this.callSid,
        });

        if (calendarResult.success) {
          console.log("✅ Calendar booking created:", calendarResult.eventId);
          this.setState(ConversationState.LISTENING);
          return {
            success: true,
            eventId: calendarResult.eventId,
            eventLink: calendarResult.eventLink,
            message: args.date && args.time
              ? `Your appointment is confirmed for ${args.date} at ${args.time}.`
              : `Your appointment has been scheduled. ${calendarResult.message || ""}`,
          };
        } else if (calendarResult.needsManualBooking) {
          console.log("⚠️ Calendar booking needs manual action:", calendarResult.error);
        }
      } catch (calError) {
        console.error("⚠️ Calendar booking error:", calError.message);
      }
    }

    // Fallback: queue for webhook/manual booking
    this.webhookQueue.push({
      type: "appointment_requested",
      data: {
        caller: this.callerInfo,
        appointment: args,
        callSid: this.callSid,
        timestamp: new Date().toISOString(),
      },
    });

    this.setState(ConversationState.LISTENING);
    return {
      success: true,
      needsManualBooking: true,
      message: args.date && args.time
        ? `I've noted your preferred time of ${args.date} at ${args.time}. Someone will confirm shortly.`
        : "Someone from our team will reach out to confirm the best time for you.",
    };
  }

  async executeLookupCustomer(args) {
    console.log("🔍 Executing customer lookup:", args);
    this.setState(ConversationState.LOOKING_UP_CUSTOMER);

    try {
      const whereClause = {
        organizationId: this.organization?.id,
      };

      if (args.phone) {
        whereClause.phone = args.phone;
      } else if (args.name) {
        whereClause.name = { contains: args.name, mode: "insensitive" };
      } else {
        whereClause.phone = this.fromNumber;
      }

      const customer = await this.prisma.lead.findFirst({
        where: whereClause,
        orderBy: { createdAt: "desc" },
      });

      if (customer) {
        this.callerInfo.customerRecord = customer;
        this.callerInfo.name = customer.name;
        this.callerInfo.email = customer.email;
        this.callerInfo.company = customer.company;
        console.log("✅ Customer found:", customer.name);
        return { success: true, found: true, customer: { name: customer.name, email: customer.email } };
      }

      return { success: true, found: false };
    } catch (error) {
      console.error("❌ Customer lookup error:", error.message);
      return { success: false, found: false, error: error.message };
    } finally {
      this.setState(ConversationState.LISTENING);
    }
  }

  async executeSendWebhook(args) {
    console.log("🔗 Queueing webhook:", args.event_type);

    this.webhookQueue.push({
      type: args.event_type,
      data: {
        ...args.data,
        caller: this.callerInfo,
        callSid: this.callSid,
        timestamp: new Date().toISOString(),
      },
    });

    // TODO: Actually send webhook to configured URL
    // const webhookUrl = this.organization?.webhookUrl;
    // if (webhookUrl) await this.sendWebhookRequest(webhookUrl, event);

    return { success: true, queued: true };
  }

  async executeEndCall(args) {
    console.log("📞 Executing end call:", args);
    this.setState(ConversationState.ENDING);

    if (args.follow_up_required) {
      this.webhookQueue.push({
        type: "follow_up_required",
        data: {
          reason: args.reason,
          caller: this.callerInfo,
          callSid: this.callSid,
        },
      });
    }

    return { success: true, message: "Call ending" };
  }

  executeCollectInfo(args) {
    console.log("📝 Collecting info:", args);

    if (args.name) this.callerInfo.name = args.name;
    if (args.email) this.callerInfo.email = args.email;
    if (args.company) this.callerInfo.company = args.company;
    if (args.reason) this.callerInfo.reason = args.reason;
    if (args.service_interest) this.callerInfo.serviceInterest = args.service_interest;
    if (args.callback_time) this.callerInfo.preferredCallbackTime = args.callback_time;

    return { success: true, collected: Object.keys(args) };
  }

  // ===========================================================================
  // SENTIMENT ANALYSIS
  // ===========================================================================
  analyzeSentiment(text) {
    const lowerText = text.toLowerCase();

    const negativeWords = ["frustrated", "angry", "upset", "terrible", "horrible", "awful", "hate", "ridiculous", "unacceptable", "worst"];
    const positiveWords = ["great", "wonderful", "excellent", "amazing", "perfect", "love", "fantastic", "awesome", "thank you", "appreciate"];
    const urgentWords = ["urgent", "emergency", "immediately", "asap", "critical", "help", "please"];

    const negativeCount = negativeWords.filter(w => lowerText.includes(w)).length;
    const positiveCount = positiveWords.filter(w => lowerText.includes(w)).length;
    const urgentCount = urgentWords.filter(w => lowerText.includes(w)).length;

    if (negativeCount > positiveCount) {
      this.callerInfo.sentiment = "negative";
      if (urgentCount > 0) {
        this.callerInfo.urgency = "HIGH";
      }
    } else if (positiveCount > negativeCount) {
      this.callerInfo.sentiment = "positive";
    } else {
      this.callerInfo.sentiment = "neutral";
    }

    if (urgentCount >= 2) {
      this.callerInfo.urgency = "CRITICAL";
    }
  }

  // ===========================================================================
  // TRANSFER TO HUMAN
  // ===========================================================================
  async transferToHuman() {
    try {
      console.log("🔁 Transferring to human agent...");
      this.transferredToHuman = true;
      this.setState(ConversationState.TRANSFERRING);

      // Close Deepgram connection first
      if (this.deepgramWs) {
        try {
          this.deepgramWs.send(JSON.stringify({ type: "CloseStream" }));
          this.deepgramWs.close();
        } catch (e) {}
      }
      this.deepgramReady = false;

      const callerId = this.toNumber || process.env.TWILIO_NUMBER;
      const clientIdentity = this.organization?.slug
        ? `${this.organization.slug}-web`
        : "default-web";

      console.log("📞 Dialing client:", clientIdentity);

      await this.twilioClient.calls(this.callSid).update({
        twiml: `<Response>
          <Dial callerId="${callerId}" timeout="30" ringTone="${HOLD_MUSIC_URL}" action="${process.env.PUBLIC_BASE_URL}/twilio/transfer/status">
            <Client>
              <Identity>${clientIdentity}</Identity>
            </Client>
          </Dial>
          <Say voice="Polly.Amy">We're sorry, no one is available right now. Please leave a message after the beep.</Say>
          <Record maxLength="120" transcribe="true" recordingStatusCallback="${process.env.PUBLIC_BASE_URL}/twilio/recording/callback"/>
        </Response>`,
      });

      console.log("✅ Transfer initiated to", clientIdentity);
    } catch (err) {
      console.error("❌ Transfer error:", err.message);
    }
  }

  async transferToHumanWithMusic() {
    return this.transferToHuman();
  }

  // ===========================================================================
  // TEXT-TO-SPEECH WITH BARGE-IN SUPPORT
  // ===========================================================================
  async speak(text) {
    try {
      console.log("🔊 Speaking:", text.substring(0, 60) + (text.length > 60 ? "..." : ""));
      this.isSpeaking = true;
      this.bargeInTriggered = false;
      this.setState(ConversationState.SPEAKING);

      // Reset utterance tracking
      this.currentUtterance = "";

      const audioBuffer = await this.textToSpeech(text);
      if (audioBuffer && !this.bargeInTriggered) {
        await this.sendAudioToTwilio(audioBuffer);
      }

      // Only mark as done speaking if we weren't interrupted
      if (!this.bargeInTriggered) {
        await new Promise(resolve => setTimeout(resolve, 200));
        this.isSpeaking = false;
        this.setState(ConversationState.LISTENING);
        console.log("🎤 Listening...");
      }
    } catch (error) {
      console.error("❌ Speak error:", error);
      this.isSpeaking = false;
      this.setState(ConversationState.LISTENING);
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
      // Check for barge-in during audio sending
      if (this.bargeInTriggered) {
        console.log("⚡ Barge-in during audio send, stopping");
        break;
      }

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

    // Send mark to know when audio finished
    if (this.ws.readyState === WebSocket.OPEN && !this.bargeInTriggered) {
      const markId = `end-${++this.audioMarkId}`;
      this.ws.send(JSON.stringify({
        event: "mark",
        streamSid: this.streamSid,
        mark: { name: markId },
      }));
    }
  }

  handleMark(mark) {
    console.log("📍 Mark received:", mark.name);
    if (mark.name.startsWith("end-")) {
      // Audio finished playing
      if (!this.bargeInTriggered) {
        this.isSpeaking = false;
      }
    }
  }

  // ===========================================================================
  // SYSTEM PROMPT
  // ===========================================================================
  getSystemPrompt() {
    const customerContext = this.callerInfo.isReturningCustomer
      ? `This is a RETURNING CUSTOMER. Their name is ${this.callerInfo.name || "on file"}. Be warm and acknowledge them.`
      : "This appears to be a new caller. Gather their information naturally.";

    const sentimentContext = this.callerInfo.sentiment === "negative"
      ? "The caller seems frustrated. Be extra empathetic and helpful. Acknowledge their concerns."
      : this.callerInfo.sentiment === "positive"
      ? "The caller is in a good mood. Match their positive energy."
      : "";

    return `You are the professional AI receptionist for ${this.orgName}.

VOICE PERSONA:
- Warm, confident, and genuinely helpful
- Speak naturally like a skilled human receptionist
- Use conversational language, not robotic phrases
- Show empathy and understanding
- Keep responses SHORT (1-2 sentences, max 30 words)

IMPORTANT: BARGE-IN IS ENABLED
- The caller can interrupt you at any time
- If interrupted, your current speech will stop
- Acknowledge interruptions naturally ("Of course, go ahead" or just continue with their request)

AVAILABLE FUNCTIONS:
- transfer_to_human: Use when caller wants to speak with a person/agent/representative
- book_appointment: Use when caller wants to schedule a meeting
- lookup_customer: Use to find customer info in our system
- send_webhook: Use to notify external systems of events
- end_call: Use when conversation is complete
- collect_info: Use to save caller information

FUNCTION USAGE GUIDELINES:
1. Call collect_info to save any info the caller provides (name, email, company, reason)
2. If caller asks for human/agent/representative → call transfer_to_human
3. If caller wants to schedule → call book_appointment
4. Always use functions instead of just responding when an action is needed

CUSTOMER CONTEXT:
${customerContext}

${sentimentContext}

CURRENT CALLER INFO:
- Phone: ${this.callerInfo.phone || "Unknown"}
- Name: ${this.callerInfo.name || "Not yet provided"}
- Company: ${this.callerInfo.company || "Not mentioned"}
- Reason: ${this.callerInfo.reason || "Not yet stated"}
- Sentiment: ${this.callerInfo.sentiment}
- Urgency: ${this.callerInfo.urgency}
- Turn Count: ${this.turnCount}
- Call Duration: ${Math.round((Date.now() - this.callStartTime) / 1000)}s

CONVERSATION GUIDELINES:
1. If you don't have their name, ask for it naturally
2. Understand their reason for calling
3. Use functions to take actions (don't just acknowledge)
4. Be concise - phone conversations should be efficient
5. If they ask for something you can't do, offer to transfer to a human`;
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
            content: "Summarize this call in 2-3 sentences. Include: who called, why, what was discussed, and outcome.",
          },
          {
            role: "user",
            content: this.transcript.map(t => `${t.role}: ${t.content}`).join("\n"),
          },
        ],
        max_tokens: 150,
      });
      return response.choices[0].message.content;
    } catch (error) {
      return "Summary unavailable";
    }
  }

  async cleanup() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.setState(ConversationState.ENDED);
    console.log("🧹 Cleaning up call:", this.callSid);

    // Close Deepgram connection
    if (this.deepgramWs) {
      try {
        this.deepgramWs.send(JSON.stringify({ type: "CloseStream" }));
        this.deepgramWs.close();
      } catch (e) {}
    }

    const callDuration = Math.round((Date.now() - this.callStartTime) / 1000);
    console.log(`📞 Call duration: ${callDuration}s, Turns: ${this.turnCount}, Transcript entries: ${this.transcript.length}`);

    // Process webhook queue (includes CRM sync)
    await this.processWebhookQueue();

    // Save call log
    let savedCallLog = null;
    try {
      savedCallLog = await this.prisma.callLog.upsert({
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
    let savedTranscript = null;
    let savedLead = null;
    if (this.transcript.length > 0) {
      try {
        const summary = await this.generateSummary();
        console.log("📝 Summary:", summary);

        savedTranscript = await this.prisma.transcript.create({
          data: {
            callSid: this.callSid,
            fullText: this.transcript.map(t => `${t.role}: ${t.content}`).join("\n"),
            messages: this.transcript,
            summary,
            organizationId: this.organization?.id,
          },
        });
        console.log("✅ Transcript saved");

        // Create or update lead
        if (this.callerInfo.name || this.callerInfo.reason) {
          // Check if lead already exists for this phone number
          const existingLead = await this.prisma.lead.findFirst({
            where: {
              phone: this.callerInfo.phone || "Unknown",
              organizationId: this.organization?.id,
            },
          });

          if (existingLead) {
            // Update existing lead
            savedLead = await this.prisma.lead.update({
              where: { id: existingLead.id },
              data: {
                name: this.callerInfo.name || existingLead.name,
                email: this.callerInfo.email || existingLead.email,
                company: this.callerInfo.company || existingLead.company,
                reason: this.callerInfo.reason || existingLead.reason,
                serviceInterest: this.callerInfo.serviceInterest || existingLead.serviceInterest,
                preferredCallbackTime: this.callerInfo.preferredCallbackTime || existingLead.preferredCallbackTime,
                appointmentDate: this.callerInfo.appointmentDate || existingLead.appointmentDate,
                appointmentTime: this.callerInfo.appointmentTime || existingLead.appointmentTime,
                urgency: this.callerInfo.urgency || "MEDIUM",
                status: this.callerInfo.wantsHumanAgent ? "CONTACTED" : existingLead.status,
              },
            });
            console.log("✅ Lead updated:", this.callerInfo.name || existingLead.name);
          } else {
            // Create new lead
            savedLead = await this.prisma.lead.create({
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
                status: this.callerInfo.wantsHumanAgent ? "CONTACTED" : "NEW",
                organizationId: this.organization?.id,
              },
            });
            console.log("✅ Lead created:", this.callerInfo.name || "Unknown");
          }
        }
      } catch (err) {
        console.error("❌ Transcript/Lead save error:", err.message);
      }
    }

    // =========================================================================
    // CRM SYNC - Automatically sync to connected CRMs
    // =========================================================================
    if (this.organization?.id) {
      try {
        // Sync lead to CRM
        if (savedLead) {
          console.log("🔄 Syncing lead to CRM...");
          const crmLeadResults = await this.crmService.syncLead(this.organization.id, savedLead);
          console.log("✅ CRM lead sync:", crmLeadResults.length, "providers processed");
        }

        // Sync call to CRM
        if (savedCallLog) {
          console.log("🔄 Syncing call to CRM...");
          const crmCallResults = await this.crmService.syncCall(
            this.organization.id,
            savedCallLog,
            savedTranscript
          );
          console.log("✅ CRM call sync:", crmCallResults.length, "providers processed");
        }

        // Trigger webhook events for the call
        await this.crmService.triggerWebhooks(this.organization.id, "call.completed", {
          call: savedCallLog,
          transcript: savedTranscript,
          lead: savedLead,
          callerInfo: this.callerInfo,
        });
      } catch (crmError) {
        console.error("⚠️ CRM sync error:", crmError.message);
        // Don't throw - CRM sync failures shouldn't break the call cleanup
      }
    }

    console.log("🧹 Cleanup complete");
  }

  async processWebhookQueue() {
    if (this.webhookQueue.length === 0) return;
    if (!this.organization?.id) return;

    console.log(`📤 Processing ${this.webhookQueue.length} queued webhooks`);

    for (const event of this.webhookQueue) {
      try {
        console.log("📤 Webhook event:", event.type);

        // Use CRM service to trigger webhooks
        await this.crmService.triggerWebhooks(
          this.organization.id,
          event.type,
          event.data
        );
      } catch (error) {
        console.error("❌ Webhook error:", error.message);
      }
    }

    // Clear the queue
    this.webhookQueue = [];
  }
}

module.exports = { AIReceptionist, VOICE_OPTIONS, DEFAULT_VOICE, ConversationState };
