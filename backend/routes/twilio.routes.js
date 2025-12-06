// ============================================================================
// HEKAX Phone - Twilio Routes
// Enhanced with webhook signature validation
// ============================================================================

const express = require("express");
const twilio = require("twilio");
const prisma = require("../lib/prisma");
const {
  validateTwilioWebhookFlexible,
  logTwilioWebhook,
} = require("../middleware/twilio.middleware");
const { webhookLimiter } = require("../middleware/security.middleware");
const { spamFilter } = require("../services/spam-filter.service");

const router = express.Router();

const VoiceResponse = twilio.twiml.VoiceResponse;

// Services
let smsService, voicemailService, automationService;
try {
  automationService = require("../services/automation.service");
} catch (err) {
  console.log("⚠️ Automation service not available:", err.message);
}
try {
  smsService = require("../services/sms.service");
  voicemailService = require("../services/voicemail.service");
} catch (err) {
  console.log("⚠️ SMS/Voicemail services not available:", err.message);
}

// Apply rate limiting to all Twilio routes
router.use(webhookLimiter);

// ============================================================================
// POST /twilio/voice/incoming
// Handle incoming calls - routes to correct organization based on called number
// ============================================================================

router.post(
  "/voice/incoming",
  validateTwilioWebhookFlexible,
  logTwilioWebhook,
  async (req, res) => {
    const twiml = new VoiceResponse();
    const calledNumber = req.body.To;
    const callerNumber = req.body.From;

    console.log("📞 Inbound call:", { from: callerNumber, to: calledNumber });

    try {
      // Check for spam/robocall
      const spamCheck = await spamFilter.checkNumber(callerNumber);
      if (spamCheck.isSpam) {
        console.log(`🚫 Spam call blocked: ${callerNumber} (${spamCheck.reason})`);
        twiml.reject({ reason: "rejected" });
        return res.type("text/xml").send(twiml.toString());
      }
      if (spamCheck.reason) {
        console.log(`⚠️ Spam warning: ${callerNumber} (${spamCheck.reason}, confidence: ${spamCheck.confidence})`);
      }
      // Look up which organization owns this phone number
      // First check PhoneNumber table
      let phoneRecord = await prisma.phoneNumber.findFirst({
        where: { number: calledNumber, status: "active" },
        include: {
          organization: {
            include: {
              memberships: {
                where: { role: { in: ["OWNER", "ADMIN"] } },
                take: 1,
                include: { user: true },
              },
            },
          },
        },
      });

      let org = phoneRecord?.organization;

      // If not found, check Organization.twilioNumber field
      if (!org) {
        org = await prisma.organization.findFirst({
          where: { twilioNumber: calledNumber },
          include: {
            memberships: {
              where: { role: { in: ["OWNER", "ADMIN"] } },
              take: 1,
              include: { user: true },
            },
          },
        });
        if (org) {
          console.log("📞 Found org via twilioNumber field:", org.name);
        }
      }

      if (!org) {
        console.log("⚠️ Phone number not found in database, using fallback");
      }

      const aiEnabled =
        phoneRecord?.routeToAI ??
        org?.aiEnabled ??
        process.env.AI_RECEPTIONIST_ENABLED === "true";

      // Determine client identity for this organization
      // Format: {slug}-web (matches token generation and AI transfer)
      const clientIdentity = org?.slug
        ? `${org.slug}-web`
        : "default-web";

      console.log("📞 Routing to:", { orgId: org?.id, aiEnabled, clientIdentity });

      if (aiEnabled) {
        // Note: Twilio doesn't support recording for <Connect><Stream> calls
        // The AI receptionist creates its own transcript from the conversation
        // For call recordings, we would need to use Twilio's Recordings API post-call
        // or use a different architecture (dial to conference with recording)

        twiml.say(
          { voice: "Polly.Amy" },
          "Please hold while I connect you to our assistant."
        );
        twiml.pause({ length: 1 });

        const connect = twiml.connect();
        const wsHost = process.env.PUBLIC_BASE_URL
          ? process.env.PUBLIC_BASE_URL.replace("https://", "").replace(
              "http://",
              ""
            )
          : req.headers.host;

        const stream = connect.stream({
          url: `wss://${wsHost}/media-stream`,
        });

        stream.parameter({ name: "callerNumber", value: callerNumber });
        stream.parameter({ name: "calledNumber", value: calledNumber });
        stream.parameter({ name: "direction", value: "inbound" });
        stream.parameter({ name: "organizationId", value: org?.id || "" });
      } else {
        const dial = twiml.dial({
          record: "record-from-answer-dual",
          recordingStatusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/recording/callback`,
          recordingStatusCallbackEvent: "completed",
        });
        dial.client(clientIdentity);
      }
    } catch (err) {
      console.error("❌ Inbound call routing error:", err);
      twiml.say(
        { voice: "Polly.Amy" },
        "We're sorry, please try your call again."
      );
    }

    res.type("text/xml");
    res.send(twiml.toString());
  }
);

// ============================================================================
// POST /twilio/voice/outbound
// Handle outbound calls - uses organization's phone number as caller ID
// ============================================================================

router.post(
  "/voice/outbound",
  validateTwilioWebhookFlexible,
  logTwilioWebhook,
  async (req, res) => {
    const twiml = new VoiceResponse();
    const to = req.body.To || req.body.to;
    const accountSid = req.body.AccountSid;

    console.log("📤 Outbound call request:", { to, accountSid });

    if (!to) {
      twiml.say("No destination number provided.");
      return res.type("text/xml").send(twiml.toString());
    }

    try {
      let callerNumber = process.env.TWILIO_NUMBER;

      if (accountSid) {
        const org = await prisma.organization.findFirst({
          where: { twilioSubAccountSid: accountSid },
          select: { id: true, twilioNumber: true },
        });

        if (org?.twilioNumber) {
          callerNumber = org.twilioNumber;
          console.log("📤 Using org caller ID:", {
            orgId: org.id,
            callerNumber,
          });
        } else {
          const phoneRecord = await prisma.phoneNumber.findFirst({
            where: {
              organization: { twilioSubAccountSid: accountSid },
              status: "active",
            },
            select: { number: true },
          });
          if (phoneRecord?.number) {
            callerNumber = phoneRecord.number;
            console.log("📤 Using phone record caller ID:", callerNumber);
          }
        }
      }

      console.log("📤 Outbound call:", { from: callerNumber, to });

      const dial = twiml.dial({
        callerId: callerNumber,
        record: "record-from-answer-dual",
        recordingStatusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/recording/callback`,
        recordingStatusCallbackEvent: "completed",
      });
      dial.number(to);
    } catch (err) {
      console.error("❌ Outbound call error:", err);
      twiml.say("An error occurred. Please try again.");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  }
);

// ============================================================================
// POST /twilio/call/status
// Handle call status updates
// ============================================================================

router.post(
  "/call/status",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    const { CallSid, CallStatus, CallDuration, From, To, Direction, AccountSid } =
      req.body;
    console.log("📡 Call status:", { CallSid, CallStatus, Direction });

    try {
      let organizationId = null;
      const isInbound = Direction === "inbound";

      if (isInbound) {
        const phoneRecord = await prisma.phoneNumber.findFirst({
          where: { number: To, status: "active" },
          select: { organizationId: true },
        });
        organizationId = phoneRecord?.organizationId;
      } else if (AccountSid) {
        const org = await prisma.organization.findFirst({
          where: { twilioSubAccountSid: AccountSid },
          select: { id: true },
        });
        organizationId = org?.id;
      }

      if (!organizationId) {
        const phoneRecord = await prisma.phoneNumber.findFirst({
          where: {
            OR: [{ number: To }, { number: From }],
            status: "active",
          },
          select: { organizationId: true },
        });
        organizationId = phoneRecord?.organizationId;
      }

      const callData = await prisma.callLog.upsert({
        where: { callSid: CallSid },
        update: {
          status: CallStatus.toUpperCase(),
          duration: CallDuration ? parseInt(CallDuration) : 0,
          organizationId,
        },
        create: {
          callSid: CallSid,
          direction: isInbound ? "INBOUND" : "OUTBOUND",
          fromNumber: From || "Unknown",
          toNumber: To || "Unknown",
          status: CallStatus.toUpperCase(),
          duration: CallDuration ? parseInt(CallDuration) : 0,
          organizationId,
        },
      });

      console.log("📡 Call logged for org:", organizationId);

      // Emit automation events
      if (automationService && organizationId) {
        const eventData = {
          callSid: CallSid,
          fromNumber: From,
          toNumber: To,
          direction: isInbound ? "INBOUND" : "OUTBOUND",
          status: CallStatus.toUpperCase(),
          duration: CallDuration ? parseInt(CallDuration) : 0,
          ...callData,
        };

        const status = CallStatus.toUpperCase();
        if (status === "COMPLETED") {
          automationService.emit(
            automationService.EVENTS.CALL_COMPLETED,
            organizationId,
            eventData
          );
        } else if (status === "NO_ANSWER" || status === "BUSY" || status === "FAILED") {
          automationService.emit(
            automationService.EVENTS.CALL_MISSED,
            organizationId,
            eventData
          );
        } else if (status === "IN_PROGRESS" || status === "RINGING") {
          automationService.emit(
            automationService.EVENTS.CALL_STARTED,
            organizationId,
            eventData
          );
        }
      }
    } catch (err) {
      console.error("❌ Call status DB error:", err);
    }

    res.sendStatus(200);
  }
);

// ============================================================================
// POST /twilio/recording/callback
// Handle recording completion
// ============================================================================

router.post(
  "/recording/callback",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    const { CallSid, RecordingUrl, RecordingDuration, RecordingSid, From, To } = req.body;
    console.log("🎧 Recording callback:", { CallSid, RecordingUrl, RecordingSid });

    try {
      // Use upsert to handle case where call log might not exist yet
      await prisma.callLog.upsert({
        where: { callSid: CallSid },
        update: {
          recordingUrl: RecordingUrl,
          recordingSid: RecordingSid,
          recordingDuration: RecordingDuration
            ? parseInt(RecordingDuration)
            : null,
        },
        create: {
          callSid: CallSid,
          direction: "INBOUND",
          fromNumber: From || "Unknown",
          toNumber: To || "Unknown",
          status: "COMPLETED",
          recordingUrl: RecordingUrl,
          recordingSid: RecordingSid,
          recordingDuration: RecordingDuration
            ? parseInt(RecordingDuration)
            : null,
        },
      });
      console.log("✅ Recording saved to DB");
    } catch (err) {
      console.error("❌ Recording callback DB error:", err);
    }

    res.sendStatus(200);
  }
);

