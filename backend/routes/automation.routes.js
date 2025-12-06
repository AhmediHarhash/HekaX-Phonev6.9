// ============================================================================
// HEKAX Phone - Automation Routes
// API endpoints for automation rules management
// ============================================================================

const express = require("express");
const { authMiddleware } = require("../middleware/auth.middleware");
const automationService = require("../services/automation.service");
const schedulerService = require("../services/scheduler.service");

const router = express.Router();

/**
 * GET /api/automation/rules
 * Get all automation rules
 */
router.get("/rules", authMiddleware, async (req, res) => {
  try {
    const rules = await automationService.getAutomationRules(req.organizationId);
    res.json({ rules });
  } catch (err) {
    console.error("❌ GET /api/automation/rules error:", err);
    res.status(500).json({ error: "Failed to get automation rules" });
  }
});

/**
 * POST /api/automation/rules
 * Create a new automation rule
 */
router.post("/rules", authMiddleware, async (req, res) => {
  try {
    const rule = await automationService.saveAutomationRule(
      req.organizationId,
      req.body
    );
    res.status(201).json({ rule });
  } catch (err) {
    console.error("❌ POST /api/automation/rules error:", err);
    res.status(500).json({ error: "Failed to create automation rule" });
  }
});

/**
 * PUT /api/automation/rules/:id
 * Update an automation rule
 */
router.put("/rules/:id", authMiddleware, async (req, res) => {
  try {
    const rule = await automationService.saveAutomationRule(req.organizationId, {
      ...req.body,
      id: req.params.id,
    });
    res.json({ rule });
  } catch (err) {
    console.error("❌ PUT /api/automation/rules/:id error:", err);
    res.status(500).json({ error: "Failed to update automation rule" });
  }
});

/**
 * DELETE /api/automation/rules/:id
 * Delete an automation rule
 */
