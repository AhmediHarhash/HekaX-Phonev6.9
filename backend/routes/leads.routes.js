// ============================================================================
// HEKAX Phone - Leads Routes
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth.middleware");
const automationService = require("../services/automation.service");

const router = express.Router();

/**
 * GET /api/leads
 * Get all leads for organization
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { status, urgency, limit = 50 } = req.query;

    const where = {
      organizationId: req.organizationId,
      ...(status && status !== 'all' && { status: status.toUpperCase() }),
      ...(urgency && { urgency: urgency.toUpperCase() }),
    };

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit, 10),
    });

    res.json(leads);
  } catch (err) {
    console.error("❌ GET /api/leads error:", err);
    res.status(500).json({ error: "Failed to load leads" });
  }
});

/**
 * GET /api/leads/:id
 * Get single lead
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await prisma.lead.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json(lead);
  } catch (err) {
    console.error("❌ GET /api/leads/:id error:", err);
    res.status(500).json({ error: "Failed to load lead" });
  }
});

/**
 * PATCH /api/leads/:id
 * Update lead
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, urgency, notes, assignedToId } = req.body;

    // Verify lead belongs to org
    const lead = await prisma.lead.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const oldStatus = lead.status;

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(urgency && { urgency }),
        ...(notes !== undefined && { notes }),
        ...(assignedToId !== undefined && { assignedToId }),
      },
    });

    // Emit automation events
    automationService.emit(
      automationService.EVENTS.LEAD_UPDATED,
      req.organizationId,
      updated
    );

    // Check for status change
    if (status && status !== oldStatus) {
      automationService.emit(
        automationService.EVENTS.LEAD_STATUS_CHANGED,
        req.organizationId,
        { ...updated, previousStatus: oldStatus }
      );
    }

    // Check for assignment
    if (assignedToId && assignedToId !== lead.assignedToId) {
      automationService.emit(
        automationService.EVENTS.LEAD_ASSIGNED,
        req.organizationId,
        { ...updated, assignedBy: req.userId }
      );
    }

    res.json(updated);
  } catch (err) {
    console.error("❌ PATCH /api/leads/:id error:", err);
    res.status(500).json({ error: "Failed to update lead" });
  }
});

module.exports = router;
