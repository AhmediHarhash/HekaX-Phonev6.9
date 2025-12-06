// ============================================================================
// HEKAX Phone - Routing Routes
// API endpoints for call routing rules management
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth.middleware");
const routingService = require("../services/routing.service");

const router = express.Router();

/**
 * GET /api/routing/rules
 * Get all routing rules for organization
 */
router.get("/rules", authMiddleware, async (req, res) => {
  try {
    const rules = await routingService.getRoutingRules(req.organizationId);
    res.json({ rules });
  } catch (err) {
    console.error("❌ GET /api/routing/rules error:", err);
    res.status(500).json({ error: "Failed to get routing rules" });
  }
});

/**
 * POST /api/routing/rules
 * Create a new routing rule
 */
router.post("/rules", authMiddleware, async (req, res) => {
  try {
    const rule = await routingService.saveRoutingRule(req.organizationId, req.body);
    res.status(201).json({ rule });
  } catch (err) {
    console.error("❌ POST /api/routing/rules error:", err);
    res.status(500).json({ error: "Failed to create routing rule" });
  }
});

/**
 * PUT /api/routing/rules/:id
 * Update a routing rule
 */
router.put("/rules/:id", authMiddleware, async (req, res) => {
  try {
    const rule = await routingService.saveRoutingRule(req.organizationId, {
      ...req.body,
      id: req.params.id,
    });
    res.json({ rule });
  } catch (err) {
    console.error("❌ PUT /api/routing/rules/:id error:", err);
    res.status(500).json({ error: "Failed to update routing rule" });
  }
});

/**
 * DELETE /api/routing/rules/:id
 * Delete a routing rule
 */
router.delete("/rules/:id", authMiddleware, async (req, res) => {
  try {
    await routingService.deleteRoutingRule(req.params.id, req.organizationId);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /api/routing/rules/:id error:", err);
    res.status(500).json({ error: "Failed to delete routing rule" });
  }
});

/**
 * POST /api/routing/test
 * Test routing for a phone number (simulates routing decision)
 */
router.post("/test", authMiddleware, async (req, res) => {
  try {
    const { fromNumber, toNumber } = req.body;

    if (!fromNumber) {
      return res.status(400).json({ error: "fromNumber is required" });
    }

    const routingDecision = await routingService.routeCall(
      req.organizationId,
      fromNumber,
      toNumber || ""
    );

    res.json({ routingDecision });
  } catch (err) {
    console.error("❌ POST /api/routing/test error:", err);
    res.status(500).json({ error: "Failed to test routing" });
  }
});

/**
 * GET /api/routing/business-hours
 * Get business hours configuration
 */
router.get("/business-hours", authMiddleware, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: {
        businessHours: true,
        timezone: true,
        afterHoursMode: true,
        afterHoursGreeting: true,
        afterHoursForwardNumber: true,
      },
    });

    const isCurrentlyOpen = routingService.checkBusinessHours(
      org?.businessHours,
      org?.timezone
    );

    res.json({
      businessHours: org?.businessHours,
      timezone: org?.timezone || "America/New_York",
      afterHoursMode: org?.afterHoursMode || "ai",
      afterHoursGreeting: org?.afterHoursGreeting,
      afterHoursForwardNumber: org?.afterHoursForwardNumber,
      isCurrentlyOpen,
    });
  } catch (err) {
    console.error("❌ GET /api/routing/business-hours error:", err);
    res.status(500).json({ error: "Failed to get business hours" });
  }
});

/**
 * PUT /api/routing/business-hours
 * Update business hours configuration
 */
router.put("/business-hours", authMiddleware, async (req, res) => {
  try {
    const {
      businessHours,
      timezone,
      afterHoursMode,
      afterHoursGreeting,
      afterHoursForwardNumber,
    } = req.body;

    const org = await prisma.organization.update({
      where: { id: req.organizationId },
      data: {
        businessHours,
        timezone,
        afterHoursMode,
        afterHoursGreeting,
        afterHoursForwardNumber,
      },
      select: {
        businessHours: true,
        timezone: true,
        afterHoursMode: true,
        afterHoursGreeting: true,
        afterHoursForwardNumber: true,
      },
    });

    res.json({
      ...org,
      isCurrentlyOpen: routingService.checkBusinessHours(
        org.businessHours,
        org.timezone
      ),
    });
  } catch (err) {
    console.error("❌ PUT /api/routing/business-hours error:", err);
    res.status(500).json({ error: "Failed to update business hours" });
  }
});

/**
 * GET /api/routing/departments
 * Get list of departments with agents
 */
router.get("/departments", authMiddleware, async (req, res) => {
  try {
    const members = await prisma.userOrganization.findMany({
      where: {
        organizationId: req.organizationId,
        status: "ACTIVE",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    // Group by department
    const departments = {};
    members.forEach((m) => {
      const dept = m.department || "General";
      if (!departments[dept]) {
        departments[dept] = [];
      }
      departments[dept].push({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        phone: m.user.phone,
        role: m.role,
      });
    });

    res.json({ departments });
  } catch (err) {
    console.error("❌ GET /api/routing/departments error:", err);
    res.status(500).json({ error: "Failed to get departments" });
  }
});

module.exports = router;
