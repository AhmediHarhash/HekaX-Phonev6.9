// ============================================================================
// HEKAX Phone - Audit Logs Routes
// Phase 5: Multi-tenant SaaS Infrastructure
// ============================================================================

const express = require("express");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { getAuditLogs } = require("../middleware/audit.middleware");

const router = express.Router();

/**
 * GET /api/audit-logs
 * Get audit logs for organization
 */
router.get("/", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      action,
      actorId,
      entityType,
      startDate,
      endDate,
    } = req.query;

    const result = await getAuditLogs(req.organizationId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      action,
      actorId,
      entityType,
      startDate,
      endDate,
    });

    res.json(result);
  } catch (err) {
    console.error("❌ GET /api/audit-logs error:", err);
    res.status(500).json({ error: "Failed to load audit logs" });
  }
});

/**
 * GET /api/audit-logs/actions
 * Get list of available action types
 */
router.get("/actions", authMiddleware, requireRole("OWNER", "ADMIN"), (req, res) => {
  res.json({
    actions: [
      { value: "user.login", label: "User Login" },
      { value: "user.logout", label: "User Logout" },
      { value: "user.password_change", label: "Password Change" },
      { value: "team.invite", label: "Team Invite" },
      { value: "team.update", label: "Team Update" },
      { value: "team.remove", label: "Team Remove" },
      { value: "organization.update", label: "Organization Update" },
      { value: "organization.settings", label: "Settings Change" },
      { value: "phone.add", label: "Phone Number Added" },
      { value: "phone.update", label: "Phone Number Update" },
      { value: "phone.remove", label: "Phone Number Removed" },
      { value: "lead.update", label: "Lead Update" },
      { value: "lead.assign", label: "Lead Assigned" },
      { value: "lead.status", label: "Lead Status Change" },
      { value: "billing.plan_change", label: "Plan Change" },
    ],
    entityTypes: [
      { value: "user", label: "User" },
      { value: "organization", label: "Organization" },
      { value: "phone_number", label: "Phone Number" },
      { value: "lead", label: "Lead" },
      { value: "call", label: "Call" },
      { value: "system", label: "System" },
    ],
  });
});

module.exports = router;
