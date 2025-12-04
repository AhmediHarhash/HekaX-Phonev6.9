// ============================================================================
// HEKAX Phone - API Keys Routes
// Phase 6.4: Platform API Keys for Enterprise
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { hashApiKey, generateApiKey } = require("../lib/encryption");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { createAuditLog } = require("../middleware/audit.middleware");

const router = express.Router();

// Available permissions
const PERMISSIONS = [
  { id: "calls:read", name: "Read Calls", description: "View call logs and recordings" },
  { id: "calls:write", name: "Manage Calls", description: "Initiate and manage calls" },
  { id: "leads:read", name: "Read Leads", description: "View lead information" },
  { id: "leads:write", name: "Manage Leads", description: "Create and update leads" },
  { id: "transcripts:read", name: "Read Transcripts", description: "View call transcripts" },
  { id: "analytics:read", name: "Read Analytics", description: "Access analytics data" },
  { id: "webhooks:manage", name: "Manage Webhooks", description: "Configure webhooks" },
];

/**
 * GET /api/api-keys
 * List all API keys for organization
 */
router.get("/", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { plan: true },
    });

    if (org.plan !== "ENTERPRISE") {
      return res.status(403).json({ 
        error: "API Keys is an Enterprise feature",
        isEnterprise: false,
      });
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: { 
        organizationId: req.organizationId,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    res.json({
      isEnterprise: true,
      apiKeys,
      availablePermissions: PERMISSIONS,
    });
  } catch (err) {
    console.error("❌ GET /api/api-keys error:", err);
    res.status(500).json({ error: "Failed to get API keys" });
  }
});

/**
 * POST /api/api-keys
 * Create a new API key
 */
router.post("/", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { name, permissions = [], expiresInDays } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name required" });
    }

    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { plan: true },
    });

    if (org.plan !== "ENTERPRISE") {
      return res.status(403).json({ error: "API Keys is an Enterprise feature" });
    }

    // Validate permissions
    const validPermissions = permissions.filter(p => 
      PERMISSIONS.some(perm => perm.id === p)
    );

    // Generate key
    const { key, hash, keyPrefix } = generateApiKey("hk_live_");

    // Calculate expiry
    let expiresAt = null;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        keyHash: hash,
        keyPrefix,
        permissions: validPermissions,
        expiresAt,
        createdById: req.user.id,
        organizationId: req.organizationId,
      },
    });

    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "api_key.create",
      entityType: "api_key",
      entityId: apiKey.id,
      newValues: { name, permissions: validPermissions },
      organizationId: req.organizationId,
    });

    console.log("✅ API key created:", name, "for org:", req.organizationId);

    // Return the full key ONLY on creation (never stored/shown again)
    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key, // Full key - show only once!
      keyPrefix: apiKey.keyPrefix,
      permissions: apiKey.permissions,
      expiresAt: apiKey.expiresAt,
      warning: "Save this key now - it won't be shown again!",
    });
  } catch (err) {
    console.error("❌ POST /api/api-keys error:", err);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

/**
 * PATCH /api/api-keys/:id
 * Update API key (name, permissions)
 */
router.patch("/:id", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions } = req.body;

    const existing = await prisma.apiKey.findFirst({
      where: { 
        id,
        organizationId: req.organizationId,
        revokedAt: null,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "API key not found" });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (permissions) {
      updateData.permissions = permissions.filter(p => 
        PERMISSIONS.some(perm => perm.id === p)
      );
    }

    const updated = await prisma.apiKey.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "api_key.update",
      entityType: "api_key",
      entityId: id,
      oldValues: { name: existing.name, permissions: existing.permissions },
      newValues: updateData,
      organizationId: req.organizationId,
    });

    res.json({
      id: updated.id,
      name: updated.name,
      keyPrefix: updated.keyPrefix,
      permissions: updated.permissions,
    });
  } catch (err) {
    console.error("❌ PATCH /api/api-keys/:id error:", err);
    res.status(500).json({ error: "Failed to update API key" });
  }
});

/**
 * DELETE /api/api-keys/:id
 * Revoke an API key
 */
router.delete("/:id", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.apiKey.findFirst({
      where: { 
        id,
        organizationId: req.organizationId,
        revokedAt: null,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "API key not found" });
    }

    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "api_key.revoke",
      entityType: "api_key",
      entityId: id,
      organizationId: req.organizationId,
    });

    console.log("✅ API key revoked:", id);

    res.json({ message: "API key revoked" });
  } catch (err) {
    console.error("❌ DELETE /api/api-keys/:id error:", err);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
});

/**
 * Middleware to authenticate API key requests
 * Use this on routes that should accept API key auth
 */
const apiKeyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers["x-api-key"];
    
    if (!authHeader) {
      return res.status(401).json({ error: "API key required" });
    }

    const apiKey = authHeader.replace("Bearer ", "").replace("ApiKey ", "");
    const keyHash = hashApiKey(apiKey);

    const key = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        organization: true,
      },
    });

    if (!key) {
      return res.status(401).json({ error: "Invalid or expired API key" });
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    // Attach to request
    req.apiKey = key;
    req.organizationId = key.organizationId;
    req.organization = key.organization;

    next();
  } catch (error) {
    console.error("❌ API key auth error:", error);
    return res.status(401).json({ error: "Authentication failed" });
  }
};

/**
 * Check if API key has required permission
 */
const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({ error: "API key required" });
    }

    const hasPermission = permissions.some(p => req.apiKey.permissions.includes(p));
    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Insufficient permissions",
        required: permissions,
        granted: req.apiKey.permissions,
      });
    }

    next();
  };
};

module.exports = {
  router,
  apiKeyAuth,
  requirePermission,
  PERMISSIONS,
};
