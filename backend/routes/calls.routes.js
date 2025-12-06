// ============================================================================
// HEKAX Phone - Calls Routes
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth.middleware");
const { getClientForOrganization } = require("../services/twilio.service");

const router = express.Router();

/**
 * GET /api/calls
 * Get all calls for organization
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { limit = 50, status } = req.query;

    const where = {
      organizationId: req.organizationId,
      ...(status && status !== 'all' && { status: status.toUpperCase() }),
    };

    const calls = await prisma.callLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit, 10),
      include: {
        organization: {
          select: { name: true },
        },
      },
    });

    const shaped = calls.map((call) => ({
      id: call.id,
      callSid: call.callSid,
      direction: call.direction,
      fromNumber: call.fromNumber,
      toNumber: call.toNumber,
      status: call.status,
      duration: call.duration,
      recordingUrl: call.recordingUrl,
      createdAt: call.createdAt,
      handledByAI: call.handledByAI,
      organizationName: call.organization?.name || "Unknown",
      sentiment: call.sentiment,
      sentimentScore: call.sentimentScore,
      transferredToHuman: call.transferredToHuman,
    }));

    res.json(shaped);
  } catch (err) {
    console.error("❌ GET /api/calls error:", err);
    res.status(500).json({ error: "Failed to load calls" });
  }
});

/**
 * GET /api/calls/:id/details
 * Get call with transcript and lead
 */
router.get("/:id/details", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const call = await prisma.callLog.findUnique({
      where: { id },
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    // Verify org access
    if (call.organizationId && call.organizationId !== req.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [lead, transcript, organization] = await Promise.all([
      prisma.lead.findFirst({ where: { callSid: call.callSid } }),
      prisma.transcript.findFirst({ where: { callSid: call.callSid } }),
      call.organizationId
        ? prisma.organization.findUnique({
            where: { id: call.organizationId },
            select: { name: true },
          })
        : null,
    ]);

    res.json({
      call: {
        ...call,
        organizationName: organization?.name || null,
      },
      lead,
      transcript,
    });
  } catch (err) {
    console.error("❌ GET /api/calls/:id/details error:", err);
    res.status(500).json({ error: "Failed to load call details" });
  }
});

/**
 * GET /api/calls/:id/recording
 * Get secure recording URL for a call
 * Proxies the recording through our server for security
 */
router.get("/:id/recording", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const call = await prisma.callLog.findUnique({
      where: { id },
      select: {
        recordingUrl: true,
        recordingSid: true,
        organizationId: true,
      },
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    // Verify org access
    if (call.organizationId !== req.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!call.recordingUrl && !call.recordingSid) {
      return res.status(404).json({ error: "No recording available" });
    }

    // Option 1: Return the recording URL with auth token appended
    // Twilio recordings are publicly accessible by default, but we can
    // use the API to generate a time-limited URL

    // Option 2: Fetch from Twilio API and return metadata
    if (call.recordingSid) {
      try {
        const client = await getClientForOrganization(req.organizationId);
        const recording = await client.recordings(call.recordingSid).fetch();

        // Return recording details with multiple format URLs
        return res.json({
          sid: recording.sid,
          duration: recording.duration,
          status: recording.status,
          dateCreated: recording.dateCreated,
          // Twilio recording URLs - append format
          urls: {
            mp3: `${call.recordingUrl}.mp3`,
            wav: `${call.recordingUrl}.wav`,
          },
        });
      } catch (err) {
        console.error("⚠️ Twilio recording fetch error:", err);
        // Fall back to stored URL
      }
    }

    // Return stored URL
    res.json({
      urls: {
        mp3: call.recordingUrl ? `${call.recordingUrl}.mp3` : null,
        wav: call.recordingUrl ? `${call.recordingUrl}.wav` : null,
      },
    });
  } catch (err) {
    console.error("❌ GET /api/calls/:id/recording error:", err);
    res.status(500).json({ error: "Failed to get recording" });
  }
});

/**
 * GET /api/calls/:id/recording/stream
 * Stream the recording audio through our server
 * This adds an extra layer of security by not exposing Twilio URLs directly
 */
router.get("/:id/recording/stream", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const format = req.query.format || "mp3";

    const call = await prisma.callLog.findUnique({
      where: { id },
      select: {
        recordingUrl: true,
        organizationId: true,
      },
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    if (call.organizationId !== req.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!call.recordingUrl) {
      return res.status(404).json({ error: "No recording available" });
    }

    // Fetch from Twilio and stream to client
    const recordingUrl = `${call.recordingUrl}.${format}`;
    const response = await fetch(recordingUrl);

    if (!response.ok) {
      return res.status(404).json({ error: "Recording not found" });
    }

    // Set appropriate headers
    res.setHeader("Content-Type", format === "mp3" ? "audio/mpeg" : "audio/wav");
    res.setHeader("Accept-Ranges", "bytes");

    // Stream the response
    const reader = response.body.getReader();
    const stream = new ReadableStream({
      async start(controller) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      },
    });

    // Pipe to response
    const nodeStream = require("stream");
    const readable = nodeStream.Readable.fromWeb(stream);
    readable.pipe(res);
  } catch (err) {
    console.error("❌ Recording stream error:", err);
    res.status(500).json({ error: "Failed to stream recording" });
  }
});

/**
 * DELETE /api/calls/:id/recording
 * Delete a call recording from Twilio
 */
router.delete("/:id/recording", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const call = await prisma.callLog.findUnique({
      where: { id },
      select: {
        recordingSid: true,
        organizationId: true,
      },
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    if (call.organizationId !== req.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!call.recordingSid) {
      return res.status(404).json({ error: "No recording to delete" });
    }

    // Delete from Twilio
    const client = await getClientForOrganization(req.organizationId);
    await client.recordings(call.recordingSid).remove();

    // Update database
    await prisma.callLog.update({
      where: { id },
      data: {
        recordingUrl: null,
        recordingSid: null,
        recordingDuration: null,
      },
    });

    res.json({ success: true, message: "Recording deleted" });
  } catch (err) {
    console.error("❌ DELETE /api/calls/:id/recording error:", err);
    res.status(500).json({ error: "Failed to delete recording" });
  }
});

module.exports = router;
