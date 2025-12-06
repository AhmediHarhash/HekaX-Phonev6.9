// ============================================================================
// HEKAX Phone - Voicemail Service
// Voicemail detection, recording, and transcription
// ============================================================================

const twilio = require("twilio");
const prisma = require("../lib/prisma");
const { getClientForOrganization } = require("./twilio.service");
const { sendSMS } = require("./sms.service");

/**
 * Process a voicemail recording
 * Called when Twilio sends us a voicemail recording callback
 */
async function processVoicemail(data) {
  const {
    CallSid,
    RecordingUrl,
    RecordingSid,
    RecordingDuration,
    TranscriptionText,
    TranscriptionStatus,
    From,
    To,
  } = data;

  console.log("📨 Processing voicemail:", { CallSid, RecordingSid });

  try {
    // Find the organization by phone number
    const phoneRecord = await prisma.phoneNumber.findFirst({
      where: { number: To, status: "active" },
      include: {
        organization: {
          include: {
            memberships: {
              where: { role: { in: ["OWNER", "ADMIN"] } },
              include: { user: true },
            },
          },
        },
      },
    });

    const org = phoneRecord?.organization;
    const organizationId = org?.id;

    // Create or update voicemail record
    const voicemail = await prisma.voicemail.upsert({
      where: { callSid: CallSid },
      update: {
        recordingUrl: RecordingUrl,
        recordingSid: RecordingSid,
        duration: RecordingDuration ? parseInt(RecordingDuration) : 0,
        transcription: TranscriptionText || null,
        transcriptionStatus: TranscriptionStatus || "pending",
        status: "new",
      },
      create: {
        callSid: CallSid,
        fromNumber: From,
        toNumber: To,
        recordingUrl: RecordingUrl,
        recordingSid: RecordingSid,
        duration: RecordingDuration ? parseInt(RecordingDuration) : 0,
        transcription: TranscriptionText || null,
        transcriptionStatus: TranscriptionStatus || "pending",
        status: "new",
        organizationId,
      },
    });

    // Update call log to mark as voicemail
    await prisma.callLog.updateMany({
      where: { callSid: CallSid },
      data: {
        status: "VOICEMAIL",
        recordingUrl: RecordingUrl,
        recordingSid: RecordingSid,
        recordingDuration: RecordingDuration ? parseInt(RecordingDuration) : 0,
      },
    });

    // Send notifications
    if (org) {
      await sendVoicemailNotifications(voicemail, org);
    }

    console.log("✅ Voicemail processed:", voicemail.id);
    return voicemail;
  } catch (error) {
    console.error("❌ Voicemail processing error:", error);
    throw error;
  }
}

/**
 * Request transcription for a voicemail
 * Uses Twilio's built-in transcription or OpenAI Whisper
 */
async function transcribeVoicemail(voicemailId, organizationId) {
  try {
    const voicemail = await prisma.voicemail.findUnique({
      where: { id: voicemailId },
    });

    if (!voicemail) {
      throw new Error("Voicemail not found");
    }

    if (voicemail.transcription) {
      return { success: true, transcription: voicemail.transcription };
    }

    // If we have a recording URL, we can use OpenAI Whisper
    if (voicemail.recordingUrl && process.env.OPENAI_API_KEY) {
      const OpenAI = require("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Download the recording
      const response = await fetch(voicemail.recordingUrl + ".mp3");
      const audioBuffer = await response.arrayBuffer();

      // Create a File object for Whisper
      const audioFile = new File([audioBuffer], "voicemail.mp3", {
        type: "audio/mpeg",
      });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "en",
      });

      // Update voicemail with transcription
      await prisma.voicemail.update({
        where: { id: voicemailId },
        data: {
          transcription: transcription.text,
          transcriptionStatus: "completed",
        },
      });

      return { success: true, transcription: transcription.text };
    }

    return { success: false, error: "No recording URL or transcription service available" };
  } catch (error) {
    console.error("❌ Transcription error:", error);

    await prisma.voicemail.update({
      where: { id: voicemailId },
      data: { transcriptionStatus: "failed" },
    });

    return { success: false, error: error.message };
  }
}

/**
 * Send voicemail notifications (email, SMS, webhook)
 */
