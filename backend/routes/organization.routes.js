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
 */
router.patch("/", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
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
      // Aliases from onboarding
      aiGreeting,
      aiVoiceId,
      aiPersonality,
      afterHoursMessage,
    } = req.body;

    const updated = await prisma.organization.update({
      where: { id: req.organizationId },
      data: {
        ...(name !== undefined && { name }),
        ...(greeting !== undefined && { greeting }),
        ...(aiGreeting !== undefined && { greeting: aiGreeting }),
        ...(aiEnabled !== undefined && { aiEnabled }),
        ...(voiceId !== undefined && { voiceId }),
        ...(aiVoiceId !== undefined && { voiceId: aiVoiceId }),
        ...(personality !== undefined && { personality }),
        ...(aiPersonality !== undefined && { personality: aiPersonality }),
        ...(language !== undefined && { language }),
        ...(timezone !== undefined && { timezone }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(secondaryColor !== undefined && { secondaryColor }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(slackWebhookUrl !== undefined && { slackWebhookUrl }),
        ...(businessHours !== undefined && { businessHours }),
        ...(afterHoursMode !== undefined && { afterHoursMode }),
        ...(afterHoursGreeting !== undefined && { afterHoursGreeting }),
        ...(afterHoursMessage !== undefined && { afterHoursGreeting: afterHoursMessage }),
        ...(onboardingCompleted !== undefined && { onboardingCompleted }),
        ...(industry !== undefined && { industry }),
      },
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