// ============================================================================
// POST /twilio/transfer/initiate
// Handle transfer from AI receptionist to human agent
// ============================================================================

router.post(
  "/transfer/initiate",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    const callerId = req.query.callerId || process.env.TWILIO_NUMBER;
    const { CallSid, From, To } = req.body;

    console.log("🔁 Transfer initiate:", { CallSid, From, To, callerId });

    const twiml = new VoiceResponse();

    // Play hold music while connecting
    twiml.play(
      { loop: 10 },
      "http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-B8.mp3"
    );

    // Dial the web client
    const dial = twiml.dial({
      callerId: callerId,
      timeout: 30,
      action: `${process.env.PUBLIC_BASE_URL}/twilio/transfer/status`,
    });
    // Note: This endpoint is used as fallback - ideally transfer should use org-specific identity
    // The AI receptionist handles this dynamically now
    dial.client("default-web");

    // Fallback if no one answers
    twiml.say(
      { voice: "Polly.Amy" },
      "We're sorry, no one is available right now. Please leave a message after the beep."
    );
    twiml.record({ maxLength: 120, transcribe: true });

    res.type("text/xml");
    res.send(twiml.toString());
  }
);

// ============================================================================
// POST /twilio/transfer/status
// Handle transfer completion status
// ============================================================================

