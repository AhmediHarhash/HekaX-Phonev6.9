// ============================================================================
// HEKAX Phone - Data Management Routes
// Phase 6.5: Data Retention, Cleanup & Export
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { createAuditLog } = require("../middleware/audit.middleware");
const {
  runOrganizationCleanup,
  getCleanupStats,
} = require("../services/cleanup.service");
const {
  exportAllData,
  exportCalls,
  exportLeads,
  getExportFilePath,
  EXPORT_DIR,
} = require("../services/export.service");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// ============================================================================
// RETENTION SETTINGS
// ============================================================================

/**
 * GET /api/data/retention
 * Get data retention settings
 */
router.get("/retention", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const stats = await getCleanupStats(req.organizationId);
    
    if (!stats) {
      return res.status(404).json({ error: "Organization not found" });
    }

    res.json(stats);
  } catch (err) {
    console.error("❌ GET /api/data/retention error:", err);
    res.status(500).json({ error: "Failed to get retention settings" });
  }
});

/**
 * PATCH /api/data/retention
 * Update retention settings
 */
router.patch("/retention", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const {
      retentionEnabled,
      retentionCallDays,
      retentionTranscriptDays,
      retentionRecordingDays,
      retentionLeadDays,
      retentionAuditDays,
    } = req.body;

    // Validate retention periods (min 7 days, max 730 days / 2 years)
    const validateDays = (days) => {
      if (days === undefined) return undefined;
      const num = parseInt(days);
      if (isNaN(num) || num < 7 || num > 730) return undefined;
      return num;
    };

    const oldSettings = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: {
        retentionEnabled: true,
        retentionCallDays: true,
        retentionTranscriptDays: true,
        retentionRecordingDays: true,
        retentionLeadDays: true,
        retentionAuditDays: true,
      },
    });

    const updated = await prisma.organization.update({
      where: { id: req.organizationId },
      data: {
        ...(retentionEnabled !== undefined && { retentionEnabled }),
        ...(validateDays(retentionCallDays) && { retentionCallDays: validateDays(retentionCallDays) }),
        ...(validateDays(retentionTranscriptDays) && { retentionTranscriptDays: validateDays(retentionTranscriptDays) }),
        ...(validateDays(retentionRecordingDays) && { retentionRecordingDays: validateDays(retentionRecordingDays) }),
        ...(validateDays(retentionLeadDays) && { retentionLeadDays: validateDays(retentionLeadDays) }),
        ...(validateDays(retentionAuditDays) && { retentionAuditDays: validateDays(retentionAuditDays) }),
      },
      select: {
        retentionEnabled: true,
        retentionCallDays: true,
        retentionTranscriptDays: true,
        retentionRecordingDays: true,
        retentionLeadDays: true,
        retentionAuditDays: true,
      },
    });

    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "retention.settings.update",
      entityType: "organization",
      entityId: req.organizationId,
      oldValues: oldSettings,
      newValues: updated,
      organizationId: req.organizationId,
    });

    res.json(updated);
  } catch (err) {
    console.error("❌ PATCH /api/data/retention error:", err);
    res.status(500).json({ error: "Failed to update retention settings" });
  }
});

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * POST /api/data/cleanup/preview
 * Preview what would be deleted (dry run)
 */
router.post("/cleanup/preview", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const result = await runOrganizationCleanup(req.organizationId, {
      dryRun: true,
      triggeredBy: req.user.id,
    });

    res.json(result);
  } catch (err) {
    console.error("❌ POST /api/data/cleanup/preview error:", err);
    res.status(500).json({ error: "Failed to preview cleanup" });
  }
});

/**
 * POST /api/data/cleanup/run
 * Run manual cleanup
 */
router.post("/cleanup/run", authMiddleware, requireRole("OWNER"), async (req, res) => {
  try {
    const result = await runOrganizationCleanup(req.organizationId, {
      dryRun: false,
      triggeredBy: req.user.id,
    });

    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "data.cleanup.manual",
      entityType: "organization",
      entityId: req.organizationId,
      newValues: { totalDeleted: result.totalDeleted },
      organizationId: req.organizationId,
    });

    res.json(result);
  } catch (err) {
    console.error("❌ POST /api/data/cleanup/run error:", err);
    res.status(500).json({ error: "Failed to run cleanup" });
  }
});

/**
 * GET /api/data/cleanup/logs
 * Get cleanup history
 */
router.get("/cleanup/logs", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const logs = await prisma.cleanupLog.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json(logs);
  } catch (err) {
    console.error("❌ GET /api/data/cleanup/logs error:", err);
    res.status(500).json({ error: "Failed to get cleanup logs" });
  }
});

// ============================================================================
// DATA EXPORT
// ============================================================================

/**
 * GET /api/data/exports
 * List export requests
 */
router.get("/exports", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const exports = await prisma.dataExportRequest.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { requestedAt: "desc" },
      take: 20,
    });

    res.json(exports);
  } catch (err) {
    console.error("❌ GET /api/data/exports error:", err);
    res.status(500).json({ error: "Failed to get exports" });
  }
});

/**
 * POST /api/data/exports
 * Request a new data export
 */
