// ============================================================================
// HEKAX Phone - Data Export Service
// Phase 6.5: GDPR/CCPA compliant data export
// ============================================================================

const prisma = require("../lib/prisma");
const fs = require("fs").promises;
const path = require("path");
const archiver = require("archiver");
const { createWriteStream } = require("fs");

// Export directory
const EXPORT_DIR = process.env.EXPORT_DIR || "/tmp/hekax-exports";

/**
 * Initialize export directory
 */
async function ensureExportDir() {
  try {
    await fs.mkdir(EXPORT_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

/**
 * Export all data for an organization (GDPR full export)
 */
async function exportAllData(organizationId, requestId) {
  await ensureExportDir();
  
  const exportPath = path.join(EXPORT_DIR, `export-${requestId}`);
  await fs.mkdir(exportPath, { recursive: true });

  try {
    // Update request status
    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: { status: "processing" },
    });

    // Get organization data
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        industry: true,
        timezone: true,
        createdAt: true,
        plan: true,
      },
    });

    // Export organization info
    await fs.writeFile(
      path.join(exportPath, "organization.json"),
      JSON.stringify(org, null, 2)
    );

    // Export users
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        timezone: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    await fs.writeFile(
      path.join(exportPath, "users.json"),
      JSON.stringify(users, null, 2)
    );

    // Export call logs
    const calls = await prisma.callLog.findMany({
      where: { organizationId },
      select: {
        id: true,
        callSid: true,
        direction: true,
        fromNumber: true,
        toNumber: true,
        status: true,
        duration: true,
        handledBy: true,
        summary: true,
        sentiment: true,
        createdAt: true,
        endedAt: true,
      },
    });
    await fs.writeFile(
      path.join(exportPath, "calls.json"),
      JSON.stringify(calls, null, 2)
    );

    // Export leads
    const leads = await prisma.lead.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        company: true,
        status: true,
        temperature: true,
        source: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await fs.writeFile(
      path.join(exportPath, "leads.json"),
      JSON.stringify(leads, null, 2)
    );

    // Export transcripts
    const transcripts = await prisma.transcript.findMany({
      where: { organizationId },
      select: {
        id: true,
        callId: true,
        content: true,
        speakerLabels: true,
        language: true,
        createdAt: true,
      },
    });
    await fs.writeFile(
      path.join(exportPath, "transcripts.json"),
      JSON.stringify(transcripts, null, 2)
    );

    // Export phone numbers
    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: { organizationId },
      select: {
        id: true,
        number: true,
        friendlyName: true,
        capabilities: true,
        status: true,
        createdAt: true,
      },
    });
    await fs.writeFile(
      path.join(exportPath, "phone_numbers.json"),
      JSON.stringify(phoneNumbers, null, 2)
    );

    // Create ZIP archive
    const zipPath = path.join(EXPORT_DIR, `export-${requestId}.zip`);
    await createZipArchive(exportPath, zipPath);

    // Get file size
    const stats = await fs.stat(zipPath);

    // Calculate expiry (7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update request with download info
    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: {
        status: "completed",
        fileUrl: `/api/data/exports/${requestId}/download`,
        fileSize: stats.size,
        expiresAt,
        completedAt: new Date(),
      },
    });

    // Clean up temp directory
    await fs.rm(exportPath, { recursive: true, force: true });

    return { success: true, zipPath, fileSize: stats.size };
  } catch (error) {
    console.error("Export error:", error);
    
    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: {
        status: "failed",
        errorMessage: error.message,
      },
    });

    // Clean up on error
    try {
      await fs.rm(exportPath, { recursive: true, force: true });
    } catch {}

    return { success: false, error: error.message };
  }
}

/**
 * Export calls only
 */
async function exportCalls(organizationId, requestId, format = "json") {
  await ensureExportDir();
  
  try {
    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: { status: "processing" },
    });

    const calls = await prisma.callLog.findMany({
      where: { organizationId },
      include: {
        transcripts: {
          select: { content: true },
        },
      },
    });

    const filePath = path.join(EXPORT_DIR, `calls-${requestId}.${format}`);
    
    if (format === "csv") {
      const csv = convertToCSV(calls, [
        "id", "callSid", "direction", "fromNumber", "toNumber",
        "status", "duration", "summary", "createdAt"
      ]);
      await fs.writeFile(filePath, csv);
    } else {
      await fs.writeFile(filePath, JSON.stringify(calls, null, 2));
    }

    const stats = await fs.stat(filePath);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: {
        status: "completed",
        fileUrl: `/api/data/exports/${requestId}/download`,
        fileSize: stats.size,
        expiresAt,
        completedAt: new Date(),
      },
    });

    return { success: true, filePath };
  } catch (error) {
    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: { status: "failed", errorMessage: error.message },
    });
    return { success: false, error: error.message };
  }
}

