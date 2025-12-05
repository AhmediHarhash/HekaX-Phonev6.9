// ============================================================================
// HEKAX Phone - Twilio Routes
// ============================================================================

const express = require("express");
const twilio = require("twilio");
const prisma = require("../lib/prisma");

const router = express.Router();

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * POST /twilio/voice/incoming
 * Handle incoming calls
 */
router.post("/voice/incoming", (req, res) => {
  const twiml = new VoiceResponse();
  const aiEnabled = process.env.AI_RECEPTIONIST_ENABLED === "true";

  console.log("📞 Inbound call:", { from: req.body.From, to: req.body.To, aiEnabled });

  if (aiEnabled) {
    twiml.say({ voice: "Polly.Amy" }, "Please hold while I connect you to our assistant.");
    twiml.pause({ length: 1 });

    const connect = twiml.connect();
    const wsHost = process.env.PUBLIC_BASE_URL 
      ? process.env.PUBLIC_BASE_URL.replace('https://', '').replace('http://', '')
      : req.headers.host;
    
    const stream = connect.stream({
      url: `wss://${wsHost}/media-stream`,
    });

    stream.parameter({ name: "callerNumber", value: req.body.From });
    stream.parameter({ name: "calledNumber", value: req.body.To });
    stream.parameter({ name: "direction", value: "inbound" });
  } else {
    const dial = twiml.dial({
      record: "record-from-answer-dual",
      recordingStatusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/recording/callback`,
      recordingStatusCallbackEvent: "completed",
    });
    dial.client("ahmed-web");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

/**
 * POST /twilio/voice/outbound
 * Handle outbound calls
 */
router.post("/voice/outbound", (req, res) => {
  const twiml = new VoiceResponse();
  const to = req.body.To || req.body.to;
  const from = process.env.TWILIO_NUMBER;

  console.log("📤 Outbound call:", { from, to });

  if (!to) {
    twiml.say("No destination number provided.");
    return res.type("text/xml").send(twiml.toString());
  }

  const dial = twiml.dial({
    callerId: from,
    record: "record-from-answer-dual",
    recordingStatusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/recording/callback`,
    recordingStatusCallbackEvent: "completed",
  });
  dial.number(to);

  res.type("text/xml");
  res.send(twiml.toString());
});

/**
 * POST /twilio/call/status
 * Handle call status updates
 */
router.post("/call/status", async (req, res) => {
  const { CallSid, CallStatus, CallDuration, From, To } = req.body;
  console.log("📡 Call status:", { CallSid, CallStatus });

  try {
    await prisma.callLog.upsert({
      where: { callSid: CallSid },
      update: {
        status: CallStatus.toUpperCase(),
        duration: CallDuration ? parseInt(CallDuration) : 0,
      },
      create: {
        callSid: CallSid,
        direction: "INBOUND",
        fromNumber: From || "Unknown",
        toNumber: To || "Unknown",
        status: CallStatus.toUpperCase(),
        duration: CallDuration ? parseInt(CallDuration) : 0,
      },
    });
  } catch (err) {
    console.error("❌ Call status DB error:", err);
  }
  
  res.sendStatus(200);
});

/**
 * POST /twilio/recording/callback
 * Handle recording completion
 */
router.post("/recording/callback", async (req, res) => {
  const { CallSid, RecordingUrl, RecordingDuration } = req.body;
  console.log("🎧 Recording:", { CallSid, RecordingUrl });

  try {
    await prisma.callLog.update({
      where: { callSid: CallSid },
      data: {
        recordingUrl: RecordingUrl,
        recordingDuration: RecordingDuration ? parseInt(RecordingDuration) : null,
      },
    });
  } catch (err) {
    console.error("❌ Recording callback DB error:", err);
  }

  res.sendStatus(200);
});

/**
 * POST /twilio/voice/fallback
 * Fallback handler when primary voice URL fails
 */
router.post("/voice/fallback", (req, res) => {
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

/**
 * POST /twilio/sms/incoming
 * Handle incoming SMS (placeholder for future)
 */
router.post("/sms/incoming", async (req, res) => {
  const { From, To, Body } = req.body;
  console.log("📱 Incoming SMS:", { From, To, Body: Body?.substring(0, 50) });

  // TODO: Implement SMS handling
  // For now, just acknowledge receipt

  const MessagingResponse = twilio.twiml.MessagingResponse;
  const twiml = new MessagingResponse();
  // Don't auto-reply for now
  // twiml.message("Thanks for your message. We'll get back to you soon!");

  res.type("text/xml");
  res.send(twiml.toString());
});

module.exports = router;
