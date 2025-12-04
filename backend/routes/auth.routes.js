// ============================================================================
// HEKAX Phone - Auth Routes
// ============================================================================

const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const { authMiddleware, createToken } = require("../middleware/auth.middleware");
const twilioService = require("../services/twilio.service");

const router = express.Router();

/**
 * POST /auth/register
 * Creates a new organization + admin user + Twilio subaccount
 */
router.post("/register", async (req, res) => {
  try {
    // Accept both orgName and organizationName for compatibility
    const { orgName, organizationName, email, password, name } = req.body;
    const orgNameFinal = orgName || organizationName;

    if (!orgNameFinal || !email || !password || !name) {
      return res.status(400).json({ error: "All fields required" });
    }

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

    const passwordHash = await bcrypt.hash(password, 10);

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
          organizationId: org.id, // Legacy field
          currentOrgId: org.id,
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

    // Create Twilio subaccount (async, don't block registration)
    try {
      const subaccount = await twilioService.createSubaccount(result.org.id, orgNameFinal);
      console.log("✅ Twilio subaccount created for:", orgNameFinal, subaccount.sid);
      
      // Create TwiML App for the subaccount
      const webhookBaseUrl = process.env.PUBLIC_BASE_URL || "https://phoneapi.hekax.com";
      await twilioService.createTwimlApp(result.org.id, orgNameFinal, webhookBaseUrl);
    } catch (twilioErr) {
      // Log but don't fail registration if Twilio fails
      console.error("⚠️ Twilio subaccount creation failed:", twilioErr.message);
    }

    const token = createToken(result.user);

    console.log("✅ New registration:", result.user.email, "| Org:", result.org.name);

    res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: "OWNER",
        onboardingCompleted: false,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
        onboardingCompleted: false,
      },
    });
  } catch (error) {
    console.error("❌ Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /auth/login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

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
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Determine active organization
    let activeOrg = null;
    let userRole = "AGENT";

    // Try currentOrgId first
    if (user.currentOrgId) {
      const membership = user.memberships.find(m => m.organizationId === user.currentOrgId);
      if (membership) {
        activeOrg = membership.organization;
        userRole = membership.role;
      }
    }

    // Fallback to primary or first membership
    if (!activeOrg && user.memberships.length > 0) {
      const primaryMembership = user.memberships.find(m => m.isPrimary) || user.memberships[0];
      activeOrg = primaryMembership.organization;
      userRole = primaryMembership.role;
    }

    // Legacy fallback
    if (!activeOrg && user.organization) {
      activeOrg = user.organization;
      userRole = "OWNER"; // Legacy users are owners
    }

    if (!activeOrg) {
      return res.status(403).json({ error: "No organization access" });
    }

    // Update last login and current org
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        lastLoginAt: new Date(),
        currentOrgId: activeOrg.id,
      },
    });

    const token = createToken(user);

    console.log("✅ Login:", user.email, "| Org:", activeOrg.name);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: userRole,
        onboardingCompleted: activeOrg.onboardingCompleted,
        organizationCount: user.memberships.length || 1,
      },
      organization: {
        id: activeOrg.id,
        name: activeOrg.name,
        slug: activeOrg.slug,
        plan: activeOrg.plan,
        aiEnabled: activeOrg.aiEnabled,
        greeting: activeOrg.greeting,
        voiceId: activeOrg.voiceId,
        primaryColor: activeOrg.primaryColor,
        slackWebhookUrl: activeOrg.slackWebhookUrl,
        twilioNumber: activeOrg.twilioNumber,
        onboardingCompleted: activeOrg.onboardingCompleted,
        industry: activeOrg.industry,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * GET /auth/me
 * Returns current user + org
 */
router.get("/me", authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      onboardingCompleted: req.user.organization.onboardingCompleted,
    },
    organization: {
      id: req.user.organization.id,
      name: req.user.organization.name,
      slug: req.user.organization.slug,
      plan: req.user.organization.plan,
      aiEnabled: req.user.organization.aiEnabled,
      greeting: req.user.organization.greeting,
      voiceId: req.user.organization.voiceId,
      primaryColor: req.user.organization.primaryColor,
      slackWebhookUrl: req.user.organization.slackWebhookUrl,
      twilioNumber: req.user.organization.twilioNumber,
      onboardingCompleted: req.user.organization.onboardingCompleted,
      industry: req.user.organization.industry,
    },
  });
});

module.exports = router;
