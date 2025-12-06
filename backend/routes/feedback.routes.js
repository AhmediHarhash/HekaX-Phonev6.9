// ============================================================================
// HEKAX Phone - AI Feedback Routes
// API endpoints for AI feedback and improvement system
// ============================================================================

const express = require("express");
const { authMiddleware } = require("../middleware/auth.middleware");
const feedbackService = require("../services/feedback.service");
const automationService = require("../services/automation.service");

const router = express.Router();

/**
 * POST /api/feedback
 * Submit feedback for an AI response
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const feedback = await feedbackService.submitFeedback(
      req.organizationId,
      req.userId,
      req.body
    );

    // Emit automation event for feedback
    automationService.emit(
      automationService.EVENTS.FEEDBACK_SUBMITTED,
      req.organizationId,
      feedback
    );

    res.status(201).json({ feedback });
  } catch (err) {
    console.error("❌ POST /api/feedback error:", err);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

/**
 * GET /api/feedback
 * Get all feedback for organization
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { status, feedbackType, category, startDate, endDate, limit, offset } =
      req.query;

    const result = await feedbackService.getFeedback(req.organizationId, {
      status,
      feedbackType,
      category,
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });

    res.json(result);
  } catch (err) {
    console.error("❌ GET /api/feedback error:", err);
    res.status(500).json({ error: "Failed to get feedback" });
  }
});

/**
 * GET /api/feedback/stats
 * Get feedback statistics
 */
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await feedbackService.getFeedbackStats(
      req.organizationId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json(stats);
  } catch (err) {
    console.error("❌ GET /api/feedback/stats error:", err);
    res.status(500).json({ error: "Failed to get feedback stats" });
  }
});

/**
 * GET /api/feedback/call/:callId
 * Get feedback for a specific call
 */
router.get("/call/:callId", authMiddleware, async (req, res) => {
  try {
    const feedback = await feedbackService.getCallFeedback(
      req.params.callId,
      req.organizationId
    );
    res.json({ feedback });
  } catch (err) {
    console.error("❌ GET /api/feedback/call/:callId error:", err);
    res.status(500).json({ error: "Failed to get call feedback" });
  }
});

/**
 * PUT /api/feedback/:id/status
 * Update feedback status (review/apply/reject)
 */
router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status, reviewNotes } = req.body;

    if (!["PENDING", "REVIEWED", "APPLIED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const feedback = await feedbackService.updateFeedbackStatus(
      req.params.id,
      req.organizationId,
      status,
      reviewNotes
    );

    // Emit automation event if feedback was approved
    if (status === "APPLIED") {
      automationService.emit(
        automationService.EVENTS.FEEDBACK_APPROVED,
        req.organizationId,
        feedback
      );
    }

    res.json({ feedback });
  } catch (err) {
    console.error("❌ PUT /api/feedback/:id/status error:", err);
    res.status(500).json({ error: "Failed to update feedback status" });
  }
});

/**
 * GET /api/feedback/learning-queue
 * Get items in learning queue
 */
router.get("/learning-queue", authMiddleware, async (req, res) => {
  try {
    const { status, limit } = req.query;

    const queue = await feedbackService.getLearningQueue(req.organizationId, {
      status,
      limit: limit ? parseInt(limit) : 50,
    });

    res.json({ queue });
  } catch (err) {
    console.error("❌ GET /api/feedback/learning-queue error:", err);
    res.status(500).json({ error: "Failed to get learning queue" });
  }
});

/**
 * POST /api/feedback/learning-queue/:id/process
 * Process a learning queue item
 */
router.post("/learning-queue/:id/process", authMiddleware, async (req, res) => {
  try {
    const { success, message } = req.body;

    const item = await feedbackService.processLearningItem(
      req.params.id,
      req.organizationId,
      { success, message }
    );

    res.json({ item });
  } catch (err) {
    console.error("❌ POST /api/feedback/learning-queue/:id/process error:", err);
    res.status(500).json({ error: "Failed to process learning item" });
  }
});

/**
 * GET /api/feedback/improvement-metrics
 * Get AI improvement metrics over time
 */
router.get("/improvement-metrics", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const metrics = await feedbackService.getImprovementMetrics(
      req.organizationId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json(metrics);
  } catch (err) {
    console.error("❌ GET /api/feedback/improvement-metrics error:", err);
    res.status(500).json({ error: "Failed to get improvement metrics" });
  }
});

/**
 * GET /api/feedback/patterns
 * Get common correction patterns
 */
router.get("/patterns", authMiddleware, async (req, res) => {
  try {
    const { limit } = req.query;

    const patterns = await feedbackService.getCorrectionPatterns(
      req.organizationId,
      limit ? parseInt(limit) : 20
    );

    res.json({ patterns });
  } catch (err) {
    console.error("❌ GET /api/feedback/patterns error:", err);
    res.status(500).json({ error: "Failed to get correction patterns" });
  }
});

/**
 * GET /api/feedback/export
 * Export feedback for training
 */
router.get("/export", authMiddleware, async (req, res) => {
  try {
    const { minRating, includeCorrections } = req.query;

    const data = await feedbackService.exportFeedbackForTraining(
      req.organizationId,
      {
        minRating: minRating ? parseInt(minRating) : 4,
        includeCorrections: includeCorrections !== "false",
      }
    );

    res.json({ data, count: data.length });
  } catch (err) {
    console.error("❌ GET /api/feedback/export error:", err);
    res.status(500).json({ error: "Failed to export feedback" });
  }
});

module.exports = router;
