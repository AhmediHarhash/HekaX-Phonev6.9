// ============================================================================
// HEKAX Phone - Analytics Service
// Conversation analytics, insights, and trends
// ============================================================================

const prisma = require("../lib/prisma");

/**
 * Get comprehensive analytics for an organization
 */
async function getAnalytics(organizationId, options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate = new Date(),
    granularity = "day", // day, week, month
  } = options;

  const [
    callMetrics,
    sentimentAnalysis,
    topTopics,
    peakHours,
    aiPerformance,
    leadConversion,
    callOutcomes,
    avgHandleTime,
  ] = await Promise.all([
    getCallMetrics(organizationId, startDate, endDate),
    getSentimentAnalysis(organizationId, startDate, endDate),
    getTopTopics(organizationId, startDate, endDate),
    getPeakHours(organizationId, startDate, endDate),
    getAIPerformance(organizationId, startDate, endDate),
    getLeadConversion(organizationId, startDate, endDate),
    getCallOutcomes(organizationId, startDate, endDate),
    getAverageHandleTime(organizationId, startDate, endDate),
  ]);

  return {
    period: { startDate, endDate },
    callMetrics,
    sentimentAnalysis,
    topTopics,
    peakHours,
    aiPerformance,
    leadConversion,
    callOutcomes,
    avgHandleTime,
  };
}

/**
 * Get call volume metrics over time
 */
async function getCallMetrics(organizationId, startDate, endDate) {
  const calls = await prisma.callLog.findMany({
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      createdAt: true,
      duration: true,
      status: true,
      handledByAI: true,
      direction: true,
    },
  });

  // Group by day
  const byDay = {};
  calls.forEach((call) => {
    const day = call.createdAt.toISOString().split("T")[0];
    if (!byDay[day]) {
      byDay[day] = { total: 0, completed: 0, missed: 0, aiHandled: 0, inbound: 0, outbound: 0 };
    }
    byDay[day].total++;
    if (call.status === "COMPLETED") byDay[day].completed++;
    if (["NO_ANSWER", "BUSY", "FAILED"].includes(call.status)) byDay[day].missed++;
    if (call.handledByAI) byDay[day].aiHandled++;
    if (call.direction === "INBOUND") byDay[day].inbound++;
    if (call.direction === "OUTBOUND") byDay[day].outbound++;
  });

  const timeline = Object.entries(byDay)
    .map(([date, metrics]) => ({ date, ...metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalCalls: calls.length,
    completedCalls: calls.filter((c) => c.status === "COMPLETED").length,
    missedCalls: calls.filter((c) => ["NO_ANSWER", "BUSY", "FAILED"].includes(c.status)).length,
    aiHandledCalls: calls.filter((c) => c.handledByAI).length,
    inboundCalls: calls.filter((c) => c.direction === "INBOUND").length,
    outboundCalls: calls.filter((c) => c.direction === "OUTBOUND").length,
    avgDuration: calls.length > 0
      ? Math.round(calls.reduce((sum, c) => sum + (c.duration || 0), 0) / calls.length)
      : 0,
    timeline,
  };
}

/**
 * Analyze sentiment trends from transcripts
 */
async function getSentimentAnalysis(organizationId, startDate, endDate) {
  const transcripts = await prisma.transcript.findMany({
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
      sentiment: { not: null },
    },
    select: {
      sentiment: true,
      sentimentScore: true,
      createdAt: true,
    },
  });

  const sentimentCounts = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };

  let totalScore = 0;
  const byDay = {};

  transcripts.forEach((t) => {
    const sentiment = t.sentiment?.toLowerCase() || "neutral";
    if (sentimentCounts[sentiment] !== undefined) {
      sentimentCounts[sentiment]++;
    }
    totalScore += t.sentimentScore || 0;

    const day = t.createdAt.toISOString().split("T")[0];
    if (!byDay[day]) {
      byDay[day] = { positive: 0, neutral: 0, negative: 0, avgScore: 0, count: 0 };
    }
    if (sentimentCounts[sentiment] !== undefined) {
      byDay[day][sentiment]++;
    }
    byDay[day].avgScore += t.sentimentScore || 0;
    byDay[day].count++;
  });

  // Calculate daily averages
  Object.values(byDay).forEach((day) => {
    day.avgScore = day.count > 0 ? day.avgScore / day.count : 0;
  });

  const timeline = Object.entries(byDay)
    .map(([date, metrics]) => ({ date, ...metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    distribution: sentimentCounts,
    averageScore: transcripts.length > 0 ? totalScore / transcripts.length : 0,
    totalAnalyzed: transcripts.length,
    timeline,
  };
}

/**
 * Get top discussed topics from transcripts
 */
async function getTopTopics(organizationId, startDate, endDate, limit = 10) {
  const transcripts = await prisma.transcript.findMany({
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      topics: true,
      keywords: true,
      primaryIntent: true,
    },
  });

  // Aggregate topics
  const topicCounts = {};
  const keywordCounts = {};
  const intentCounts = {};

  transcripts.forEach((t) => {
    // Topics
    if (t.topics && Array.isArray(t.topics)) {
      t.topics.forEach((topic) => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      });
    }

    // Keywords
    if (t.keywords && Array.isArray(t.keywords)) {
      t.keywords.forEach((keyword) => {
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
      });
    }

    // Primary intent
    if (t.primaryIntent) {
      intentCounts[t.primaryIntent] = (intentCounts[t.primaryIntent] || 0) + 1;
    }
  });

  // Sort and take top N
  const sortByCount = (obj) =>
    Object.entries(obj)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));

  return {
    topics: sortByCount(topicCounts),
    keywords: sortByCount(keywordCounts),
    intents: sortByCount(intentCounts),
  };
}

