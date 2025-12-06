// ============================================================================
// HEKAX Phone - Scheduler Service
// Handles scheduled/recurring automation jobs
// ============================================================================

const prisma = require("../lib/prisma");
const automationService = require("./automation.service");

// Store for scheduled jobs (in-memory for simplicity)
const scheduledJobs = new Map();

// ============================================================================
// SCHEDULED JOB DEFINITIONS
// ============================================================================

const SCHEDULED_JOBS = {
  // Run every minute
  appointmentReminders: {
    interval: 60 * 1000, // 1 minute
    handler: sendAppointmentReminders,
  },

  // Run every 5 minutes
  sequenceProcessor: {
    interval: 5 * 60 * 1000,
    handler: processSequences,
  },

  // Run every hour
  usageAlerts: {
    interval: 60 * 60 * 1000,
    handler: checkUsageThresholds,
  },

  // Run every hour
  trialAlerts: {
    interval: 60 * 60 * 1000,
    handler: checkTrialExpirations,
  },

  // Run every 6 hours
  leadScoring: {
    interval: 6 * 60 * 60 * 1000,
    handler: autoScoreLeads,
  },

  // Run daily at midnight
  dataCleanup: {
    interval: 24 * 60 * 60 * 1000,
    handler: runDataCleanup,
  },

  // Run daily
  analyticsReports: {
    interval: 24 * 60 * 60 * 1000,
    handler: generateDailyReports,
  },

  // Run every 4 hours
  feedbackProcessor: {
    interval: 4 * 60 * 60 * 1000,
    handler: processFeedbackQueue,
  },

  // Run every hour
  noShowDetection: {
    interval: 60 * 60 * 1000,
    handler: detectNoShows,
  },

  // Run every 30 minutes
  staleLLeadFollowup: {
    interval: 30 * 60 * 1000,
    handler: followUpStaleLeads,
  },
};

// ============================================================================
// SCHEDULER CONTROL
// ============================================================================

/**
 * Start all scheduled jobs
 */
function startScheduler() {
  console.log("🕐 Starting automation scheduler...");

  for (const [name, job] of Object.entries(SCHEDULED_JOBS)) {
    const intervalId = setInterval(async () => {
      try {
        console.log(`⏰ Running scheduled job: ${name}`);
        await job.handler();
      } catch (err) {
        console.error(`❌ Scheduled job ${name} failed:`, err);
      }
    }, job.interval);

    scheduledJobs.set(name, intervalId);
    console.log(`  ✅ Scheduled: ${name} (every ${job.interval / 1000}s)`);
  }

  // Run immediate jobs on startup
  setTimeout(() => {
    checkUsageThresholds().catch(console.error);
    checkTrialExpirations().catch(console.error);
  }, 5000);

  console.log("✅ Scheduler started");
}

/**
 * Stop all scheduled jobs
 */
function stopScheduler() {
  console.log("🛑 Stopping scheduler...");

  for (const [name, intervalId] of scheduledJobs.entries()) {
    clearInterval(intervalId);
    console.log(`  Stopped: ${name}`);
  }

  scheduledJobs.clear();
  console.log("✅ Scheduler stopped");
}

// ============================================================================
// JOB HANDLERS
// ============================================================================

/**
 * Send appointment reminders (1 hour before)
 */
async function sendAppointmentReminders() {
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const now = new Date();

  // Find appointments in the next hour that haven't had reminders sent
  const appointments = await prisma.calendarBooking.findMany({
    where: {
      scheduledAt: {
        gte: now,
        lte: oneHourFromNow,
      },
      status: { in: ["PENDING", "CONFIRMED"] },
      reminderSent: false,
    },
    include: {
      organization: {
        select: { id: true, name: true, twilioNumber: true, smsSettings: true },
      },
    },
  });

  for (const appointment of appointments) {
    try {
      const smsService = require("./sms.service");

      // Send reminder SMS
      await smsService.sendAppointmentReminder(
        appointment.organizationId,
        appointment.callerPhone,
        appointment.callerName,
        appointment.scheduledAt,
        appointment.purpose
      );

      // Mark reminder as sent
      await prisma.calendarBooking.update({
        where: { id: appointment.id },
        data: { reminderSent: true },
      });

      console.log(`📱 Sent reminder for appointment ${appointment.id}`);
    } catch (err) {
      console.error(`Failed to send reminder for ${appointment.id}:`, err);
    }
  }
}

/**
 * Process drip sequences
 */
