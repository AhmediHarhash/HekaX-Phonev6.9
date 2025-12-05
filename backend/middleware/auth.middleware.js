// ============================================================================
// HEKAX Phone - Auth Middleware
// Enhanced with refresh token support and strict security
// ============================================================================

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../lib/prisma");

// ============================================================================
// CONFIGURATION
// ============================================================================

// JWT Secret - MUST be set in environment
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

// Token expiration times
const ACCESS_TOKEN_EXPIRY = "1h"; // 1 hour
const REFRESH_TOKEN_EXPIRY = "7d"; // 7 days

// Validate secrets on module load
if (!JWT_SECRET) {
  console.error("❌ CRITICAL: JWT_SECRET environment variable is not set");
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error("❌ CRITICAL: JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

// ============================================================================
// TOKEN GENERATION
// ============================================================================

/**
 * Create access token (short-lived)
 * @param {Object} user - User object
 * @param {string} organizationId - Organization ID
 * @returns {string} JWT access token
 */
function createAccessToken(user, organizationId) {
  return jwt.sign(
    {
      userId: user.id,
      organizationId: organizationId || user.organizationId || user.currentOrgId,
      type: "access",
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Create refresh token (long-lived)
 * @param {Object} user - User object
 * @returns {Object} Refresh token and its hash for storage
 */
function createRefreshToken(user) {
  const tokenId = crypto.randomUUID();

  const token = jwt.sign(
    {
      userId: user.id,
      tokenId,
      type: "refresh",
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  // Hash for database storage (we never store the actual token)
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  return {
    token,
    tokenId,
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  };
}

/**
 * Create both tokens for a user
 * @param {Object} user - User object
 * @param {string} organizationId - Organization ID
 * @returns {Object} Access and refresh tokens
 */
function createTokenPair(user, organizationId) {
  const accessToken = createAccessToken(user, organizationId);
  const refreshToken = createRefreshToken(user);

  return {
    accessToken,
    refreshToken: refreshToken.token,
    tokenId: refreshToken.tokenId,
    tokenHash: refreshToken.tokenHash,
    expiresAt: refreshToken.expiresAt,
  };
}

/**
 * Verify access token
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== "access") {
      return null;
    }
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    if (decoded.type !== "refresh") {
      return null;
    }
    return decoded;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

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
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return res.status(401).json({
        error: "Invalid or expired token",
        code: "TOKEN_EXPIRED",
      });
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

    if (user.status === "SUSPENDED") {
      return res.status(403).json({ error: "Account suspended" });
    }

    // Determine active organization (multi-org support)
    let activeOrgId = user.currentOrgId;
    let activeOrg = null;
    let userRole = null;

    // Check for X-Organization-Id header (allows switching org per request)
    const headerOrgId = req.headers["x-organization-id"];
    if (headerOrgId) {
      // SECURITY: Strictly validate membership for header-specified org
      const membership = user.memberships.find((m) => m.organizationId === headerOrgId);
      if (!membership) {
        return res.status(403).json({
          error: "Access denied",
          message: "You are not a member of this organization",
        });
      }
      activeOrgId = headerOrgId;
      activeOrg = membership.organization;
      userRole = membership.role;
    } else if (activeOrgId) {
      // Use currentOrgId if no header
      const membership = user.memberships.find((m) => m.organizationId === activeOrgId);
      if (membership) {
        activeOrg = membership.organization;
        userRole = membership.role;
      }
    }

    // Fallback to primary membership or first membership
    if (!activeOrg && user.memberships.length > 0) {
      const primaryMembership =
        user.memberships.find((m) => m.isPrimary) || user.memberships[0];
      activeOrg = primaryMembership.organization;
      activeOrgId = primaryMembership.organizationId;
      userRole = primaryMembership.role;
    }

    // Legacy fallback to direct organization relation
    if (!activeOrg && user.organization) {
      activeOrg = user.organization;
      activeOrgId = user.organizationId;
      userRole = "OWNER"; // Legacy users are owners
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
 * Optional auth middleware
 * Attaches user if token present, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(); // No token, continue without user
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    if (decoded) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          organization: true,
          memberships: { include: { organization: true } },
        },
      });

      if (user && user.status !== "SUSPENDED") {
        req.user = user;
        req.organizationId = decoded.organizationId;
      }
    }

    next();
  } catch (error) {
    // Silently continue without user
    next();
  }
};

// ============================================================================
// ROLE GUARD MIDDLEWARE
// ============================================================================

/**
 * Role guard middleware
 * Requires user to have one of the specified roles in current org
 * @param {...string} roles - Allowed roles
 */
const requireRole = (...roles) => {
  // Handle both array and spread arguments
  const allowedRoles = roles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
        required: allowedRoles,
        current: req.userRole,
      });
    }

    next();
  };
};

/**
 * Require owner role
 */
const requireOwner = requireRole("OWNER");

/**
 * Require admin or higher
 */
const requireAdmin = requireRole("OWNER", "ADMIN");

/**
 * Require manager or higher
 */
const requireManager = requireRole("OWNER", "ADMIN", "MANAGER");

// ============================================================================
// REFRESH TOKEN MIDDLEWARE
// ============================================================================

/**
 * Refresh token endpoint middleware
 * Validates refresh token and issues new token pair
 */
const handleRefreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    // Verify the refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        error: "Invalid refresh token",
        code: "REFRESH_TOKEN_INVALID",
      });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        memberships: { include: { organization: true } },
      },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({ error: "Account suspended" });
    }

    // Determine active organization
    let activeOrg = null;
    let userRole = "AGENT";

    if (user.currentOrgId) {
      const membership = user.memberships.find(
        (m) => m.organizationId === user.currentOrgId
      );
      if (membership) {
        activeOrg = membership.organization;
        userRole = membership.role;
      }
    }

    if (!activeOrg && user.memberships.length > 0) {
      const primaryMembership =
        user.memberships.find((m) => m.isPrimary) || user.memberships[0];
      activeOrg = primaryMembership.organization;
      userRole = primaryMembership.role;
    }

    if (!activeOrg) {
      return res.status(403).json({ error: "No organization access" });
    }

    // Create new token pair
    const tokens = createTokenPair(user, activeOrg.id);

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 3600, // 1 hour in seconds
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: userRole,
      },
      organization: {
        id: activeOrg.id,
        name: activeOrg.name,
        slug: activeOrg.slug,
      },
    });
  } catch (error) {
    console.error("❌ Refresh token error:", error);
    return res.status(500).json({ error: "Token refresh failed" });
  }
};

// ============================================================================
// LEGACY SUPPORT
// ============================================================================

/**
 * Create token (legacy - creates access token only)
 * @deprecated Use createTokenPair instead
 */
const createToken = (user) => {
  return createAccessToken(user, user.organizationId || user.currentOrgId);
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Middleware
  authMiddleware,
  optionalAuth,
  requireRole,
  requireOwner,
  requireAdmin,
  requireManager,
  handleRefreshToken,

  // Token functions
  createAccessToken,
  createRefreshToken,
  createTokenPair,
  verifyAccessToken,
  verifyRefreshToken,

  // Legacy
  createToken,

  // Constants
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  JWT_SECRET,
};