/**
 * Get peak calling hours
 */
async function getPeakHours(organizationId, startDate, endDate) {
  const calls = await prisma.callLog.findMany({
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      createdAt: true,
    },
  });

  const hourCounts = Array(24).fill(0);
  const dayCounts = Array(7).fill(0); // 0 = Sunday

  calls.forEach((call) => {
    const date = new Date(call.createdAt);
    hourCounts[date.getHours()]++;
    dayCounts[date.getDay()]++;
  });

  // Find peak hour
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Find peak day
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const peakDayIndex = dayCounts.indexOf(Math.max(...dayCounts));

  return {
    byHour: hourCounts.map((count, hour) => ({
      hour,
      label: `${hour}:00`,
      count,
    })),
    byDay: dayCounts.map((count, day) => ({
      day,
      label: dayNames[day],
      count,
    })),
    peakHour: {
      hour: peakHour,
      label: `${peakHour}:00 - ${peakHour + 1}:00`,
      count: hourCounts[peakHour],
    },
    peakDay: {
      day: peakDayIndex,
      label: dayNames[peakDayIndex],
      count: dayCounts[peakDayIndex],
    },
  };
}

/**
 * Get AI performance metrics
 */
async function getAIPerformance(organizationId, startDate, endDate) {
  const calls = await prisma.callLog.findMany({
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
      handledByAI: true,
    },
    select: {
      duration: true,
      status: true,
      transferredToHuman: true,
      transferReason: true,
      aiConfidence: true,
      sentiment: true,
    },
  });

  const totalAICalls = calls.length;
  const transferredCalls = calls.filter((c) => c.transferredToHuman).length;
  const completedWithoutTransfer = calls.filter(
    (c) => c.status === "COMPLETED" && !c.transferredToHuman
  ).length;

  // Transfer reasons breakdown
  const transferReasons = {};
  calls
    .filter((c) => c.transferredToHuman && c.transferReason)
    .forEach((c) => {
      transferReasons[c.transferReason] = (transferReasons[c.transferReason] || 0) + 1;
    });

  // Average confidence
  const callsWithConfidence = calls.filter((c) => c.aiConfidence !== null);
  const avgConfidence =
    callsWithConfidence.length > 0
      ? callsWithConfidence.reduce((sum, c) => sum + c.aiConfidence, 0) / callsWithConfidence.length
      : 0;

  // Positive outcome rate (completed + positive sentiment)
  const positiveOutcomes = calls.filter(
    (c) => c.status === "COMPLETED" && c.sentiment?.toLowerCase() === "positive"
  ).length;

  return {
    totalAICalls,
    resolutionRate: totalAICalls > 0
      ? Math.round((completedWithoutTransfer / totalAICalls) * 100)
      : 0,
    transferRate: totalAICalls > 0
      ? Math.round((transferredCalls / totalAICalls) * 100)
      : 0,
    avgConfidence: Math.round(avgConfidence * 100),
    positiveOutcomeRate: totalAICalls > 0
      ? Math.round((positiveOutcomes / totalAICalls) * 100)
      : 0,
    avgDuration: totalAICalls > 0
      ? Math.round(calls.reduce((sum, c) => sum + (c.duration || 0), 0) / totalAICalls)
      : 0,
    transferReasons: Object.entries(transferReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Get lead conversion metrics
 */
async function getLeadConversion(organizationId, startDate, endDate) {
  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      status: true,
      temperature: true,
      createdAt: true,
      estimatedValue: true,
    },
  });

  const statusCounts = {};
  const tempCounts = { HOT: 0, WARM: 0, COLD: 0 };
  let totalValue = 0;
  let wonValue = 0;

  leads.forEach((lead) => {
    statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
    if (tempCounts[lead.temperature] !== undefined) {
      tempCounts[lead.temperature]++;
    }
    if (lead.estimatedValue) {
      totalValue += lead.estimatedValue;
      if (lead.status === "WON") {
        wonValue += lead.estimatedValue;
      }
    }
  });

  const totalLeads = leads.length;
  const wonLeads = statusCounts["WON"] || 0;
  const lostLeads = statusCounts["LOST"] || 0;

  return {
    totalLeads,
    byStatus: Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    byTemperature: tempCounts,
    conversionRate: totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0,
    lossRate: totalLeads > 0 ? Math.round((lostLeads / totalLeads) * 100) : 0,
    pipelineValue: totalValue,
    wonValue,
  };
}