async function processSequences() {
  const now = new Date();

  // Find enrollments ready for next step
  const enrollments = await prisma.sequenceEnrollment.findMany({
    where: {
      status: "ACTIVE",
      nextStepAt: { lte: now },
    },
    include: {
      sequence: true,
      lead: true,
    },
    take: 100,
  });

  for (const enrollment of enrollments) {
    try {
      const sequence = enrollment.sequence;
      const steps = sequence?.steps || [];
      const currentStep = enrollment.currentStep;

      if (currentStep >= steps.length) {
        // Sequence complete
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        continue;
      }

      const step = steps[currentStep];

      // Execute step action
      if (step.type === "sms" && enrollment.lead?.phone) {
        const smsService = require("./sms.service");
        await smsService.sendSMS(
          enrollment.organizationId,
          enrollment.lead.phone,
          automationService.interpolateTemplate(step.message, enrollment.lead)
        );
      } else if (step.type === "email" && enrollment.lead?.email) {
        const emailService = require("./email.service");
        await emailService.sendEmail({
          to: enrollment.lead.email,
          subject: automationService.interpolateTemplate(step.subject, enrollment.lead),
          html: automationService.interpolateTemplate(step.body, enrollment.lead),
        });
      }

      // Move to next step
      const nextDelay = steps[currentStep + 1]?.delayMinutes || 0;
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStep: currentStep + 1,
          nextStepAt: nextDelay > 0
            ? new Date(Date.now() + nextDelay * 60 * 1000)
            : null,
          lastStepAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`Sequence step failed for ${enrollment.id}:`, err);
    }
  }
}

/**
 * Check usage thresholds and send alerts
 */
async function checkUsageThresholds() {
  const orgs = await prisma.organization.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      usedCallMinutes: true,
      monthlyCallMinutes: true,
      usedAIMinutes: true,
      monthlyAIMinutes: true,
    },
  });

  for (const org of orgs) {
    // Check call minutes
    const callPercent = org.monthlyCallMinutes > 0
      ? (org.usedCallMinutes / org.monthlyCallMinutes) * 100
      : 0;

    // Check AI minutes
    const aiPercent = org.monthlyAIMinutes > 0
      ? (org.usedAIMinutes / org.monthlyAIMinutes) * 100
      : 0;

    // Check thresholds
    if (callPercent >= 80 && callPercent < 90) {
      await createUsageAlert(org.id, "usage_warning_80", "call_minutes", callPercent);
    } else if (callPercent >= 90 && callPercent < 100) {
      await createUsageAlert(org.id, "usage_warning_90", "call_minutes", callPercent);
    } else if (callPercent >= 100) {
      await createUsageAlert(org.id, "usage_limit_reached", "call_minutes", callPercent);
      await automationService.emit(
        automationService.EVENTS.USAGE_LIMIT_REACHED,
        org.id,
        { type: "call_minutes", percent: callPercent }
      );
    }

    if (aiPercent >= 80 && aiPercent < 90) {
      await createUsageAlert(org.id, "usage_warning_80", "ai_minutes", aiPercent);
    } else if (aiPercent >= 90 && aiPercent < 100) {
      await createUsageAlert(org.id, "usage_warning_90", "ai_minutes", aiPercent);
    } else if (aiPercent >= 100) {
      await createUsageAlert(org.id, "usage_limit_reached", "ai_minutes", aiPercent);
    }
  }
}

/**
 * Create usage alert if not already exists for this period
 */
async function createUsageAlert(organizationId, type, resourceType, percent) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if alert already sent today
  const existing = await prisma.usageAlert.findFirst({
    where: {
      organizationId,
      type: `${type}_${resourceType}`,
      createdAt: { gte: today },
    },
  });

  if (existing) return;

  await prisma.usageAlert.create({
    data: {
      organizationId,
      type: `${type}_${resourceType}`,
      title: `${resourceType === "call_minutes" ? "Call" : "AI"} Minutes Alert`,
      message: `You've used ${Math.round(percent)}% of your monthly ${
        resourceType === "call_minutes" ? "call" : "AI"
      } minutes.`,
      severity: percent >= 100 ? "error" : percent >= 90 ? "warning" : "info",
    },
  });
}

/**
 * Check trial expirations and send alerts
 */
