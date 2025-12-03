// ============================================================================
// HEKAX Phone - Stats Routes
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth.middleware");

const router = express.Router();

/**
 * GET /api/stats
 * Get dashboard statistics
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get calls data
    const [todayCalls, weekCalls, monthCallsCount] = await Promise.all([
      prisma.callLog.findMany({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: today },
        },
      }),
      prisma.callLog.findMany({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: weekAgo },
        },
      }),
      prisma.callLog.count({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: monthAgo },
        },
      }),
    ]);

    // Get leads data
    const [todayLeadsCount, weekLeadsCount] = await Promise.all([
      prisma.lead.count({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: today },
        },
      }),
      prisma.lead.count({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: weekAgo },
        },
      }),
    ]);

    // Calculate stats
    const aiHandledToday = todayCalls.filter(c => c.handledByAI).length;
    const avgDuration = todayCalls.length > 0
      ? Math.round(todayCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / todayCalls.length)
      : 0;
    const missedCalls = todayCalls.filter(c => 
      c.status === 'NO_ANSWER' || c.status === 'BUSY' || c.status === 'FAILED'
    ).length;

    // Get organization usage
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: {
        monthlyCallMinutes: true,
        monthlyAIMinutes: true,
        usedCallMinutes: true,
        usedAIMinutes: true,
      },
    });

    res.json({
      today: {
        calls: todayCalls.length,
        aiHandled: aiHandledToday,
        aiPercent: todayCalls.length > 0 ? Math.round((aiHandledToday / todayCalls.length) * 100) : 0,
        leads: todayLeadsCount,
        avgDuration,
        missedCalls,
      },
      week: {
        calls: weekCalls.length,
        leads: weekLeadsCount,
      },
      month: {
        calls: monthCallsCount,
      },
      usage: org ? {
        callMinutes: org.usedCallMinutes,
        aiMinutes: org.usedAIMinutes,
        callMinutesLimit: org.monthlyCallMinutes,
        aiMinutesLimit: org.monthlyAIMinutes,
      } : null,
    });
  } catch (err) {
    console.error("❌ GET /api/stats error:", err);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

module.exports = router;
