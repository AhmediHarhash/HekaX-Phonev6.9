// ============================================================================
// HEKAX Phone - Calls Routes
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth.middleware");

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

module.exports = router;