router.delete("/rules/:id", authMiddleware, async (req, res) => {
  try {
    await automationService.deleteAutomationRule(
      req.params.id,
      req.organizationId
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /api/automation/rules/:id error:", err);
    res.status(500).json({ error: "Failed to delete automation rule" });
  }
});

/**
 * GET /api/automation/logs
 * Get automation execution logs
 */
router.get("/logs", authMiddleware, async (req, res) => {
  try {
    const { status, ruleId, limit, offset } = req.query;

    const result = await automationService.getAutomationLogs(
      req.organizationId,
      {
        status,
        ruleId,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      }
    );

    res.json(result);
  } catch (err) {
    console.error("❌ GET /api/automation/logs error:", err);
    res.status(500).json({ error: "Failed to get automation logs" });
  }
});

/**
 * GET /api/automation/events
 * Get available event types
 */
router.get("/events", authMiddleware, (req, res) => {
  res.json({
    events: Object.entries(automationService.EVENTS).map(([key, value]) => ({
      key,
      value,
      label: key.replace(/_/g, " ").toLowerCase(),
    })),
  });
});

/**
 * POST /api/automation/test
 * Test an automation rule with sample data
 */
router.post("/test", authMiddleware, async (req, res) => {
  try {
    const { rule, sampleData } = req.body;

    // Temporarily create rule in memory and test
    const results = await automationService.executeRules(
      req.organizationId,
      rule.triggerEvent,
      sampleData
    );

    res.json({ results, tested: true });
  } catch (err) {
    console.error("❌ POST /api/automation/test error:", err);
    res.status(500).json({ error: "Failed to test automation rule" });
  }
});

/**
 * POST /api/automation/trigger
 * Manually trigger an event (for testing)
 */
router.post("/trigger", authMiddleware, async (req, res) => {
  try {
    const { eventType, eventData } = req.body;

    if (!eventType) {
      return res.status(400).json({ error: "eventType is required" });
    }

    const results = await automationService.emit(
      eventType,
      req.organizationId,
      eventData || {}
    );

    res.json({ triggered: true, results });
  } catch (err) {
    console.error("❌ POST /api/automation/trigger error:", err);
    res.status(500).json({ error: "Failed to trigger automation" });
  }
});

/**
 * GET /api/automation/scheduler/status
 * Get scheduler status and job info
 */
router.get("/scheduler/status", authMiddleware, (req, res) => {
  res.json({
    jobs: Object.entries(schedulerService.SCHEDULED_JOBS).map(([name, job]) => ({
      name,
      interval: job.interval,
      intervalHuman: formatInterval(job.interval),
    })),
  });
});

/**
 * POST /api/automation/scheduler/run/:job
 * Manually run a scheduled job
 */
router.post("/scheduler/run/:job", authMiddleware, async (req, res) => {
  try {
    const job = req.params.job;
    const handler = schedulerService[job];

    if (!handler || typeof handler !== "function") {
      return res.status(404).json({ error: "Job not found" });
    }

    await handler();
    res.json({ success: true, job });
  } catch (err) {
    console.error(`❌ POST /api/automation/scheduler/run/${req.params.job} error:`, err);
    res.status(500).json({ error: `Failed to run job: ${err.message}` });
  }
});

/**
 * GET /api/automation/templates
 * Get pre-built automation templates
 */
router.get("/templates", authMiddleware, (req, res) => {
  res.json({
    templates: [
      {
        id: "welcome_sms",
        name: "Welcome SMS on New Lead",
        description: "Send a welcome SMS when a new lead is created from a call",
        triggerEvent: "lead:created",
        conditions: [{ field: "phone", operator: "exists", value: true }],
        actions: [
          {
            type: "sendSms",
            phoneField: "phone",
            message:
              "Hi {{name}}, thank you for calling {{organizationName}}! We'll be in touch soon.",
          },
        ],
      },
      {
        id: "hot_lead_notify",
        name: "Notify Team on Hot Lead",
        description: "Send internal notification when a hot lead is detected",
        triggerEvent: "lead:updated",
        conditions: [{ field: "temperature", operator: "equals", value: "HOT" }],
        actions: [
          {
            type: "notify",
            title: "Hot Lead Alert",
            message: "{{name}} ({{phone}}) is a hot lead! Reason: {{reason}}",
          },
        ],
      },
      {
        id: "missed_call_followup",
        name: "Follow-up on Missed Calls",
        description: "Send SMS when a call is missed",
        triggerEvent: "call:missed",
        conditions: [],
        actions: [
          {
            type: "sendSms",
            phoneField: "fromNumber",
            message:
              "We missed your call to {{organizationName}}. We'll call you back shortly!",
          },
        ],
      },
      {
        id: "auto_assign_lead",
        name: "Auto-Assign Leads",
        description: "Automatically assign new leads using round-robin",
        triggerEvent: "lead:created",
        conditions: [],
        actions: [
          {
            type: "assignLead",
            strategy: "roundRobin",
          },
        ],
      },
      {
        id: "crm_sync",
        name: "Sync to CRM on Status Change",
        description: "Sync lead to CRM when status changes",
        triggerEvent: "lead:statusChanged",
        conditions: [],
        actions: [
          {
            type: "syncCrm",
          },
        ],
      },
      {
        id: "appointment_confirm",
        name: "Appointment Confirmation",
        description: "Send confirmation SMS when appointment is booked",
        triggerEvent: "appointment:booked",
        conditions: [],
        actions: [
          {
            type: "sendSms",
            phoneField: "callerPhone",
            message:
              "Your appointment with {{organizationName}} is confirmed for {{scheduledAt}}. We look forward to seeing you!",
          },
        ],
      },
      {
        id: "noshow_followup",
        name: "No-Show Follow-up",
        description: "Send SMS when appointment is marked as no-show",
        triggerEvent: "appointment:noShow",
        conditions: [],
        actions: [
          {
            type: "sendSms",
            phoneField: "callerPhone",
            message:
              "We missed you at your appointment today. Would you like to reschedule? Reply YES to rebook.",
          },
        ],
      },
      {
        id: "feedback_applied",
        name: "AI Improvement Notification",
        description: "Notify when AI feedback is applied",
        triggerEvent: "feedback:approved",
        conditions: [],
        actions: [
          {
            type: "notify",
            title: "AI Improved",
            message: "A correction has been applied to improve AI responses.",
          },
        ],
      },
    ],
  });
});

/**
 * POST /api/automation/templates/:id/install
 * Install a template as a new rule
 */
router.post("/templates/:id/install", authMiddleware, async (req, res) => {
  try {
    const templates = {
      welcome_sms: {
        name: "Welcome SMS on New Lead",
        triggerEvent: "lead:created",
        conditions: [{ field: "phone", operator: "exists", value: true }],
        actions: [
          {
            type: "sendSms",
            phoneField: "phone",
            message:
              "Hi {{name}}, thank you for calling! We'll be in touch soon.",
          },
        ],
      },
      // Add more templates as needed
    };

    const template = templates[req.params.id];
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    const rule = await automationService.saveAutomationRule(
      req.organizationId,
      template
    );

    res.status(201).json({ rule });
  } catch (err) {
    console.error("❌ POST /api/automation/templates/:id/install error:", err);
    res.status(500).json({ error: "Failed to install template" });
  }
});

// Helper to format interval
function formatInterval(ms) {
  if (ms < 60000) return `${ms / 1000} seconds`;
  if (ms < 3600000) return `${ms / 60000} minutes`;
  if (ms < 86400000) return `${ms / 3600000} hours`;
  return `${ms / 86400000} days`;
}

module.exports = router;
