// ============================================================================
// HEKAX Phone - Audit Logging Middleware
// Phase 5: Multi-tenant SaaS Infrastructure
// ============================================================================

const prisma = require("../lib/prisma");

// Actions that should be logged
const AUDITABLE_ACTIONS = {
  // Auth
  LOGIN: "user.login",
  LOGOUT: "user.logout",
  PASSWORD_CHANGE: "user.password_change",
  
  // Team
  TEAM_INVITE: "team.invite",
  TEAM_UPDATE: "team.update",
  TEAM_REMOVE: "team.remove",
  
  // Organization
  ORG_UPDATE: "organization.update",
  ORG_SETTINGS: "organization.settings",
  
  // Phone Numbers
  PHONE_ADD: "phone.add",
  PHONE_UPDATE: "phone.update",
  PHONE_REMOVE: "phone.remove",
  
  // Leads
  LEAD_UPDATE: "lead.update",
  LEAD_ASSIGN: "lead.assign",
  LEAD_STATUS: "lead.status",
  
  // API
  API_KEY_CREATE: "api.key_create",
  API_KEY_REVOKE: "api.key_revoke",
  
  // Billing
  PLAN_CHANGE: "billing.plan_change",
  PAYMENT_UPDATE: "billing.payment_update",
};

/**
 * Create an audit log entry
 */
async function createAuditLog({
  actorType = "user",
  actorId,
  actorEmail,
  action,
  entityType,
  entityId,
  oldValues,
  newValues,
  ipAddress,
  userAgent,
  organizationId,
  metadata,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType,
        actorId,
        actorEmail,
        action,
        entityType,
        entityId,
        oldValues: oldValues ? JSON.stringify(oldValues) : null,
        newValues: newValues ? JSON.stringify(newValues) : null,
        ipAddress,
        userAgent,
        organizationId,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
    
    console.log(`📝 Audit: ${action} by ${actorEmail || actorId || "system"}`);
  } catch (error) {
    console.error("❌ Audit log error:", error);
    // Don't throw - audit logging should not break the main flow
  }
}

/**
 * Audit logging middleware
 * Automatically logs actions based on route and method
 */
function auditMiddleware(action, entityType) {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json to capture response
    res.json = function (data) {
      // Only log successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        createAuditLog({
          actorType: "user",
          actorId: req.user?.id,
          actorEmail: req.user?.email,
          action,
          entityType,
          entityId: req.params.id || data?.id,
          oldValues: req.auditOldValues,
          newValues: req.body,
          ipAddress: req.ip || req.headers["x-forwarded-for"],
          userAgent: req.headers["user-agent"],
          organizationId: req.organizationId,
        });
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Log authentication events
 */
async function logAuthEvent(type, user, req, success = true) {
  await createAuditLog({
    actorType: "user",
    actorId: user?.id,
    actorEmail: user?.email,
    action: type,
    entityType: "user",
    entityId: user?.id,
    ipAddress: req.ip || req.headers["x-forwarded-for"],
    userAgent: req.headers["user-agent"],
    organizationId: user?.organizationId,
    metadata: { success },
  });
}

/**
 * Log system events
 */
async function logSystemEvent(action, details, organizationId = null) {
  await createAuditLog({
    actorType: "system",
    action,
    entityType: "system",
    organizationId,
    metadata: details,
  });
}

/**
 * Get audit logs for an organization
 */
async function getAuditLogs(organizationId, options = {}) {
  const {
    limit = 50,
    offset = 0,
    action,
    actorId,
    entityType,
    startDate,
    endDate,
  } = options;

  const where = {
    organizationId,
    ...(action && { action }),
    ...(actorId && { actorId }),
    ...(entityType && { entityType }),
    ...(startDate && { createdAt: { gte: new Date(startDate) } }),
    ...(endDate && { createdAt: { lte: new Date(endDate) } }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs: logs.map((log) => ({
      ...log,
      oldValues: log.oldValues ? JSON.parse(log.oldValues) : null,
      newValues: log.newValues ? JSON.parse(log.newValues) : null,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    })),
    total,
    hasMore: offset + logs.length < total,
  };
}

module.exports = {
  AUDITABLE_ACTIONS,
  createAuditLog,
  auditMiddleware,
  logAuthEvent,
  logSystemEvent,
  getAuditLogs,
};