router.post(
  "/transfer/status",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    const { CallSid, DialCallStatus, DialCallDuration } = req.body;
    console.log("📞 Transfer status:", { CallSid, DialCallStatus, DialCallDuration });

    const twiml = new VoiceResponse();

    if (DialCallStatus === "completed" || DialCallStatus === "answered") {
      // Call was answered and completed normally
      twiml.hangup();
    } else if (DialCallStatus === "busy" || DialCallStatus === "no-answer" || DialCallStatus === "failed") {
      // No one answered - offer voicemail
      twiml.say(
        { voice: "Polly.Amy" },
        "We're sorry, no one is available. Please leave a message after the beep."
      );
      twiml.record({
        maxLength: 120,
        transcribe: true,
        transcribeCallback: `${process.env.PUBLIC_BASE_URL}/twilio/voicemail/transcription`,
        recordingStatusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/voicemail/callback`,
        recordingStatusCallbackEvent: "completed",
        playBeep: true,
      });
    } else {
      twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
  }
);

// ============================================================================
// POST /twilio/amd/callback
// Handle Answering Machine Detection results
// Used for outbound calls to detect voicemail vs human
// ============================================================================

router.post(
  "/amd/callback",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    const { CallSid, AnsweredBy, MachineDetectionDuration } = req.body;
    console.log("🤖 AMD Result:", { CallSid, AnsweredBy, MachineDetectionDuration });

    try {
      // Update call log with AMD result
      await prisma.callLog.updateMany({
        where: { callSid: CallSid },
        data: {
          answeredBy: AnsweredBy, // human, machine_start, machine_end_beep, machine_end_silence, machine_end_other, fax, unknown
          amdDuration: MachineDetectionDuration ? parseInt(MachineDetectionDuration) : null,
        },
      });

      // If voicemail detected, leave a message
      if (AnsweredBy && AnsweredBy.startsWith("machine")) {
        console.log("📨 Voicemail detected - will leave message");
        // The message is handled by the main voice webhook based on AMD result
      }
    } catch (err) {
      console.error("❌ AMD callback error:", err);
    }

    res.sendStatus(200);
  }
);

// ============================================================================
// POST /twilio/voice/fallback
// Fallback handler when primary voice URL fails
// ============================================================================

router.post("/voice/fallback", validateTwilioWebhookFlexible, (req, res) => {
  console.error("⚠️ Voice fallback triggered:", req.body);

  const twiml = new VoiceResponse();
  twiml.say(
    { voice: "Polly.Amy" },
    "We're sorry, we're experiencing technical difficulties. Please try your call again later."
  );
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

// ============================================================================
// POST /twilio/sms/incoming
// Handle incoming SMS
// ============================================================================

router.post(
  "/sms/incoming",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    const { From, To, Body } = req.body;
    console.log("📱 Incoming SMS:", {
      From,
      To,
      Body: Body?.substring(0, 50),
    });

    const MessagingResponse = twilio.twiml.MessagingResponse;
    const twiml = new MessagingResponse();

    try {
      // Find organization by phone number
      const org = await prisma.organization.findFirst({
        where: { twilioNumber: To },
      });

      if (org) {
        // Check for appointment confirmation
        const upperBody = Body?.toUpperCase()?.trim();
        if (upperBody === "CONFIRM" || upperBody === "YES") {
          // Find pending booking for this number
          const booking = await prisma.calendarBooking.findFirst({
            where: {
              callerPhone: From,
              organizationId: org.id,
              status: "PENDING",
            },
            orderBy: { createdAt: "desc" },
          });

          if (booking) {
            await prisma.calendarBooking.update({
              where: { id: booking.id },
              data: { status: "CONFIRMED" },
            });
            twiml.message("Your appointment has been confirmed. Thank you!");
          }
        } else if (upperBody === "STOP" || upperBody === "UNSUBSCRIBE") {
          // Handle opt-out (required by law)
          twiml.message("You have been unsubscribed and will not receive further messages.");
        }
      }
    } catch (err) {
      console.error("❌ Incoming SMS processing error:", err);
    }

    res.type("text/xml");
    res.send(twiml.toString());
  }
);

// ============================================================================
// POST /twilio/sms/status
// Handle SMS delivery status updates
// ============================================================================

router.post(
  "/sms/status",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    const { MessageSid, MessageStatus, To, ErrorCode } = req.body;
    console.log("📱 SMS Status:", { MessageSid, MessageStatus, To, ErrorCode });

    // Could log SMS delivery status to database if needed
    res.sendStatus(200);
  }
);

// ============================================================================
// POST /twilio/voicemail/callback
// Handle voicemail recording completion
// ============================================================================

router.post(
  "/voicemail/callback",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    console.log("📨 Voicemail callback:", req.body);

    if (voicemailService) {
      try {
        await voicemailService.processVoicemail(req.body);
      } catch (err) {
        console.error("❌ Voicemail processing error:", err);
      }
    }

    res.sendStatus(200);
  }
);

// ============================================================================
// POST /twilio/voicemail/transcription
// Handle voicemail transcription completion
// ============================================================================

router.post(
  "/voicemail/transcription",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    const { CallSid, TranscriptionText, TranscriptionStatus } = req.body;
    console.log("📝 Voicemail transcription:", { CallSid, TranscriptionStatus });

    try {
      // Update voicemail with transcription
      await prisma.voicemail.updateMany({
        where: { callSid: CallSid },
        data: {
          transcription: TranscriptionText,
          transcriptionStatus: TranscriptionStatus === "completed" ? "completed" : "failed",
        },
      });
    } catch (err) {
      console.error("❌ Transcription update error:", err);
    }

    res.sendStatus(200);
  }
);

// ============================================================================
// POST /twilio/call/completed
// Hook to trigger SMS follow-up after call completion
// ============================================================================

router.post(
  "/call/completed",
  validateTwilioWebhookFlexible,
  async (req, res) => {
    const { CallSid, CallStatus, AccountSid } = req.body;
    console.log("📞 Call completed hook:", { CallSid, CallStatus });

    if (CallStatus === "completed" && smsService) {
      try {
        // Find organization
        const org = await prisma.organization.findFirst({
          where: { twilioSubAccountSid: AccountSid },
        });

        if (org?.id) {
          // Trigger SMS follow-up (async, don't wait)
          smsService.sendCallFollowUp(CallSid, org.id).catch(err => {
            console.log("ℹ️ SMS follow-up skipped:", err.message);
          });
        }
      } catch (err) {
        console.error("❌ Call completed hook error:", err);
      }
    }

    res.sendStatus(200);
  }
);

module.exports = router;
