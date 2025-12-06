// ============================================================================
// HEKAX Phone - Analytics Routes
// API endpoints for conversation analytics and insights
// ============================================================================

const express = require("express");
const { authMiddleware } = require("../middleware/auth.middleware");
const analyticsService = require("../services/analytics.service");
const { cache } = require("../lib/cache");

const router = express.Router();

// Cache TTL for analytics (5 minutes - data doesn't need to be real-time)
const ANALYTICS_CACHE_TTL = 300;

/**
 * GET /api/analytics
 * Get comprehensive analytics dashboard data
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    const cacheKey = `analytics:${req.organizationId}:${startDate || 'default'}:${endDate || 'default'}:${granularity || 'day'}`;

    const analytics = await cache.getOrSet(cacheKey, async () => {
      const options = {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        granularity: granularity || "day",
      };
      return analyticsService.getAnalytics(req.organizationId, options);
    }, ANALYTICS_CACHE_TTL);

    res.json(analytics);
  } catch (err) {
    console.error("❌ GET /api/analytics error:", err);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

/**
 * GET /api/analytics/calls
 * Get call volume metrics
 */
router.get("/calls", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const cacheKey = `analytics:calls:${req.organizationId}:${startDate || 'default'}:${endDate || 'default'}`;

    const metrics = await cache.getOrSet(cacheKey, async () => {
      return analyticsService.getCallMetrics(
        req.organizationId,
        startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate) : new Date()
      );
    }, ANALYTICS_CACHE_TTL);

    res.json(metrics);
  } catch (err) {
    console.error("❌ GET /api/analytics/calls error:", err);
    res.status(500).json({ error: "Failed to get call metrics" });
  }
});

/**
 * GET /api/analytics/sentiment
 * Get sentiment analysis data
 */
router.get("/sentiment", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const cacheKey = `analytics:sentiment:${req.organizationId}:${startDate || 'default'}:${endDate || 'default'}`;

    const analysis = await cache.getOrSet(cacheKey, async () => {
      return analyticsService.getSentimentAnalysis(
        req.organizationId,
        startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate) : new Date()
      );
    }, ANALYTICS_CACHE_TTL);

    res.json(analysis);
  } catch (err) {
    console.error("❌ GET /api/analytics/sentiment error:", err);
    res.status(500).json({ error: "Failed to get sentiment analysis" });
  }
});

/**
 * GET /api/analytics/topics
 * Get top topics and keywords
 */
router.get("/topics", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;
    const cacheKey = `analytics:topics:${req.organizationId}:${startDate || 'default'}:${endDate || 'default'}:${limit || 10}`;

    const topics = await cache.getOrSet(cacheKey, async () => {
      return analyticsService.getTopTopics(
        req.organizationId,
        startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate) : new Date(),
        limit ? parseInt(limit) : 10
      );
    }, ANALYTICS_CACHE_TTL);

    res.json(topics);
  } catch (err) {
    console.error("❌ GET /api/analytics/topics error:", err);
    res.status(500).json({ error: "Failed to get topics" });
  }
});

/**
 * GET /api/analytics/peak-hours
 * Get peak calling hours data
 */
router.get("/peak-hours", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const cacheKey = `analytics:peak-hours:${req.organizationId}:${startDate || 'default'}:${endDate || 'default'}`;

    const peakHours = await cache.getOrSet(cacheKey, async () => {
      return analyticsService.getPeakHours(
        req.organizationId,
        startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate) : new Date()
      );
    }, ANALYTICS_CACHE_TTL);

    res.json(peakHours);
  } catch (err) {
    console.error("❌ GET /api/analytics/peak-hours error:", err);
    res.status(500).json({ error: "Failed to get peak hours" });
  }
});

/**
 * GET /api/analytics/ai-performance
 * Get AI receptionist performance metrics
 */
router.get("/ai-performance", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const performance = await analyticsService.getAIPerformance(
      req.organizationId,
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate ? new Date(endDate) : new Date()
    );

    res.json(performance);
  } catch (err) {
    console.error("❌ GET /api/analytics/ai-performance error:", err);
    res.status(500).json({ error: "Failed to get AI performance" });
  }
});

/**
 * GET /api/analytics/leads
 * Get lead conversion metrics
 */
router.get("/leads", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const conversion = await analyticsService.getLeadConversion(
      req.organizationId,
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate ? new Date(endDate) : new Date()
    );

    res.json(conversion);
  } catch (err) {
    console.error("❌ GET /api/analytics/leads error:", err);
    res.status(500).json({ error: "Failed to get lead conversion" });
  }
});

/**
 * GET /api/analytics/common-queries
 * Get common questions asked by callers
 */
router.get("/common-queries", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;

    const queries = await analyticsService.getCommonQueries(
      req.organizationId,
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate ? new Date(endDate) : new Date(),
      limit ? parseInt(limit) : 20
    );

    res.json({ queries });
  } catch (err) {
    console.error("❌ GET /api/analytics/common-queries error:", err);
    res.status(500).json({ error: "Failed to get common queries" });
  }
});

/**
 * GET /api/analytics/handle-time
 * Get average handle time metrics
 */
router.get("/handle-time", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const handleTime = await analyticsService.getAverageHandleTime(
      req.organizationId,
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate ? new Date(endDate) : new Date()
    );

    res.json(handleTime);
  } catch (err) {
    console.error("❌ GET /api/analytics/handle-time error:", err);
    res.status(500).json({ error: "Failed to get handle time" });
  }
});

module.exports = router;