async function checkTrialExpirations() {
  const now = new Date();
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Find trials ending soon
  const orgs = await prisma.organization.findMany({
    where: {
      plan: "TRIAL",
      trialEndsAt: {
        gte: now,
        lte: threeDaysFromNow,
      },
    },
    include: {
      users: {
        where: { status: "ACTIVE" },
        take: 1,
      },
    },
  });

  for (const org of orgs) {
    const daysLeft = Math.ceil(
      (org.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Send trial ending alert
    await automationService.emit(
      automationService.EVENTS.TRIAL_ENDING_SOON,
      org.id,
      { daysLeft, trialEndsAt: org.trialEndsAt }
    );

    // Send email reminder
    if (org.users[0]?.email) {
      try {
        const emailService = require("./email.service");
        await emailService.sendEmail({
          to: org.users[0].email,
          subject: `Your HEKAX Phone trial ends in ${daysLeft} day${daysLeft > 1 ? "s" : ""}`,
          html: `
            <h2>Your trial is ending soon</h2>
            <p>Hi ${org.users[0].name},</p>
            <p>Your HEKAX Phone trial for ${org.name} will end in ${daysLeft} day${daysLeft > 1 ? "s" : ""}.</p>
            <p>Upgrade now to keep your AI receptionist running!</p>
            <a href="${process.env.FRONTEND_URL}/billing" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Upgrade Now</a>
          `,
        });
      } catch (err) {
        console.error(`Failed to send trial alert to ${org.users[0].email}:`, err);
      }
    }
  }
}

/**
 * Auto-score leads based on various factors
 */
async function autoScoreLeads() {
  // Get leads that need scoring (created/updated in last 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const leads = await prisma.lead.findMany({
    where: {
      updatedAt: { gte: yesterday },
      status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
    },
    include: {
      call: {
        select: {
          duration: true,
          sentiment: true,
          sentimentScore: true,
          handledByAI: true,
          aiConfidence: true,
        },
      },
    },
  });

  for (const lead of leads) {
    let score = lead.score || 0;
    let temperature = lead.temperature;

    // Score based on call data
    if (lead.call) {
      // Longer calls = more interest
      if (lead.call.duration > 300) score += 20;
      else if (lead.call.duration > 120) score += 10;

      // Positive sentiment
      if (lead.call.sentiment === "POSITIVE") score += 15;
      else if (lead.call.sentiment === "NEGATIVE") score -= 10;

      // High AI confidence
      if (lead.call.aiConfidence && lead.call.aiConfidence > 0.8) score += 5;
    }

    // Score based on lead data
    if (lead.email) score += 10;
    if (lead.company) score += 10;
    if (lead.appointmentDate) score += 20;
    if (lead.urgency === "HIGH" || lead.urgency === "CRITICAL") score += 15;
    if (lead.estimatedValue && lead.estimatedValue > 1000) score += 15;

    // Determine temperature based on score
    if (score >= 70) temperature = "HOT";
    else if (score >= 40) temperature = "WARM";
    else temperature = "COLD";

    // Update lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: { score, temperature },
    });
  }

  console.log(`📊 Scored ${leads.length} leads`);
}

/**
 * Run data cleanup based on retention policies
 */
async function runDataCleanup() {
  const cleanupService = require("./cleanup.service");

  const orgs = await prisma.organization.findMany({
    where: { retentionEnabled: true },
    select: {
      id: true,
      retentionCallDays: true,
      retentionTranscriptDays: true,
      retentionRecordingDays: true,
      retentionLeadDays: true,
      retentionAuditDays: true,
    },
  });

  for (const org of orgs) {
    try {
      await cleanupService.cleanupOrganization(org.id, {
        callDays: org.retentionCallDays,
        transcriptDays: org.retentionTranscriptDays,
        recordingDays: org.retentionRecordingDays,
        leadDays: org.retentionLeadDays,
        auditDays: org.retentionAuditDays,
      });
    } catch (err) {
      console.error(`Cleanup failed for org ${org.id}:`, err);
    }
  }
}

/**
 * Generate daily analytics reports
 */
