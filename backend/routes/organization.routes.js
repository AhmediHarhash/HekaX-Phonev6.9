// ============================================================================
// HEKAX Phone - Organization Routes
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

/**
 * GET /api/organization
 * Get current organization details
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    res.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      status: org.status,
      // Onboarding
      onboardingCompleted: org.onboardingCompleted,
      industry: org.industry,
      // AI Config
      aiEnabled: org.aiEnabled,
      greeting: org.greeting,
      voiceId: org.voiceId,
      voiceProvider: org.voiceProvider,
      personality: org.personality,
      language: org.language,
      // Branding
      logoUrl: org.logoUrl,
      primaryColor: org.primaryColor,
      secondaryColor: org.secondaryColor,
      // Twilio
      twilioNumber: org.twilioNumber,
      // Settings
      timezone: org.timezone,
      businessHours: org.businessHours,
      afterHoursMode: org.afterHoursMode,
      afterHoursGreeting: org.afterHoursGreeting,
      // Integrations
      slackWebhookUrl: org.slackWebhookUrl,
      // Usage
      monthlyCallMinutes: org.monthlyCallMinutes,
      monthlyAIMinutes: org.monthlyAIMinutes,
      usedCallMinutes: org.usedCallMinutes,
      usedAIMinutes: org.usedAIMinutes,
    });
  } catch (err) {
    console.error("❌ GET /api/organization error:", err);
    res.status(500).json({ error: "Failed to get organization" });
  }
});

/**
 * PATCH /api/organization
 * Update organization settings
 * SECURITY: Whitelist allowed fields to prevent mass assignment
 */
router.patch("/", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    // SECURITY: Only allow specific fields to be updated
    // NEVER allow: plan, status, stripeCustomerId, stripeSubscriptionId,
    // twilioNumber, monthlyCallMinutes, monthlyAIMinutes, usedCallMinutes,
    // usedAIMinutes, maxUsers, maxPhoneNumbers, etc.
    const ALLOWED_FIELDS = [
      "name", "greeting", "aiEnabled", "voiceId", "personality", "language",
      "timezone", "primaryColor", "secondaryColor", "logoUrl", "slackWebhookUrl",
      "businessHours", "afterHoursMode", "afterHoursGreeting", "onboardingCompleted",
      "industry",
    ];

    // SECURITY: pendingPhoneNumber can only be set during onboarding
    // and only if org doesn't already have a phone number
    const allowPendingPhone = !req.body.onboardingCompleted || req.body.onboardingCompleted === false;

    const {
      name,
      greeting,
      aiEnabled,
      voiceId,
      personality,
      language,
      timezone,
      primaryColor,
      secondaryColor,
      logoUrl,
      slackWebhookUrl,
      businessHours,
      afterHoursMode,
      afterHoursGreeting,
      onboardingCompleted,
      industry,
      pendingPhoneNumber,
      // Aliases from onboarding
      aiGreeting,
      aiVoiceId,
      aiPersonality,
      afterHoursMessage,
    } = req.body;

    // Build update data from allowed fields only
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (greeting !== undefined) updateData.greeting = greeting;
    if (aiGreeting !== undefined) updateData.greeting = aiGreeting;
    if (aiEnabled !== undefined) updateData.aiEnabled = aiEnabled;
    if (voiceId !== undefined) updateData.voiceId = voiceId;
    if (aiVoiceId !== undefined) updateData.voiceId = aiVoiceId;
    if (personality !== undefined) updateData.personality = personality;
    if (aiPersonality !== undefined) updateData.personality = aiPersonality;
    if (language !== undefined) updateData.language = language;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
    if (secondaryColor !== undefined) updateData.secondaryColor = secondaryColor;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (slackWebhookUrl !== undefined) updateData.slackWebhookUrl = slackWebhookUrl;
    if (businessHours !== undefined) updateData.businessHours = businessHours;
    if (afterHoursMode !== undefined) updateData.afterHoursMode = afterHoursMode;
    if (afterHoursGreeting !== undefined) updateData.afterHoursGreeting = afterHoursGreeting;
    if (afterHoursMessage !== undefined) updateData.afterHoursGreeting = afterHoursMessage;
    if (onboardingCompleted !== undefined) updateData.onboardingCompleted = onboardingCompleted;
    if (industry !== undefined) updateData.industry = industry;

    // SECURITY: Only allow pendingPhoneNumber during initial onboarding
    if (pendingPhoneNumber !== undefined && allowPendingPhone) {
      // Validate it looks like a phone number
      if (/^\+?[1-9]\d{6,14}$/.test(pendingPhoneNumber.replace(/\s/g, ""))) {
        updateData.pendingPhoneNumber = pendingPhoneNumber;
      }
    }

    const updated = await prisma.organization.update({
      where: { id: req.organizationId },
      data: updateData,
    });

    console.log("✅ Organization updated:", updated.name);

    res.json({
      id: updated.id,
      name: updated.name,
      greeting: updated.greeting,
      aiEnabled: updated.aiEnabled,
      voiceId: updated.voiceId,
      personality: updated.personality,
      slackWebhookUrl: updated.slackWebhookUrl,
      primaryColor: updated.primaryColor,
      logoUrl: updated.logoUrl,
      onboardingCompleted: updated.onboardingCompleted,
      industry: updated.industry,
    });
  } catch (err) {
    console.error("❌ PATCH /api/organization error:", err);
    res.status(500).json({ error: "Failed to update organization" });
  }
});

module.exports = router;