router.post("/exports", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { type = "full_export", format = "json" } = req.body;

    const validTypes = ["full_export", "calls_only", "leads_only", "transcripts_only"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: "Invalid export type" });
    }

    // Check for pending exports
    const pending = await prisma.dataExportRequest.count({
      where: {
        organizationId: req.organizationId,
        status: { in: ["pending", "processing"] },
      },
    });

    if (pending > 0) {
      return res.status(400).json({ error: "An export is already in progress" });
    }

    // Create export request
    const request = await prisma.dataExportRequest.create({
      data: {
        type,
        format,
        requestedBy: req.user.id,
        organizationId: req.organizationId,
      },
    });

    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "data.export.request",
      entityType: "data_export",
      entityId: request.id,
      newValues: { type, format },
      organizationId: req.organizationId,
    });

    // Start export in background
    setImmediate(async () => {
      try {
        switch (type) {
          case "full_export":
            await exportAllData(req.organizationId, request.id);
            break;
          case "calls_only":
            await exportCalls(req.organizationId, request.id, format);
            break;
          case "leads_only":
            await exportLeads(req.organizationId, request.id, format);
            break;
          default:
            await exportAllData(req.organizationId, request.id);
        }
      } catch (err) {
        console.error("Export background job error:", err);
      }
    });

    res.status(202).json({
      id: request.id,
      status: "pending",
      message: "Export started. Check back for download link.",
    });
  } catch (err) {
    console.error("❌ POST /api/data/exports error:", err);
    res.status(500).json({ error: "Failed to create export" });
  }
});

/**
 * GET /api/data/exports/:id
 * Get export status
 */
router.get("/exports/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const exportReq = await prisma.dataExportRequest.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!exportReq) {
      return res.status(404).json({ error: "Export not found" });
    }

    res.json(exportReq);
  } catch (err) {
    console.error("❌ GET /api/data/exports/:id error:", err);
    res.status(500).json({ error: "Failed to get export" });
  }
});

/**
 * GET /api/data/exports/:id/download
 * Download export file
 */
router.get("/exports/:id/download", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const exportReq = await prisma.dataExportRequest.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
        status: "completed",
      },
    });

    if (!exportReq) {
      return res.status(404).json({ error: "Export not found or not ready" });
    }

    if (exportReq.expiresAt && new Date(exportReq.expiresAt) < new Date()) {
      return res.status(410).json({ error: "Export has expired" });
    }

    const filePath = getExportFilePath(id, exportReq.type);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Export file not found" });
    }

    const filename = `hekax-${exportReq.type}-${new Date().toISOString().split("T")[0]}`;
    const ext = exportReq.type === "full_export" ? "zip" : exportReq.format;

    res.download(filePath, `${filename}.${ext}`);
  } catch (err) {
    console.error("❌ GET /api/data/exports/:id/download error:", err);
    res.status(500).json({ error: "Failed to download export" });
  }
});

// ============================================================================
// GDPR DATA DELETION
// ============================================================================

/**
 * POST /api/data/delete-all
 * Delete all organization data (GDPR right to erasure)
 */
router.post("/delete-all", authMiddleware, requireRole("OWNER"), async (req, res) => {
  try {
    const { confirmPhrase } = req.body;

    // Require confirmation phrase
    if (confirmPhrase !== "DELETE ALL MY DATA") {
      return res.status(400).json({ 
        error: 'Confirmation required. Send { "confirmPhrase": "DELETE ALL MY DATA" }' 
      });
    }

    // Log before deletion
    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "data.delete_all.initiated",
      entityType: "organization",
      entityId: req.organizationId,
      organizationId: req.organizationId,
    });

    // Delete in order (respecting foreign keys)
    const deleted = {
      transcripts: 0,
      callLogs: 0,
      leads: 0,
      usageLogs: 0,
      usageAlerts: 0,
      auditLogs: 0,
    };

    // Delete transcripts
    const t = await prisma.transcript.deleteMany({ where: { organizationId: req.organizationId } });
    deleted.transcripts = t.count;

    // Delete call logs
    const c = await prisma.callLog.deleteMany({ where: { organizationId: req.organizationId } });
    deleted.callLogs = c.count;

    // Delete leads
    const l = await prisma.lead.deleteMany({ where: { organizationId: req.organizationId } });
    deleted.leads = l.count;

    // Delete usage logs
    const u = await prisma.usageLog.deleteMany({ where: { organizationId: req.organizationId } });
    deleted.usageLogs = u.count;

    // Delete alerts
    const a = await prisma.usageAlert.deleteMany({ where: { organizationId: req.organizationId } });
    deleted.usageAlerts = a.count;

    // Keep one final audit log entry
    await prisma.auditLog.deleteMany({ where: { organizationId: req.organizationId } });

    // Create deletion record
    await prisma.cleanupLog.create({
      data: {
        type: "gdpr_request",
        dataType: "all",
        recordsDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
        cutoffDate: new Date(),
        status: "completed",
        triggeredBy: req.user.id,
        organizationId: req.organizationId,
      },
    });

    console.log("🗑️ GDPR deletion completed for org:", req.organizationId);

    res.json({
      message: "All data deleted",
      deleted,
    });
  } catch (err) {
    console.error("❌ POST /api/data/delete-all error:", err);
    res.status(500).json({ error: "Failed to delete data" });
  }
});

module.exports = router;