async function generateDailyReports() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orgs = await prisma.organization.findMany({
    where: { status: "ACTIVE" },
    include: {
      users: {
        where: { status: "ACTIVE", emailNotifications: true },
        select: { email: true, name: true },
        take: 5,
      },
    },
  });

  for (const org of orgs) {
    if (org.users.length === 0) continue;

    try {
      // Get yesterday's stats
      const [calls, leads] = await Promise.all([
        prisma.callLog.count({
          where: {
            organizationId: org.id,
            createdAt: { gte: yesterday, lt: today },
          },
        }),
        prisma.lead.count({
          where: {
            organizationId: org.id,
            createdAt: { gte: yesterday, lt: today },
          },
        }),
      ]);

      // Send daily summary email to first user
      const emailService = require("./email.service");
      await emailService.sendEmail({
        to: org.users[0].email,
        subject: `HEKAX Phone Daily Summary - ${yesterday.toLocaleDateString()}`,
        html: `
          <h2>Daily Summary for ${org.name}</h2>
          <p>Here's what happened yesterday:</p>
          <ul>
            <li><strong>Total Calls:</strong> ${calls}</li>
            <li><strong>New Leads:</strong> ${leads}</li>
          </ul>
          <p><a href="${process.env.FRONTEND_URL}/analytics">View Full Analytics</a></p>
        `,
      });
    } catch (err) {
      console.error(`Daily report failed for org ${org.id}:`, err);
    }
  }
}

/**
 * Process feedback queue for AI learning
 */
async function processFeedbackQueue() {
  const pendingItems = await prisma.aILearningQueue.findMany({
    where: { status: "PENDING" },
    include: {
      feedback: true,
    },
    orderBy: { priority: "desc" },
    take: 50,
  });

  for (const item of pendingItems) {
    try {
      // Mark as processing
      await prisma.aILearningQueue.update({
        where: { id: item.id },
        data: { status: "PROCESSING" },
      });

      const feedback = item.feedback;

      // Auto-create FAQ from corrections
      if (
        feedback.feedbackType === "CORRECTION" &&
        feedback.originalResponse &&
        feedback.correctedResponse
      ) {
        // Create or update FAQ
        await prisma.aIFAQ.create({
          data: {
            organizationId: item.organizationId,
            question: `[Auto] Response improvement for: ${feedback.originalResponse.substring(0, 100)}`,
            answer: feedback.correctedResponse,
            category: "corrections",
            priority: 1,
            keywords: [],
          },
        });
      }

      // Mark feedback as applied
      await prisma.aIFeedback.update({
        where: { id: feedback.id },
        data: { status: "APPLIED", reviewedAt: new Date() },
      });

      // Mark queue item as processed
      await prisma.aILearningQueue.update({
        where: { id: item.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
    } catch (err) {
      console.error(`Learning queue processing failed for ${item.id}:`, err);
      await prisma.aILearningQueue.update({
        where: { id: item.id },
        data: { status: "FAILED", result: err.message },
      });
    }
  }

  if (pendingItems.length > 0) {
    console.log(`🧠 Processed ${pendingItems.length} feedback items`);
  }
}

/**
 * Detect appointment no-shows
 */
async function detectNoShows() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Find appointments that should have happened but aren't marked complete
  const noShows = await prisma.calendarBooking.findMany({
    where: {
      scheduledAt: { lt: oneHourAgo },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });

  for (const appointment of noShows) {
    await prisma.calendarBooking.update({
      where: { id: appointment.id },
      data: {
        status: "NO_SHOW",
        noShowMarkedAt: new Date(),
      },
    });

    // Emit event for automation
    await automationService.emit(
      automationService.EVENTS.APPOINTMENT_NO_SHOW,
      appointment.organizationId,
      {
        appointmentId: appointment.id,
        callerPhone: appointment.callerPhone,
        callerName: appointment.callerName,
        scheduledAt: appointment.scheduledAt,
      }
    );
  }
}

/**
 * Follow up on stale leads
 */
async function followUpStaleLeads() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  // Find leads that haven't been updated in 3 days and are still open
  const staleLeads = await prisma.lead.findMany({
    where: {
      status: { in: ["NEW", "CONTACTED"] },
      updatedAt: { lt: threeDaysAgo },
    },
    include: {
      organization: {
        select: { id: true, smsSettings: true, twilioNumber: true },
      },
    },
    take: 100,
  });

  for (const lead of staleLeads) {
    // Emit event for automation rules to handle
    await automationService.emit(
      automationService.EVENTS.LEAD_UPDATED,
      lead.organizationId,
      {
        leadId: lead.id,
        stale: true,
        daysSinceUpdate: Math.floor(
          (Date.now() - lead.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
        ),
        ...lead,
      }
    );
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  SCHEDULED_JOBS,
  // Export individual handlers for manual triggering
  sendAppointmentReminders,
  processSequences,
  checkUsageThresholds,
  checkTrialExpirations,
  autoScoreLeads,
  runDataCleanup,
  generateDailyReports,
  processFeedbackQueue,
  detectNoShows,
  followUpStaleLeads,
};
