// ============================================================================
// HEKAX Phone - AI Feedback Service
// Handles AI response corrections, feedback collection, and improvement tracking
// ============================================================================

const prisma = require("../lib/prisma");

/**
 * Submit feedback for an AI response
 */
async function submitFeedback(organizationId, userId, data) {
  const {
    callId,
    transcriptId,
    messageIndex,
    feedbackType, // 'correction', 'rating', 'suggestion'
    rating, // 1-5 for ratings
    originalResponse,
    correctedResponse,
    category, // 'accuracy', 'tone', 'completeness', 'relevance', 'other'
    notes,
  } = data;

  const feedback = await prisma.aIFeedback.create({
    data: {
      organizationId,
      userId,
      callId,
      transcriptId,
      messageIndex,
      feedbackType,
      rating,
      originalResponse,
      correctedResponse,
      category,
      notes,
      status: "PENDING",
    },
  });

  // If this is a correction, queue it for AI learning
  if (feedbackType === "correction" && correctedResponse) {
    await queueForLearning(organizationId, feedback.id);
  }

  return feedback;
}

/**
 * Queue feedback for AI learning/training
 */
async function queueForLearning(organizationId, feedbackId) {
  await prisma.aILearningQueue.create({
    data: {
      organizationId,
      feedbackId,
      status: "PENDING",
      priority: 1,
    },
  });
}

/**
 * Get all feedback for an organization
 */
async function getFeedback(organizationId, options = {}) {
  const {
    status,
    feedbackType,
    category,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = options;

  const where = { organizationId };

  if (status) where.status = status;
  if (feedbackType) where.feedbackType = feedbackType;
  if (category) where.category = category;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [feedback, total] = await Promise.all([
    prisma.aIFeedback.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        call: {
          select: { id: true, fromNumber: true, toNumber: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.aIFeedback.count({ where }),
  ]);

  return { feedback, total, limit, offset };
}

/**
 * Get feedback for a specific call
 */
async function getCallFeedback(callId, organizationId) {
  return prisma.aIFeedback.findMany({
    where: { callId, organizationId },
    include: {
      user: {
        select: { id: true, name: true },
      },
    },
    orderBy: { messageIndex: "asc" },
  });
}

/**
 * Update feedback status
 */
async function updateFeedbackStatus(feedbackId, organizationId, status, reviewNotes) {
  return prisma.aIFeedback.update({
    where: { id: feedbackId, organizationId },
    data: {
      status,
      reviewNotes,
      reviewedAt: new Date(),
    },
  });
}

/**
 * Get feedback statistics
 */
async function getFeedbackStats(organizationId, startDate, endDate) {
  const where = {
    organizationId,
    createdAt: {
      gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      lte: endDate || new Date(),
    },
  };

  const [
    totalFeedback,
    byType,
    byCategory,
    byStatus,
    avgRating,
    recentFeedback,
  ] = await Promise.all([
    prisma.aIFeedback.count({ where }),
    prisma.aIFeedback.groupBy({
      by: ["feedbackType"],
      where,
      _count: true,
    }),
    prisma.aIFeedback.groupBy({
      by: ["category"],
      where,
      _count: true,
    }),
    prisma.aIFeedback.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
    prisma.aIFeedback.aggregate({
      where: { ...where, rating: { not: null } },
      _avg: { rating: true },
    }),
    prisma.aIFeedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        user: { select: { name: true } },
      },
    }),
  ]);

  // Calculate improvement rate (corrections that were applied)
  const appliedCorrections = await prisma.aIFeedback.count({
    where: {
      ...where,
      feedbackType: "correction",
      status: "APPLIED",
    },
  });

  const totalCorrections = await prisma.aIFeedback.count({
    where: {
      ...where,
      feedbackType: "correction",
    },
  });

  return {
    totalFeedback,
    byType: byType.map((t) => ({ type: t.feedbackType, count: t._count })),
    byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
    averageRating: avgRating._avg.rating || 0,
    improvementRate:
      totalCorrections > 0
        ? Math.round((appliedCorrections / totalCorrections) * 100)
        : 0,
    recentFeedback,
  };
}

/**
 * Get learning queue items
 */