async function sendVoicemailNotifications(voicemail, organization) {
  try {
    const notifications = [];

    // Get notification settings
    const notifyOnVoicemail = organization.notifyOnMissedCall; // Reuse missed call setting

    if (!notifyOnVoicemail) {
      return notifications;
    }

    // 1. Email notification to owners/admins
    const admins = organization.memberships
      ?.filter((m) => ["OWNER", "ADMIN"].includes(m.role))
      ?.map((m) => m.user);

    if (admins?.length > 0) {
      const { sendEmail } = require("./emailService");

      for (const admin of admins) {
        if (admin?.email) {
          await sendEmail({
            to: admin.email,
            subject: `New Voicemail from ${voicemail.fromNumber}`,
            html: `
              <h2>New Voicemail Received</h2>
              <p><strong>From:</strong> ${voicemail.fromNumber}</p>
              <p><strong>Duration:</strong> ${voicemail.duration} seconds</p>
              ${voicemail.transcription ? `<p><strong>Transcription:</strong> ${voicemail.transcription}</p>` : ""}
              <p><a href="${process.env.FRONTEND_URL}/calls?voicemail=${voicemail.id}">Listen to voicemail</a></p>
            `,
            text: `New voicemail from ${voicemail.fromNumber}. Duration: ${voicemail.duration}s. ${voicemail.transcription || ""}`,
          });
          notifications.push({ type: "email", to: admin.email, status: "sent" });
        }
      }
    }

    // 2. Slack notification
    if (organization.slackWebhookUrl) {
      await fetch(organization.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `📨 New voicemail from ${voicemail.fromNumber}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*New Voicemail*\n📞 From: ${voicemail.fromNumber}\n⏱️ Duration: ${voicemail.duration}s${voicemail.transcription ? `\n📝 "${voicemail.transcription}"` : ""}`,
              },
            },
          ],
        }),
      });
      notifications.push({ type: "slack", status: "sent" });
    }

    // 3. Teams notification
    if (organization.teamsWebhookUrl) {
      await fetch(organization.teamsWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          summary: "New Voicemail",
          sections: [
            {
              activityTitle: `New Voicemail from ${voicemail.fromNumber}`,
              facts: [
                { name: "Duration", value: `${voicemail.duration} seconds` },
                ...(voicemail.transcription
                  ? [{ name: "Transcription", value: voicemail.transcription }]
                  : []),
              ],
            },
          ],
        }),
      });
      notifications.push({ type: "teams", status: "sent" });
    }

    return notifications;
  } catch (error) {
    console.error("❌ Voicemail notification error:", error);
    return [];
  }
}

/**
 * Get voicemails for an organization
 */
async function getVoicemails(organizationId, options = {}) {
  const { status, limit = 50, offset = 0 } = options;

  const where = {
    organizationId,
    ...(status && { status }),
  };

  const [voicemails, total] = await Promise.all([
    prisma.voicemail.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.voicemail.count({ where }),
  ]);

  return { voicemails, total };
}

/**
 * Mark voicemail as read/listened
 */
async function markVoicemailAsRead(voicemailId, userId) {
  return prisma.voicemail.update({
    where: { id: voicemailId },
    data: {
      status: "read",
      readAt: new Date(),
      readBy: userId,
    },
  });
}

/**
 * Delete voicemail (and optionally the recording from Twilio)
 */
async function deleteVoicemail(voicemailId, organizationId, deleteRecording = false) {
  const voicemail = await prisma.voicemail.findUnique({
    where: { id: voicemailId },
  });

  if (!voicemail || voicemail.organizationId !== organizationId) {
    throw new Error("Voicemail not found or access denied");
  }

  // Delete recording from Twilio if requested
  if (deleteRecording && voicemail.recordingSid) {
    try {
      const client = await getClientForOrganization(organizationId);
      await client.recordings(voicemail.recordingSid).remove();
      console.log("🗑️ Recording deleted from Twilio:", voicemail.recordingSid);
    } catch (err) {
      console.error("⚠️ Failed to delete recording from Twilio:", err);
    }
  }

  // Delete from database
  await prisma.voicemail.delete({
    where: { id: voicemailId },
  });

  return { success: true };
}

/**
 * Generate TwiML for voicemail greeting
 */
function generateVoicemailGreeting(organization) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const greeting =
    organization?.afterHoursGreeting ||
    `Thank you for calling ${organization?.name || "us"}. We're currently unavailable. Please leave a message after the beep and we'll get back to you as soon as possible.`;

  twiml.say({ voice: "Polly.Amy" }, greeting);
  twiml.record({
    maxLength: 120,
    transcribe: true,
    transcribeCallback: `${process.env.PUBLIC_BASE_URL}/twilio/voicemail/transcription`,
    recordingStatusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/voicemail/callback`,
    recordingStatusCallbackEvent: "completed",
    playBeep: true,
  });
  twiml.say({ voice: "Polly.Amy" }, "We did not receive your message. Goodbye.");
  twiml.hangup();

  return twiml.toString();
}

module.exports = {
  processVoicemail,
  transcribeVoicemail,
  sendVoicemailNotifications,
  getVoicemails,
  markVoicemailAsRead,
  deleteVoicemail,
  generateVoicemailGreeting,
};
