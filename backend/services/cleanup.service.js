// ============================================================================
// HEKAX Phone - Data Cleanup Service
// Phase 6.5: Automated data retention & cleanup
// ============================================================================

const prisma = require("../lib/prisma");

/**
 * Calculate cutoff date based on retention days
 */
function getCutoffDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Clean up old call logs for an organization
 */
async function cleanupCallLogs(organizationId, retentionDays, dryRun = false) {
  const cutoffDate = getCutoffDate(retentionDays);
  
  const count = await prisma.callLog.count({
    where: {
      organizationId,
      createdAt: { lt: cutoffDate },
    },
  });

  if (!dryRun && count > 0) {
    await prisma.callLog.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: cutoffDate },
      },
    });
  }

  return { type: "calls", count, cutoffDate };
}

/**
 * Clean up old transcripts for an organization
 */
async function cleanupTranscripts(organizationId, retentionDays, dryRun = false) {
  const cutoffDate = getCutoffDate(retentionDays);
  
  const count = await prisma.transcript.count({
    where: {
      organizationId,
      createdAt: { lt: cutoffDate },
    },
  });

  if (!dryRun && count > 0) {
    await prisma.transcript.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: cutoffDate },
      },
    });
  }

  return { type: "transcripts", count, cutoffDate };
}

/**
 * Clean up old closed leads for an organization
 */
async function cleanupLeads(organizationId, retentionDays, dryRun = false) {
  const cutoffDate = getCutoffDate(retentionDays);
  
  // Only delete closed/converted leads, not active ones
  const count = await prisma.lead.count({
    where: {
      organizationId,
      status: { in: ["CLOSED", "CONVERTED", "LOST"] },
      updatedAt: { lt: cutoffDate },
    },
  });

  if (!dryRun && count > 0) {
    await prisma.lead.deleteMany({
      where: {
        organizationId,
        status: { in: ["CLOSED", "CONVERTED", "LOST"] },
        updatedAt: { lt: cutoffDate },
      },
    });
  }

  return { type: "leads", count, cutoffDate };
}

/**
 * Clean up old audit logs for an organization
 */
async function cleanupAuditLogs(organizationId, retentionDays, dryRun = false) {
  const cutoffDate = getCutoffDate(retentionDays);
  
  const count = await prisma.auditLog.count({
    where: {
      organizationId,
      createdAt: { lt: cutoffDate },
    },
  });

  if (!dryRun && count > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: cutoffDate },
      },
    });
  }

  return { type: "audit_logs", count, cutoffDate };
}

/**
 * Clean up old usage logs for an organization
 */
async function cleanupUsageLogs(organizationId, retentionDays = 90, dryRun = false) {
  const cutoffDate = getCutoffDate(retentionDays);
  
  const count = await prisma.usageLog.count({
    where: {
      organizationId,
      createdAt: { lt: cutoffDate },
    },
  });

  if (!dryRun && count > 0) {
    await prisma.usageLog.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: cutoffDate },
      },
    });
  }

  return { type: "usage_logs", count, cutoffDate };
}

/**
 * Clean up dismissed alerts
 */
async function cleanupAlerts(organizationId, retentionDays = 30, dryRun = false) {
  const cutoffDate = getCutoffDate(retentionDays);
  
  const count = await prisma.usageAlert.count({
    where: {
      organizationId,
      dismissed: true,
      dismissedAt: { lt: cutoffDate },
    },
  });

  if (!dryRun && count > 0) {
    await prisma.usageAlert.deleteMany({
      where: {
        organizationId,
        dismissed: true,
        dismissedAt: { lt: cutoffDate },
      },
    });
  }

  return { type: "alerts", count, cutoffDate };
}

/**
 * Run full cleanup for an organization
 */