/**
 * Get call outcome distribution
 */
async function getCallOutcomes(organizationId, startDate, endDate) {
  const calls = await prisma.callLog.groupBy({
    by: ["status"],
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
    _count: true,
  });

  return calls.map((c) => ({
    status: c.status,
    count: c._count,
  }));
}

/**
 * Get average handle time trends
 */
async function getAverageHandleTime(organizationId, startDate, endDate) {
  const calls = await prisma.callLog.findMany({
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
      status: "COMPLETED",
      duration: { gt: 0 },
    },
    select: {
      duration: true,
      handledByAI: true,
      createdAt: true,
    },
  });

  // Overall average
  const totalDuration = calls.reduce((sum, c) => sum + c.duration, 0);
  const avgOverall = calls.length > 0 ? Math.round(totalDuration / calls.length) : 0;

  // AI vs Human
  const aiCalls = calls.filter((c) => c.handledByAI);
  const humanCalls = calls.filter((c) => !c.handledByAI);

  const avgAI =
    aiCalls.length > 0
      ? Math.round(aiCalls.reduce((sum, c) => sum + c.duration, 0) / aiCalls.length)
      : 0;

  const avgHuman =
    humanCalls.length > 0
      ? Math.round(humanCalls.reduce((sum, c) => sum + c.duration, 0) / humanCalls.length)
      : 0;

  // By day trend
  const byDay = {};
  calls.forEach((call) => {
    const day = call.createdAt.toISOString().split("T")[0];
    if (!byDay[day]) {
      byDay[day] = { total: 0, count: 0 };
    }
    byDay[day].total += call.duration;
    byDay[day].count++;
  });

  const timeline = Object.entries(byDay)
    .map(([date, data]) => ({
      date,
      avgDuration: Math.round(data.total / data.count),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    overall: avgOverall,
    ai: avgAI,
    human: avgHuman,
    timeline,
  };
}

/**
 * Get common questions/queries from transcripts
 */
async function getCommonQueries(organizationId, startDate, endDate, limit = 20) {
  const transcripts = await prisma.transcript.findMany({
    where: {
      organizationId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      messages: true,
    },
  });

  // Extract user messages (questions)
  const questionPatterns = {};

  transcripts.forEach((t) => {
    if (t.messages && Array.isArray(t.messages)) {
      t.messages
        .filter((m) => m.role === "user" && m.content)
        .forEach((m) => {
          // Simple normalization
          const normalized = m.content
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .trim();

          if (normalized.length > 10 && normalized.length < 200) {
            // Check for question patterns
            if (
              normalized.includes("how") ||
              normalized.includes("what") ||
              normalized.includes("when") ||
              normalized.includes("where") ||
              normalized.includes("why") ||
              normalized.includes("can") ||
              normalized.includes("do you")
            ) {
              questionPatterns[normalized] = (questionPatterns[normalized] || 0) + 1;
            }
          }
        });
    }
  });

  return Object.entries(questionPatterns)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([question, count]) => ({ question, count }));
}

module.exports = {
  getAnalytics,
  getCallMetrics,
  getSentimentAnalysis,
  getTopTopics,
  getPeakHours,
  getAIPerformance,
  getLeadConversion,
  getCallOutcomes,
  getAverageHandleTime,
  getCommonQueries,
};
