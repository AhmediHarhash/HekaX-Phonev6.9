// ============================================================================
// HEKAX Phone - Usage Routes
// Phase 5: Multi-tenant SaaS Infrastructure
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { getUsageStats, PLAN_LIMITS } = require("../middleware/usage.middleware");

const router = express.Router();

/**
 * GET /api/usage
 * Get current usage for organization
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const stats = await getUsageStats(req.organizationId);

    if (!stats) {
      return res.status(404).json({ error: "Organization not found" });
    }

    res.json(stats);
  } catch (err) {
    console.error("❌ GET /api/usage error:", err);
    res.status(500).json({ error: "Failed to get usage" });
  }
});

/**
 * GET /api/usage/history
 * Get usage history (daily breakdown)
 */
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const logs = await prisma.usageLog.findMany({
      where: {
        organizationId: req.organizationId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by day and type
    const dailyUsage = {};
    logs.forEach((log) => {
      const date = log.createdAt.toISOString().split("T")[0];
      if (!dailyUsage[date]) {
        dailyUsage[date] = { call_minutes: 0, ai_minutes: 0 };
      }
      dailyUsage[date][log.type] += log.quantity;
    });

    // Convert to array
    const history = Object.entries(dailyUsage).map(([date, usage]) => ({
      date,
      ...usage,
    }));

    res.json(history);
  } catch (err) {
    console.error("❌ GET /api/usage/history error:", err);
    res.status(500).json({ error: "Failed to get usage history" });
  }
});

/**
 * GET /api/usage/breakdown
 * Get detailed usage breakdown by phone number, user, etc.
 */
router.get("/breakdown", authMiddleware, async (req, res) => {
  try {
    const { period = "month" } = req.query;
    
    let startDate = new Date();
    if (period === "week") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "month") {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === "year") {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    // Get calls grouped by phone number
    const byPhoneNumber = await prisma.callLog.groupBy({
      by: ["phoneNumberId"],
      where: {
        organizationId: req.organizationId,
        createdAt: { gte: startDate },
      },
      _count: true,
      _sum: { duration: true },
    });

    // Get phone number details
    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: { organizationId: req.organizationId },
      select: { id: true, number: true, friendlyName: true },
    });

    const phoneMap = new Map(phoneNumbers.map((p) => [p.id, p]));

    // Get calls grouped by AI vs Human
    const byHandler = await prisma.callLog.groupBy({
      by: ["handledByAI"],
      where: {
        organizationId: req.organizationId,
        createdAt: { gte: startDate },
      },
      _count: true,
      _sum: { duration: true },
    });

    // Get calls grouped by direction
    const byDirection = await prisma.callLog.groupBy({
      by: ["direction"],
      where: {
        organizationId: req.organizationId,
        createdAt: { gte: startDate },
      },
      _count: true,
      _sum: { duration: true },
    });

    res.json({
      period,
      startDate,
      byPhoneNumber: byPhoneNumber.map((item) => ({
        phoneNumber: phoneMap.get(item.phoneNumberId) || { number: "Unknown" },
        callCount: item._count,
        totalMinutes: Math.round((item._sum.duration || 0) / 60),
      })),
      byHandler: byHandler.map((item) => ({
        handler: item.handledByAI ? "AI" : "Human",
        callCount: item._count,
        totalMinutes: Math.round((item._sum.duration || 0) / 60),
      })),
      byDirection: byDirection.map((item) => ({
        direction: item.direction,
        callCount: item._count,
        totalMinutes: Math.round((item._sum.duration || 0) / 60),
      })),
    });
  } catch (err) {
    console.error("❌ GET /api/usage/breakdown error:", err);
    res.status(500).json({ error: "Failed to get usage breakdown" });
  }
});

/**
 * GET /api/usage/limits
 * Get plan limits
 */
router.get("/limits", authMiddleware, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: {
        plan: true,
        monthlyCallMinutes: true,
        monthlyAIMinutes: true,
        maxUsers: true,
        maxPhoneNumbers: true,
      },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const defaultLimits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.STARTER;

    res.json({
      plan: org.plan,
      limits: {
        monthlyCallMinutes: org.monthlyCallMinutes || defaultLimits.monthlyCallMinutes,
        monthlyAIMinutes: org.monthlyAIMinutes || defaultLimits.monthlyAIMinutes,
        maxUsers: org.maxUsers || defaultLimits.maxUsers,
        maxPhoneNumbers: org.maxPhoneNumbers || defaultLimits.maxPhoneNumbers,
      },
      planDefaults: defaultLimits,
    });
  } catch (err) {
    console.error("❌ GET /api/usage/limits error:", err);
    res.status(500).json({ error: "Failed to get limits" });
  }
});

module.exports = router;
