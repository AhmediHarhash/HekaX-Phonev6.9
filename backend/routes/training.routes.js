// ============================================================================
// HEKAX Phone - AI Training Routes
// API endpoints for custom AI training management
// ============================================================================

const express = require("express");
const { authMiddleware } = require("../middleware/auth.middleware");
const trainingService = require("../services/training.service");

const router = express.Router();

/**
 * GET /api/training
 * Get all training data
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const data = await trainingService.getTrainingData(req.organizationId);
    res.json(data);
  } catch (err) {
    console.error("❌ GET /api/training error:", err);
    res.status(500).json({ error: "Failed to get training data" });
  }
});

/**
 * GET /api/training/stats
 * Get training statistics
 */
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const stats = await trainingService.getTrainingStats(req.organizationId);
    res.json(stats);
  } catch (err) {
    console.error("❌ GET /api/training/stats error:", err);
    res.status(500).json({ error: "Failed to get training stats" });
  }
});

/**
 * GET /api/training/generate-prompt
 * Generate system prompt from training data
 */
router.get("/generate-prompt", authMiddleware, async (req, res) => {
  try {
    const prompt = await trainingService.generateSystemPrompt(req.organizationId);
    res.json({ prompt });
  } catch (err) {
    console.error("❌ GET /api/training/generate-prompt error:", err);
    res.status(500).json({ error: "Failed to generate prompt" });
  }
});

// ============================================================================
// FAQs
// ============================================================================

/**
 * POST /api/training/faqs
 * Create or update FAQ
 */
router.post("/faqs", authMiddleware, async (req, res) => {
  try {
    const faq = await trainingService.saveFAQ(req.organizationId, req.body);
    res.status(201).json({ faq });
  } catch (err) {
    console.error("❌ POST /api/training/faqs error:", err);
    res.status(500).json({ error: "Failed to save FAQ" });
  }
});

/**
 * PUT /api/training/faqs/:id
 * Update FAQ
 */
router.put("/faqs/:id", authMiddleware, async (req, res) => {
  try {
    const faq = await trainingService.saveFAQ(req.organizationId, {
      ...req.body,
      id: req.params.id,
    });
    res.json({ faq });
  } catch (err) {
    console.error("❌ PUT /api/training/faqs/:id error:", err);
    res.status(500).json({ error: "Failed to update FAQ" });
  }
});

/**
 * DELETE /api/training/faqs/:id
 * Delete FAQ
 */
router.delete("/faqs/:id", authMiddleware, async (req, res) => {
  try {
    await trainingService.deleteFAQ(req.params.id, req.organizationId);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /api/training/faqs/:id error:", err);
    res.status(500).json({ error: "Failed to delete FAQ" });
  }
});

/**
 * POST /api/training/faqs/import
 * Bulk import FAQs
 */
router.post("/faqs/import", authMiddleware, async (req, res) => {
  try {
    const { faqs } = req.body;

    if (!faqs || !Array.isArray(faqs)) {
      return res.status(400).json({ error: "faqs array is required" });
    }

    const result = await trainingService.bulkImportFAQs(req.organizationId, faqs);
    res.json(result);
  } catch (err) {
    console.error("❌ POST /api/training/faqs/import error:", err);
    res.status(500).json({ error: "Failed to import FAQs" });
  }
});

// ============================================================================
// Scripts
// ============================================================================

/**
 * POST /api/training/scripts
 * Create script
 */
router.post("/scripts", authMiddleware, async (req, res) => {
  try {
    const script = await trainingService.saveScript(req.organizationId, req.body);
    res.status(201).json({ script });
  } catch (err) {
    console.error("❌ POST /api/training/scripts error:", err);
    res.status(500).json({ error: "Failed to save script" });
  }
});

/**
 * PUT /api/training/scripts/:id
 * Update script
 */
router.put("/scripts/:id", authMiddleware, async (req, res) => {
  try {
    const script = await trainingService.saveScript(req.organizationId, {
      ...req.body,
      id: req.params.id,
    });
    res.json({ script });
  } catch (err) {
    console.error("❌ PUT /api/training/scripts/:id error:", err);
    res.status(500).json({ error: "Failed to update script" });
  }
});

/**
 * DELETE /api/training/scripts/:id
 * Delete script
 */
router.delete("/scripts/:id", authMiddleware, async (req, res) => {
  try {
    await trainingService.deleteScript(req.params.id, req.organizationId);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /api/training/scripts/:id error:", err);
    res.status(500).json({ error: "Failed to delete script" });
  }
});

// ============================================================================
// Custom Responses
// ============================================================================

/**
 * POST /api/training/responses
 * Create custom response
 */
router.post("/responses", authMiddleware, async (req, res) => {
  try {
    const response = await trainingService.saveCustomResponse(
      req.organizationId,
      req.body
    );
    res.status(201).json({ response });
  } catch (err) {
    console.error("❌ POST /api/training/responses error:", err);
    res.status(500).json({ error: "Failed to save custom response" });
  }
});

/**
 * PUT /api/training/responses/:id
 * Update custom response
 */
router.put("/responses/:id", authMiddleware, async (req, res) => {
  try {
    const response = await trainingService.saveCustomResponse(req.organizationId, {
      ...req.body,
      id: req.params.id,
    });
    res.json({ response });
  } catch (err) {
    console.error("❌ PUT /api/training/responses/:id error:", err);
    res.status(500).json({ error: "Failed to update custom response" });
  }
});

/**
 * DELETE /api/training/responses/:id
 * Delete custom response
 */
router.delete("/responses/:id", authMiddleware, async (req, res) => {
  try {
    await trainingService.deleteCustomResponse(req.params.id, req.organizationId);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /api/training/responses/:id error:", err);
    res.status(500).json({ error: "Failed to delete custom response" });
  }
});

// ============================================================================
// Knowledge Base
// ============================================================================

/**
 * POST /api/training/knowledge
 * Add knowledge entry
 */
router.post("/knowledge", authMiddleware, async (req, res) => {
  try {
    const entry = await trainingService.addKnowledgeEntry(
      req.organizationId,
      req.body
    );
    res.status(201).json({ entry });
  } catch (err) {
    console.error("❌ POST /api/training/knowledge error:", err);
    res.status(500).json({ error: "Failed to add knowledge entry" });
  }
});

/**
 * PUT /api/training/knowledge/:id
 * Update knowledge entry
 */
router.put("/knowledge/:id", authMiddleware, async (req, res) => {
  try {
    const entry = await trainingService.updateKnowledgeEntry(
      req.params.id,
      req.organizationId,
      req.body
    );
    res.json({ entry });
  } catch (err) {
    console.error("❌ PUT /api/training/knowledge/:id error:", err);
    res.status(500).json({ error: "Failed to update knowledge entry" });
  }
});

/**
 * DELETE /api/training/knowledge/:id
 * Delete knowledge entry
 */
router.delete("/knowledge/:id", authMiddleware, async (req, res) => {
  try {
    await trainingService.deleteKnowledgeEntry(req.params.id, req.organizationId);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /api/training/knowledge/:id error:", err);
    res.status(500).json({ error: "Failed to delete knowledge entry" });
  }
});

module.exports = router;