/**
 * Export leads only
 */
async function exportLeads(organizationId, requestId, format = "json") {
  await ensureExportDir();
  
  try {
    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: { status: "processing" },
    });

    const leads = await prisma.lead.findMany({
      where: { organizationId },
    });

    const filePath = path.join(EXPORT_DIR, `leads-${requestId}.${format}`);
    
    if (format === "csv") {
      const csv = convertToCSV(leads, [
        "id", "name", "phone", "email", "company",
        "status", "temperature", "source", "notes", "createdAt"
      ]);
      await fs.writeFile(filePath, csv);
    } else {
      await fs.writeFile(filePath, JSON.stringify(leads, null, 2));
    }

    const stats = await fs.stat(filePath);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: {
        status: "completed",
        fileUrl: `/api/data/exports/${requestId}/download`,
        fileSize: stats.size,
        expiresAt,
        completedAt: new Date(),
      },
    });

    return { success: true, filePath };
  } catch (error) {
    await prisma.dataExportRequest.update({
      where: { id: requestId },
      data: { status: "failed", errorMessage: error.message },
    });
    return { success: false, error: error.message };
  }
}

/**
 * Create ZIP archive from directory
 */
function createZipArchive(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(archive.pointer()));
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

/**
 * Convert array of objects to CSV
 */
function convertToCSV(data, columns) {
  if (!data.length) return columns.join(",") + "\n";

  const header = columns.join(",");
  const rows = data.map(row => {
    return columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return JSON.stringify(val).replace(/"/g, '""');
      if (typeof val === "string" && (val.includes(",") || val.includes('"') || val.includes("\n"))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(",");
  });

  return [header, ...rows].join("\n");
}

/**
 * Get export file path
 * SECURITY: Validates type and ensures path stays within EXPORT_DIR
 */
function getExportFilePath(requestId, type) {
  // SECURITY: Whitelist valid export types to prevent path traversal
  const validTypes = {
    full_export: { prefix: "export", ext: "zip" },
    calls_only: { prefix: "calls", ext: "json" },
    leads_only: { prefix: "leads", ext: "json" },
    transcripts_only: { prefix: "transcripts", ext: "json" },
  };

  const typeConfig = validTypes[type];
  if (!typeConfig) {
    throw new Error(`Invalid export type: ${type}`);
  }

  // SECURITY: Sanitize requestId to prevent path traversal
  // Only allow alphanumeric characters and hyphens (UUIDs)
  const sanitizedId = requestId.replace(/[^a-zA-Z0-9-]/g, "");
  if (sanitizedId !== requestId || !sanitizedId) {
    throw new Error("Invalid request ID");
  }

  const filename = `${typeConfig.prefix}-${sanitizedId}.${typeConfig.ext}`;
  const filePath = path.join(EXPORT_DIR, filename);

  // SECURITY: Verify resolved path is within EXPORT_DIR (prevent path traversal)
  const resolvedPath = path.resolve(filePath);
  const resolvedExportDir = path.resolve(EXPORT_DIR);
  if (!resolvedPath.startsWith(resolvedExportDir + path.sep)) {
    throw new Error("Invalid file path");
  }

  return filePath;
}

/**
 * Clean up expired exports
 */
async function cleanupExpiredExports() {
  const expired = await prisma.dataExportRequest.findMany({
    where: {
      status: "completed",
      expiresAt: { lt: new Date() },
    },
  });

  for (const request of expired) {
    try {
      const filePath = getExportFilePath(request.id, request.type);
      await fs.unlink(filePath);
    } catch {}

    await prisma.dataExportRequest.update({
      where: { id: request.id },
      data: { status: "expired", fileUrl: null },
    });
  }

  return expired.length;
}

module.exports = {
  exportAllData,
  exportCalls,
  exportLeads,
  getExportFilePath,
  cleanupExpiredExports,
  EXPORT_DIR,
};
