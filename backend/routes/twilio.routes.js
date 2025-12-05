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

const router = express.Router();

const VoiceResponse = twilio.twiml.VoiceResponse;

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
      // Look up which organization owns this phone number
      const phoneRecord = await prisma.phoneNumber.findFirst({
        where: { number: calledNumber, status: "active" },
        include: {
          organization: {
            include: {
              members: {
                where: { role: { in: ["OWNER", "ADMIN"] } },
                take: 1,
                include: { user: true },
              },
            },
          },
        },
      });

      if (!phoneRecord) {
        console.log("⚠️ Phone number not found in database, using fallback");
      }

      const org = phoneRecord?.organization;
      const aiEnabled =
        phoneRecord?.routeToAI ??
        process.env.AI_RECEPTIONIST_ENABLED === "true";

      // Determine client identity for this organization
      const primaryMember = org?.members?.[0];
      const clientIdentity = primaryMember?.user?.id
        ? `${primaryMember.user.id}-web`
        : "fallback-web";

      console.log("📞 Routing to:", { orgId: org?.id, aiEnabled, clientIdentity });

      if (aiEnabled) {
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

      await prisma.callLog.upsert({
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
    const { CallSid, RecordingUrl, RecordingDuration, RecordingSid } = req.body;
    console.log("🎧 Recording:", { CallSid, RecordingUrl });

    try {
      await prisma.callLog.update({
        where: { callSid: CallSid },
        data: {
          recordingUrl: RecordingUrl,
          recordingSid: RecordingSid,
          recordingDuration: RecordingDuration
            ? parseInt(RecordingDuration)
            : null,
        },
      });
    } catch (err) {
      console.error("❌ Recording callback DB error:", err);
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
// Handle incoming SMS (placeholder for future)
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

    res.type("text/xml");
    res.send(twiml.toString());
  }
);

module.exports = router;
