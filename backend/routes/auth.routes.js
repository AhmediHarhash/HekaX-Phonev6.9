// ============================================================================
// HEKAX Phone - Auth Routes
// Enhanced with security features
// ============================================================================

const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const {
  authMiddleware,
  createTokenPair,
  handleRefreshToken,
} = require("../middleware/auth.middleware");
const {
  authLimiter,
  registerLimiter,
  checkAccountLockout,
  recordFailedLogin,
  clearFailedLogins,
  getLockoutRemaining,
} = require("../middleware/security.middleware");
const {
  validateBody,
  authSchemas,
} = require("../middleware/validation.middleware");
const twilioService = require("../services/twilio.service");

const router = express.Router();

// ============================================================================
// HELPER: Safe user response (removes sensitive fields)
// ============================================================================

function safeUserResponse(user, role) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: role || user.role,
    status: user.status,
    avatar: user.avatar,
    onboardingCompleted: user.organization?.onboardingCompleted || false,
    organizationCount: user.memberships?.length || 1,
  };
}

function safeOrgResponse(org) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    status: org.status,
    aiEnabled: org.aiEnabled,
    greeting: org.greeting,
    voiceId: org.voiceId,
    primaryColor: org.primaryColor,
    twilioNumber: org.twilioNumber,
    onboardingCompleted: org.onboardingCompleted,
    industry: org.industry,
    // Usage info (non-sensitive)
    monthlyCallMinutes: org.monthlyCallMinutes,
    monthlyAIMinutes: org.monthlyAIMinutes,
    usedCallMinutes: org.usedCallMinutes,
    usedAIMinutes: org.usedAIMinutes,
  };
}

// ============================================================================
// POST /auth/register
// Creates a new organization + admin user + Twilio subaccount
// ============================================================================

router.post(
  "/register",
  registerLimiter,
  validateBody(authSchemas.register),
  async (req, res) => {
    try {
      const { orgName, organizationName, email, password, name } = req.body;
      const orgNameFinal = orgName || organizationName;

      const normalizedEmail = email.toLowerCase().trim();

      // Check if email exists
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Create slug from org name
      const slug = orgNameFinal
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      // Check if slug exists
      const existingOrg = await prisma.organization.findUnique({
        where: { slug },
      });
      if (existingOrg) {
        return res.status(400).json({ error: "Organization name taken" });
      }

      // Hash password with higher cost
      const passwordHash = await bcrypt.hash(password, 12);

      // Create org + user + membership in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Calculate trial end date (7 days from now)
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 7);

        const org = await tx.organization.create({
          data: {
            name: orgNameFinal,
            slug,
            greeting: `Thank you for calling ${orgNameFinal}. How may I help you?`,
            plan: "TRIAL",
            status: "TRIAL",
            trialEndsAt,
            // Trial limits
            monthlyCallMinutes: 200,
            monthlyAIMinutes: 100,
            maxUsers: 2,
            maxPhoneNumbers: 1,
          },
        });

        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            name,
            organizationId: org.id,
            currentOrgId: org.id,
            status: "ACTIVE",
          },
        });

        // Create membership
        await tx.userOrganization.create({
          data: {
            userId: user.id,
            organizationId: org.id,
            role: "OWNER",
            isPrimary: true,
            acceptedAt: new Date(),
          },
        });

        return { org, user };
      });

      // Full Twilio provisioning (async, don't block registration)
      // Creates: Subaccount + TwiML App + API Key
      twilioService.provisionOrganization(result.org.id, orgNameFinal)
        .then((provisionResult) => {
          console.log("✅ Full Twilio provisioning complete for:", orgNameFinal);
          console.log("   Subaccount:", provisionResult.subaccount?.sid);
          console.log("   TwiML App:", provisionResult.twimlApp?.sid);
        })
        .catch((twilioErr) => {
          console.error("⚠️ Twilio provisioning failed:", twilioErr.message);
          // User can still use the app, just need to provision later
        });

      // Create token pair
      const tokens = createTokenPair(result.user, result.org.id);

      console.log(
        "✅ New registration:",
        result.user.email,
        "| Org:",
        result.org.name
      );

      res.status(201).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 3600,
        user: safeUserResponse(result.user, "OWNER"),
        organization: safeOrgResponse(result.org),
      });
    } catch (error) {
      console.error("❌ Register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  }
);

// ============================================================================
// POST /auth/login
// ============================================================================

router.post(
  "/login",
  authLimiter,
  checkAccountLockout,
  validateBody(authSchemas.login),
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: {
          organization: true,
          memberships: {
            include: { organization: true },
            orderBy: { isPrimary: "desc" },
          },
        },
      });

      if (!user) {
        // Record failed attempt (even for non-existent users to prevent enumeration)
        recordFailedLogin(normalizedEmail);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check if account is active
      if (user.status === "SUSPENDED") {
        return res.status(403).json({ error: "Account suspended" });
      }

      if (user.status === "INVITED") {
        return res.status(403).json({
          error: "Account not activated",
          message: "Please accept your invitation to set your password",
        });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        const isLocked = recordFailedLogin(normalizedEmail);
        if (isLocked) {
          const remaining = getLockoutRemaining(normalizedEmail);
          return res.status(423).json({
            error: "Account temporarily locked",
            message: `Too many failed attempts. Try again in ${Math.ceil(remaining / 60)} minutes.`,
            retryAfter: remaining,
          });
        }
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Clear failed login attempts on success
      clearFailedLogins(normalizedEmail);

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

      if (!activeOrg && user.organization) {
        activeOrg = user.organization;
        userRole = "OWNER";
      }

      if (!activeOrg) {
        return res.status(403).json({ error: "No organization access" });
      }

      // Update last login and current org
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: req.ip,
          currentOrgId: activeOrg.id,
        },
      });

      // Create token pair
      const tokens = createTokenPair(user, activeOrg.id);

      console.log("✅ Login:", user.email, "| Org:", activeOrg.name);

      res.json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 3600,
        user: safeUserResponse({ ...user, organization: activeOrg }, userRole),
        organization: safeOrgResponse(activeOrg),
      });
    } catch (error) {
      console.error("❌ Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  }
);

// ============================================================================
// POST /auth/refresh
// Refresh access token using refresh token
// ============================================================================

router.post("/refresh", handleRefreshToken);

// ============================================================================
// POST /auth/logout
// Invalidate refresh token (client should discard tokens)
// ============================================================================

router.post("/logout", authMiddleware, async (req, res) => {
  try {
    // For now, just acknowledge logout
    // In a full implementation, you'd blacklist the refresh token

    console.log("✅ Logout:", req.user.email);

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// ============================================================================
// GET /auth/me
// Returns current user + org
// ============================================================================

router.get("/me", authMiddleware, (req, res) => {
  res.json({
    user: safeUserResponse(req.user, req.userRole),
    organization: safeOrgResponse(req.user.organization),
  });
});

module.exports = router;
