// ============================================================================
// HEKAX Phone - Alerts Service
// Phase 6.1: Billing & Credits
// ============================================================================

const prisma = require("../lib/prisma");

// Alert types
const ALERT_TYPES = {
  USAGE_WARNING_80: "usage_warning_80",
  USAGE_WARNING_90: "usage_warning_90",
  USAGE_LIMIT_REACHED: "usage_limit_reached",
  USAGE_GRACE_STARTED: "usage_grace_started",
  USAGE_HARD_LIMIT: "usage_hard_limit",
  TRIAL_ENDING: "trial_ending",
  TRIAL_ENDED: "trial_ended",
  PAYMENT_FAILED: "payment_failed",
  SUBSCRIPTION_CANCELLED: "subscription_cancelled",
};

// Alert messages
const ALERT_MESSAGES = {
  [ALERT_TYPES.USAGE_WARNING_80]: {
    title: "80% Usage Warning",
    message: "You've used 80% of your {resource}. Consider monitoring your usage.",
    severity: "warning",
  },
  [ALERT_TYPES.USAGE_WARNING_90]: {
    title: "90% Usage Warning",
    message: "You've used 90% of your {resource}. You're approaching your limit.",
    severity: "warning",
  },
  [ALERT_TYPES.USAGE_LIMIT_REACHED]: {
    title: "Usage Limit Reached",
    message: "You've reached 100% of your {resource}. {action}",
    severity: "error",
  },
  [ALERT_TYPES.USAGE_GRACE_STARTED]: {
    title: "Grace Period Started",
    message: "Your AI minutes limit has been reached. You have 48 hours to upgrade or purchase an add-on before AI features are paused.",
    severity: "warning",
  },
  [ALERT_TYPES.USAGE_HARD_LIMIT]: {
    title: "AI Features Paused",
    message: "Your AI minutes grace period has ended. AI features are now paused. Upgrade your plan or purchase an add-on to restore.",
    severity: "error",
  },
  [ALERT_TYPES.TRIAL_ENDING]: {
    title: "Trial Ending Soon",
    message: "Your trial ends in {days} days. Subscribe to keep your phone system running.",
    severity: "info",
  },
  [ALERT_TYPES.TRIAL_ENDED]: {
    title: "Trial Ended",
    message: "Your trial has ended. Subscribe now to restore service.",
    severity: "error",
  },
  [ALERT_TYPES.PAYMENT_FAILED]: {
    title: "Payment Failed",
    message: "We couldn't process your payment. Please update your payment method.",
    severity: "error",
  },
  [ALERT_TYPES.SUBSCRIPTION_CANCELLED]: {
    title: "Subscription Cancelled",
    message: "Your subscription will end on {date}. You can resume anytime before then.",
    severity: "info",
  },
};

/**
 * Create an alert for an organization
 */
async function createAlert(organizationId, type, data = {}) {
  try {
    const alertConfig = ALERT_MESSAGES[type];
    if (!alertConfig) {
      console.error("Unknown alert type:", type);
      return null;
    }

    // Replace placeholders in message
    let message = alertConfig.message;
    Object.entries(data).forEach(([key, value]) => {
      message = message.replace(`{${key}}`, value);
    });

    // Check if similar alert already exists (avoid spam)
    const existingAlert = await prisma.usageAlert.findFirst({
      where: {
        organizationId,
        type,
        dismissed: false,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Within last 24 hours
        },
      },
    });

    if (existingAlert) {
      console.log("⚠️ Alert already exists, skipping:", type);
      return existingAlert;
    }

    const alert = await prisma.usageAlert.create({
      data: {
        organizationId,
        type,
        title: alertConfig.title,
        message,
        severity: alertConfig.severity,
        data: JSON.stringify(data),
      },
    });

    console.log("🔔 Alert created:", type, "for org:", organizationId);

    // TODO: Send email notification
    // await sendAlertEmail(organizationId, alert);

    return alert;
  } catch (error) {
    console.error("❌ Create alert error:", error.message);
    return null;
  }
}

