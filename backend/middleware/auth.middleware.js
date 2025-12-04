// ============================================================================
// HEKAX Phone - Auth Middleware
// Phase 6.3: Updated for Multi-Org Support
// ============================================================================

const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");

// JWT Secret - should be in environment variable in production
const JWT_SECRET = process.env.JWT_SECRET || "hekax-super-secret-change-in-prod";

/**
 * Authentication middleware
 * Validates JWT token and attaches user/org to request
 * Supports multi-org: uses currentOrgId or falls back to membership
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token === "null" || token === "undefined") {
      return res.status(401).json({ error: "Invalid token format" });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.log("❌ JWT verify failed:", jwtError.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Get user with organization and memberships
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { 
        organization: true,
        memberships: {
          include: { organization: true },
          orderBy: { isPrimary: "desc" },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: "Account suspended" });
    }

    // Determine active organization (multi-org support)
    let activeOrgId = user.currentOrgId;
    let activeOrg = null;
    let userRole = null;

    // Check for X-Organization-Id header (allows switching org per request)
    const headerOrgId = req.headers['x-organization-id'];
    if (headerOrgId) {
      activeOrgId = headerOrgId;
    }

    if (activeOrgId) {
      // Find membership for active org
      const membership = user.memberships.find(m => m.organizationId === activeOrgId);
      if (membership) {
        activeOrg = membership.organization;
        userRole = membership.role;
      }
    }

    // Fallback to primary membership or first membership
    if (!activeOrg && user.memberships.length > 0) {
      const primaryMembership = user.memberships.find(m => m.isPrimary) || user.memberships[0];
      activeOrg = primaryMembership.organization;
      activeOrgId = primaryMembership.organizationId;
      userRole = primaryMembership.role;
    }

    // Legacy fallback to direct organization relation
    if (!activeOrg && user.organization) {
      activeOrg = user.organization;
      activeOrgId = user.organizationId;
      userRole = user.role || "AGENT";
    }

    if (!activeOrg) {
      return res.status(403).json({ error: "No organization access" });
    }

    // Attach to request
    req.user = {
      ...user,
      role: userRole,
      organization: activeOrg,
    };
    req.organizationId = activeOrgId;
    req.userRole = userRole;

    next();
  } catch (error) {
    console.error("❌ Auth middleware error:", error.message);
    return res.status(401).json({ error: "Authentication failed" });
  }
};

/**
 * Role guard middleware
 * Requires user to have one of the specified roles in current org
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
};

/**
 * Create JWT token for user
 */
const createToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      // Note: organizationId in token is just for reference, 
      // actual org is determined by currentOrgId or membership
      organizationId: user.organizationId || user.currentOrgId,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};

module.exports = {
  authMiddleware,
  requireRole,
  createToken,
  JWT_SECRET,
};
