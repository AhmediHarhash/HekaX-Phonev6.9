// ============================================================================
// HEKAX Phone - Real-time Routes
// API endpoints for live dashboard and active calls
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth.middleware");
const realtimeService = require("../services/realtime.service");

const router = express.Router();

/**
 * GET /api/realtime/active-calls
 * Get currently active calls for organization
 */
router.get("/active-calls", authMiddleware, async (req, res) => {
  try {
    // Get active calls from in-memory store
    const activeCalls = realtimeService.getActiveCalls(req.organizationId);

    // Also check database for calls in progress
    const dbActiveCalls = await prisma.callLog.findMany({
      where: {
        organizationId: req.organizationId,
        status: {
          in: ["QUEUED", "RINGING", "IN_PROGRESS"],
        },
        createdAt: {
          // Only calls from last 2 hours (to avoid stale data)
          gte: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        callSid: true,
        direction: true,
        fromNumber: true,
        toNumber: true,
        status: true,
        duration: true,
        handledByAI: true,
        createdAt: true,
      },
    });

    // Merge in-memory and DB calls (prefer in-memory for live data)
    const callMap = new Map();

    // Add DB calls first
    dbActiveCalls.forEach(call => {
      callMap.set(call.callSid, {
        ...call,
        elapsedTime: Math.floor((Date.now() - new Date(call.createdAt).getTime()) / 1000),
      });
    });

    // Override with in-memory (more accurate)
    activeCalls.forEach(call => {
      callMap.set(call.callSid, call);
    });

    res.json({
      activeCalls: Array.from(callMap.values()),
      count: callMap.size,
    });
  } catch (err) {
    console.error("❌ GET /api/realtime/active-calls error:", err);
    res.status(500).json({ error: "Failed to get active calls" });
  }
});

/**
 * GET /api/realtime/stats
 * Get real-time dashboard stats
 */
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [
      totalTodayCalls,
      aiHandledCalls,
      completedCalls,
      missedCalls,
      leadsToday,
      callsLastHour,
      avgDuration,
    ] = await Promise.all([
      // Total calls today
      prisma.callLog.count({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: todayStart },
        },
      }),
      // AI handled calls today
      prisma.callLog.count({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: todayStart },
          handledByAI: true,
        },
      }),
      // Completed calls today
      prisma.callLog.count({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: todayStart },
          status: "COMPLETED",
        },
      }),
      // Missed calls today
      prisma.callLog.count({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: todayStart },
          status: { in: ["NO_ANSWER", "BUSY", "FAILED"] },
        },
      }),
      // Leads captured today
      prisma.lead.count({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: todayStart },
        },
      }),
      // Calls in last hour
      prisma.callLog.count({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: hourAgo },
        },
      }),
      // Average call duration today
      prisma.callLog.aggregate({
        where: {
          organizationId: req.organizationId,
          createdAt: { gte: todayStart },
          duration: { gt: 0 },
        },
        _avg: { duration: true },
      }),
    ]);

    // Get active call count
    const activeCalls = realtimeService.getActiveCalls(req.organizationId);

    res.json({
      stats: {
        activeCallsNow: activeCalls.length,
        callsToday: totalTodayCalls,
        callsLastHour,
        aiHandledToday: aiHandledCalls,
        aiPercentage: totalTodayCalls > 0 ? Math.round((aiHandledCalls / totalTodayCalls) * 100) : 0,
        completedToday: completedCalls,
        missedToday: missedCalls,
        leadsToday,
        avgDurationSeconds: Math.round(avgDuration._avg.duration || 0),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ GET /api/realtime/stats error:", err);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

/**
 * GET /api/realtime/recent-activity
 * Get recent call activity for live feed
 */
router.get("/recent-activity", authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const recentCalls = await prisma.callLog.findMany({
      where: {
        organizationId: req.organizationId,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        callSid: true,
        direction: true,
        fromNumber: true,
        toNumber: true,
        status: true,
        duration: true,
        handledByAI: true,
        sentiment: true,
        createdAt: true,
      },
    });

    const recentLeads = await prisma.lead.findMany({
      where: {
        organizationId: req.organizationId,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        phone: true,
        reason: true,
        temperature: true,
        createdAt: true,
      },
    });

    res.json({
      recentCalls,
      recentLeads,
    });
  } catch (err) {
    console.error("❌ GET /api/realtime/recent-activity error:", err);
    res.status(500).json({ error: "Failed to get recent activity" });
  }
});

/**
 * GET /api/realtime/connection-status
 * Check WebSocket connection status
 */
router.get("/connection-status", authMiddleware, (req, res) => {
  const connectionCount = realtimeService.getConnectionCount(req.organizationId);

  res.json({
    connected: connectionCount > 0,
    connectionCount,
    organizationId: req.organizationId,
  });
});

module.exports = router;