async function getLearningQueue(organizationId, options = {}) {
  const { status = "PENDING", limit = 50 } = options;

  return prisma.aILearningQueue.findMany({
    where: { organizationId, status },
    include: {
      feedback: {
        include: {
          call: {
            select: { id: true, fromNumber: true, createdAt: true },
          },
        },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
  });
}

/**
 * Process learning queue item (mark as processed)
 */
async function processLearningItem(itemId, organizationId, result) {
  return prisma.aILearningQueue.update({
    where: { id: itemId, organizationId },
    data: {
      status: result.success ? "PROCESSED" : "FAILED",
      processedAt: new Date(),
      result: result.message,
    },
  });
}

/**
 * Get AI improvement metrics over time
 */
async function getImprovementMetrics(organizationId, startDate, endDate) {
  const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date();

  // Get feedback trends by week
  const feedback = await prisma.aIFeedback.findMany({
    where: {
      organizationId,
      createdAt: { gte: start, lte: end },
    },
    select: {
      createdAt: true,
      feedbackType: true,
      rating: true,
      status: true,
    },
  });

  // Group by week
  const byWeek = {};
  feedback.forEach((f) => {
    const week = getWeekStart(f.createdAt);
    if (!byWeek[week]) {
      byWeek[week] = {
        corrections: 0,
        ratings: [],
        applied: 0,
        total: 0,
      };
    }
    byWeek[week].total++;
    if (f.feedbackType === "correction") byWeek[week].corrections++;
    if (f.rating) byWeek[week].ratings.push(f.rating);
    if (f.status === "APPLIED") byWeek[week].applied++;
  });

  const timeline = Object.entries(byWeek)
    .map(([week, data]) => ({
      week,
      corrections: data.corrections,
      avgRating:
        data.ratings.length > 0
          ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length
          : null,
      improvementRate:
        data.corrections > 0
          ? Math.round((data.applied / data.corrections) * 100)
          : 0,
      totalFeedback: data.total,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));

  return { timeline };
}

/**
 * Get common correction patterns
 */
async function getCorrectionPatterns(organizationId, limit = 20) {
  const corrections = await prisma.aIFeedback.findMany({
    where: {
      organizationId,
      feedbackType: "correction",
      correctedResponse: { not: null },
    },
    select: {
      originalResponse: true,
      correctedResponse: true,
      category: true,
      notes: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Group by category and find patterns
  const patterns = {};
  corrections.forEach((c) => {
    const cat = c.category || "other";
    if (!patterns[cat]) {
      patterns[cat] = [];
    }
    patterns[cat].push({
      original: c.originalResponse?.substring(0, 200),
      corrected: c.correctedResponse?.substring(0, 200),
      notes: c.notes,
    });
  });

  // Return top patterns per category
  return Object.entries(patterns)
    .map(([category, items]) => ({
      category,
      count: items.length,
      examples: items.slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Export feedback for training
 */
async function exportFeedbackForTraining(organizationId, options = {}) {
  const { minRating = 4, includeCorrections = true } = options;

  const where = {
    organizationId,
    status: "APPLIED",
  };

  const feedback = await prisma.aIFeedback.findMany({
    where: {
      ...where,
      OR: [
        { rating: { gte: minRating } },
        includeCorrections ? { feedbackType: "correction" } : {},
      ].filter((o) => Object.keys(o).length > 0),
    },
    include: {
      call: {
        include: {
          transcript: {
            select: { messages: true },
          },
        },
      },
    },
  });

  // Format for training
  return feedback.map((f) => ({
    id: f.id,
    type: f.feedbackType,
    category: f.category,
    original: f.originalResponse,
    corrected: f.correctedResponse || f.originalResponse,
    rating: f.rating,
    context: f.call?.transcript?.messages?.slice(
      Math.max(0, f.messageIndex - 3),
      f.messageIndex + 1
    ),
  }));
}

// Helper to get week start date
function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

module.exports = {
  submitFeedback,
  getFeedback,
  getCallFeedback,
  updateFeedbackStatus,
  getFeedbackStats,
  getLearningQueue,
  processLearningItem,
  getImprovementMetrics,
  getCorrectionPatterns,
  exportFeedbackForTraining,
};