async function runOrganizationCleanup(organizationId, options = {}) {
  const { dryRun = false, triggeredBy = "system" } = options;

  // Get org retention settings
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      retentionEnabled: true,
      retentionCallDays: true,
      retentionTranscriptDays: true,
      retentionLeadDays: true,
      retentionAuditDays: true,
    },
  });

  if (!org || !org.retentionEnabled) {
    return { skipped: true, reason: "Retention disabled" };
  }

  const results = [];
  let totalDeleted = 0;

  try {
    // Clean up each data type
    const callResult = await cleanupCallLogs(organizationId, org.retentionCallDays, dryRun);
    results.push(callResult);
    totalDeleted += callResult.count;

    const transcriptResult = await cleanupTranscripts(organizationId, org.retentionTranscriptDays, dryRun);
    results.push(transcriptResult);
    totalDeleted += transcriptResult.count;

    const leadResult = await cleanupLeads(organizationId, org.retentionLeadDays, dryRun);
    results.push(leadResult);
    totalDeleted += leadResult.count;

    const auditResult = await cleanupAuditLogs(organizationId, org.retentionAuditDays, dryRun);
    results.push(auditResult);
    totalDeleted += auditResult.count;

    const usageResult = await cleanupUsageLogs(organizationId, 90, dryRun);
    results.push(usageResult);
    totalDeleted += usageResult.count;

    const alertResult = await cleanupAlerts(organizationId, 30, dryRun);
    results.push(alertResult);
    totalDeleted += alertResult.count;

    // Update last cleanup timestamp
    if (!dryRun) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { lastCleanupAt: new Date() },
      });

      // Log cleanup
      if (totalDeleted > 0) {
        await prisma.cleanupLog.create({
          data: {
            type: triggeredBy === "system" ? "scheduled" : "manual",
            dataType: "all",
            recordsDeleted: totalDeleted,
            cutoffDate: new Date(),
            status: "completed",
            triggeredBy,
            organizationId,
          },
        });
      }
    }

    return {
      success: true,
      dryRun,
      results,
      totalDeleted,
    };
  } catch (error) {
    console.error("Cleanup error:", error);
    
    if (!dryRun) {
      await prisma.cleanupLog.create({
        data: {
          type: triggeredBy === "system" ? "scheduled" : "manual",
          dataType: "all",
          recordsDeleted: 0,
          cutoffDate: new Date(),
          status: "failed",
          errorMessage: error.message,
          triggeredBy,
          organizationId,
        },
      });
    }

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Run cleanup for all organizations (scheduled job)
 */
async function runSystemCleanup() {
  console.log("🧹 Starting system-wide data cleanup...");
  
  const orgs = await prisma.organization.findMany({
    where: { retentionEnabled: true },
    select: { id: true, name: true },
  });

  const results = [];
  
  for (const org of orgs) {
    try {
      const result = await runOrganizationCleanup(org.id, { triggeredBy: "system" });
      results.push({ orgId: org.id, name: org.name, ...result });
      
      if (result.totalDeleted > 0) {
        console.log(`  ✅ ${org.name}: Deleted ${result.totalDeleted} records`);
      }
    } catch (error) {
      console.error(`  ❌ ${org.name}: ${error.message}`);
      results.push({ orgId: org.id, name: org.name, error: error.message });
    }
  }

  console.log(`🧹 Cleanup complete. Processed ${orgs.length} organizations.`);
  
  return results;
}

/**
 * Get cleanup statistics for an organization
 */
async function getCleanupStats(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      retentionEnabled: true,
      retentionCallDays: true,
      retentionTranscriptDays: true,
      retentionRecordingDays: true,
      retentionLeadDays: true,
      retentionAuditDays: true,
      lastCleanupAt: true,
    },
  });

  if (!org) return null;

  // Count records that would be deleted
  const preview = {
    calls: await prisma.callLog.count({
      where: {
        organizationId,
        createdAt: { lt: getCutoffDate(org.retentionCallDays) },
      },
    }),
    transcripts: await prisma.transcript.count({
      where: {
        organizationId,
        createdAt: { lt: getCutoffDate(org.retentionTranscriptDays) },
      },
    }),
    leads: await prisma.lead.count({
      where: {
        organizationId,
        status: { in: ["CLOSED", "CONVERTED", "LOST"] },
        updatedAt: { lt: getCutoffDate(org.retentionLeadDays) },
      },
    }),
    auditLogs: await prisma.auditLog.count({
      where: {
        organizationId,
        createdAt: { lt: getCutoffDate(org.retentionAuditDays) },
      },
    }),
  };

  // Get total counts
  const totals = {
    calls: await prisma.callLog.count({ where: { organizationId } }),
    transcripts: await prisma.transcript.count({ where: { organizationId } }),
    leads: await prisma.lead.count({ where: { organizationId } }),
    auditLogs: await prisma.auditLog.count({ where: { organizationId } }),
  };

  // Get recent cleanup logs
  const recentCleanups = await prisma.cleanupLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    settings: org,
    preview,
    totals,
    recentCleanups,
  };
}

module.exports = {
  cleanupCallLogs,
  cleanupTranscripts,
  cleanupLeads,
  cleanupAuditLogs,
  cleanupUsageLogs,
  cleanupAlerts,
  runOrganizationCleanup,
  runSystemCleanup,
  getCleanupStats,
  getCutoffDate,
};