/**
 * Get active alerts for an organization
 */
async function getActiveAlerts(organizationId) {
  try {
    const alerts = await prisma.usageAlert.findMany({
      where: {
        organizationId,
        dismissed: false,
      },
      orderBy: { createdAt: "desc" },
    });

    return alerts.map((alert) => ({
      ...alert,
      data: alert.data ? JSON.parse(alert.data) : null,
    }));
  } catch (error) {
    console.error("❌ Get alerts error:", error.message);
    return [];
  }
}

/**
 * Dismiss an alert
 */
async function dismissAlert(alertId, organizationId) {
  try {
    const alert = await prisma.usageAlert.update({
      where: {
        id: alertId,
        organizationId, // Ensure org ownership
      },
      data: {
        dismissed: true,
        dismissedAt: new Date(),
      },
    });

    return alert;
  } catch (error) {
    console.error("❌ Dismiss alert error:", error.message);
    return null;
  }
}

/**
 * Dismiss all alerts of a type for an organization
 */
async function dismissAlertsByType(organizationId, type) {
  try {
    await prisma.usageAlert.updateMany({
      where: {
        organizationId,
        type,
        dismissed: false,
      },
      data: {
        dismissed: true,
        dismissedAt: new Date(),
      },
    });

    return true;
  } catch (error) {
    console.error("❌ Dismiss alerts by type error:", error.message);
    return false;
  }
}

/**
 * Check and create usage alerts based on current usage
 */
async function checkAndCreateUsageAlerts(organizationId, usageType, used, limit) {
  if (!limit) return; // Unlimited plan

  const percent = Math.round((used / limit) * 100);
  const resourceName = usageType === "call" ? "call minutes" : "AI minutes";

  if (percent >= 100) {
    if (usageType === "ai") {
      // Check if grace period already started
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { aiGraceStartedAt: true },
      });

      if (!org.aiGraceStartedAt) {
        // Start grace period
        await prisma.organization.update({
          where: { id: organizationId },
          data: { aiGraceStartedAt: new Date() },
        });
        await createAlert(organizationId, ALERT_TYPES.USAGE_GRACE_STARTED);
      } else {
        // Check if grace period expired (48 hours)
        const graceEnd = new Date(org.aiGraceStartedAt.getTime() + 48 * 60 * 60 * 1000);
        if (new Date() > graceEnd) {
          await createAlert(organizationId, ALERT_TYPES.USAGE_HARD_LIMIT);
        }
      }
    } else {
      // Call minutes - just warn, overage billing kicks in
      await createAlert(organizationId, ALERT_TYPES.USAGE_LIMIT_REACHED, {
        resource: resourceName,
        action: "Overage charges will apply for additional usage.",
      });
    }
  } else if (percent >= 90) {
    await createAlert(organizationId, ALERT_TYPES.USAGE_WARNING_90, {
      resource: resourceName,
    });
  } else if (percent >= 80) {
    await createAlert(organizationId, ALERT_TYPES.USAGE_WARNING_80, {
      resource: resourceName,
    });
  }
}

/**
 * Check trial status and create alerts
 */
async function checkTrialAlerts(organization) {
  if (organization.plan !== "TRIAL" || !organization.trialEndsAt) return;

  const now = new Date();
  const trialEnd = new Date(organization.trialEndsAt);
  const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    await createAlert(organization.id, ALERT_TYPES.TRIAL_ENDED);
  } else if (daysLeft <= 3) {
    await createAlert(organization.id, ALERT_TYPES.TRIAL_ENDING, {
      days: daysLeft,
    });
  }
}

module.exports = {
  ALERT_TYPES,
  ALERT_MESSAGES,
  createAlert,
  getActiveAlerts,
  dismissAlert,
  dismissAlertsByType,
  checkAndCreateUsageAlerts,
  checkTrialAlerts,
};
