// ============================================================================
// HEKAX Phone - Plans Routes
// Phase 6.6: 3-Tier Plans with Add-ons
// ============================================================================

const express = require("express");
const stripeService = require("../services/stripe.service");

const router = express.Router();

/**
 * GET /api/plans
 * Get available plans (public)
 */
router.get("/", (req, res) => {
  const plans = stripeService.getAllPlans();

  // Format for frontend - exclude trial from public listing
  const formattedPlans = Object.entries(plans)
    .filter(([key]) => key !== "TRIAL")
    .map(([key, plan]) => ({
      id: key,
      name: plan.name,
      price: plan.price / 100, // Convert cents to dollars
      interval: plan.interval,
      limits: {
        callMinutes: plan.limits.callMinutes,
        aiMinutes: plan.limits.aiMinutes,
        users: plan.limits.users,
        phoneNumbers: plan.limits.phoneNumbers,
        recordingRetentionDays: plan.limits.recordingRetentionDays,
        concurrentCalls: plan.limits.concurrentCalls,
      },
      overage: plan.overage ? {
        enabled: plan.overage.enabled,
        cap: plan.overage.overageCap / 100, // Convert to dollars
        callMinuteRate: plan.overage.callMinuteRate,
        aiMinuteRate: plan.overage.aiMinuteRate,
      } : null,
      features: getFeaturesList(key),
      featureFlags: plan.features,
      popular: key === "BUSINESS_PRO",
    }));

  res.json({ plans: formattedPlans });
});

/**
 * GET /api/plans/:id
 * Get single plan details
 */
router.get("/:id", (req, res) => {
  const { id } = req.params;
  const plan = stripeService.getPlan(id.toUpperCase());

  if (!plan) {
    return res.status(404).json({ error: "Plan not found" });
  }

  res.json({
    id: id.toUpperCase(),
    name: plan.name,
    price: plan.price / 100,
    interval: plan.interval,
    limits: plan.limits,
    overage: plan.overage ? {
      enabled: plan.overage.enabled,
      cap: plan.overage.overageCap / 100,
      callMinuteRate: plan.overage.callMinuteRate,
      aiMinuteRate: plan.overage.aiMinuteRate,
    } : null,
    features: getFeaturesList(id.toUpperCase()),
    featureFlags: plan.features,
  });
});

/**
 * GET /api/plans/:id/addons
 * Get available add-ons for a plan
 */
router.get("/:id/addons", (req, res) => {
  const addons = stripeService.getAddonsForPlan();

  const formattedAddons = addons.map(addon => ({
    id: addon.id,
    name: addon.name,
    description: addon.description,
    price: addon.price / 100,
    callMinutes: addon.callMinutes,
    aiMinutes: addon.aiMinutes,
  }));

  res.json({ addons: formattedAddons });
});

/**
 * GET /api/plans/addons/all
 * Get all add-ons
 */
router.get("/addons/all", (req, res) => {
  const addons = stripeService.getAllAddons();

  const formattedAddons = Object.entries(addons).map(([key, addon]) => ({
    id: key,
    name: addon.name,
    description: addon.description,
    price: addon.price / 100,
    callMinutes: addon.callMinutes,
    aiMinutes: addon.aiMinutes,
  }));

  res.json({ addons: formattedAddons });
});

/**
 * Get features list for a plan
 */
function getFeaturesList(planKey) {
  const features = {
    STARTER: [
      "1,000 call minutes (US/CA)",
      "300 AI handled minutes",
      "1 phone number",
      "2 team members",
      "30-day recording retention",
      "Basic analytics",
      "Email support",
    ],
    BUSINESS_PRO: [
      "4,000 call minutes (US/CA)",
      "2,000 AI handled minutes",
      "5 phone numbers",
      "10 team members",
      "90-day recording retention",
      "3 concurrent calls",
      "Full analytics",
      "Priority support",
      "Multi-org support",
      "API access",
      "Data export",
      "Overage up to $150/mo",
    ],
    SCALE: [
      "8,000 call minutes (US/CA)",
      "4,000 AI handled minutes",
      "5 phone numbers",
      "20 team members",
      "180-day recording retention",
      "5 concurrent calls",
      "Full analytics",
      "Priority support",
      "Multi-org support",
      "API access",
      "BYO API keys",
      "Data export",
      "White-label",
      "Custom domain",
      "Discounted AI overage ($0.06/min)",
      "Overage up to $250/mo",
    ],
    TRIAL: [
      "200 call minutes",
      "100 AI handled minutes",
      "1 phone number",
      "2 team members",
      "7-day recording retention",
      "7-day trial period",
    ],
  };

  return features[planKey] || [];
}

module.exports = router;
