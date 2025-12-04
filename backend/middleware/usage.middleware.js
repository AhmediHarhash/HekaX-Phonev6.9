// ============================================================================
// HEKAX Phone - Usage Tracking Middleware
// Phase 6.8: Add-On Pool + Overage Logic
// ============================================================================

const prisma = require("../lib/prisma");
const alertsService = require("../services/alerts.service");

// Plan limits configuration
const PLAN_LIMITS = {
  TRIAL: {
    monthlyCallMinutes: 200,
    monthlyAIMinutes: 100,
    maxUsers: 2,
    maxPhoneNumbers: 1,
    overageEnabled: false,
    callOverageRate: 0,
    aiOverageRate: 0,
  },
  STARTER: {
    monthlyCallMinutes: 1000,
    monthlyAIMinutes: 300,
    maxUsers: 2,
    maxPhoneNumbers: 1,
    overageEnabled: false, // Off by default for Starter
    callOverageRate: 3, // $0.03 in cents
    aiOverageRate: 8,   // $0.08 in cents
  },
  BUSINESS_PRO: {
    monthlyCallMinutes: 4000,
    monthlyAIMinutes: 2000,
    maxUsers: 10,
    maxPhoneNumbers: 5,
    overageEnabled: true, // On by default for Pro
    callOverageRate: 3, // $0.03 in cents
    aiOverageRate: 8,   // $0.08 in cents
  },
  SCALE: {
    monthlyCallMinutes: 8000,
    monthlyAIMinutes: 4000,
    maxUsers: 20,
    maxPhoneNumbers: 5,
    overageEnabled: true,
    callOverageRate: 3, // $0.03 in cents
    aiOverageRate: 6,   // $0.06 in cents (discounted)
  },
};

// Alert thresholds
const ALERT_THRESHOLDS = [80, 90, 100];

/**
 * Check if organization has exceeded usage limits
 * Returns usage status and whether to allow the action
 */
async function checkUsageLimits(organizationId, usageType) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      status: true,
      monthlyCallMinutes: true,
      monthlyAIMinutes: true,
      usedCallMinutes: true,
      usedAIMinutes: true,
      // Add-on pool
      addonCallMinutes: true,
      addonAIMinutes: true,
      usedAddonCallMinutes: true,
      usedAddonAIMinutes: true,
      // Overage
      overageEnabled: true,
      overageCapCents: true,
      overageUsedCents: true,
      // Grace
      aiGraceStartedAt: true,
      usageResetAt: true,
    },
  });

  if (!org) {
    return { allowed: false, error: "Organization not found" };
  }

  // Suspended orgs can't use the service
  if (org.status === "SUSPENDED" || org.status === "CANCELLED") {
    return { allowed: false, error: "Account suspended", code: "ACCOUNT_SUSPENDED" };
  }

  const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.STARTER;

  // Calculate totals
  const planCallLimit = org.monthlyCallMinutes || limits.monthlyCallMinutes;
  const planAILimit = org.monthlyAIMinutes || limits.monthlyAIMinutes;
  
  const addonCallRemaining = Math.max(0, org.addonCallMinutes - org.usedAddonCallMinutes);
  const addonAIRemaining = Math.max(0, org.addonAIMinutes - org.usedAddonAIMinutes);
  
  const totalCallPool = planCallLimit + addonCallRemaining;
  const totalAIPool = planAILimit + addonAIRemaining;
  
  const totalCallUsed = org.usedCallMinutes;
  const totalAIUsed = org.usedAIMinutes;

  // Check specific usage type
  if (usageType === "call") {
    // Check if plan pool is exhausted
    if (totalCallUsed >= planCallLimit) {
      // Check if add-on pool available
      if (addonCallRemaining > 0) {
        return { 
          allowed: true, 
          source: "addon",
          message: "Using add-on minutes",
        };
      }
      
      // Check if overage is enabled and under cap
      if (org.overageEnabled && org.overageUsedCents < org.overageCapCents) {
        return { 
          allowed: true, 
          source: "overage",
          message: "Using overage minutes",
        };
      }
      
      // No more minutes available
      return {
        allowed: false,
        error: "Call minutes exhausted",
        code: "CALL_LIMIT_EXCEEDED",
        used: totalCallUsed,
        limit: totalCallPool,
        type: "call_minutes",
      };
    }
  }

  if (usageType === "ai") {
    // Check if plan pool is exhausted
    if (totalAIUsed >= planAILimit) {
      // Check if add-on pool available
      if (addonAIRemaining > 0) {
        return { 
          allowed: true, 
          source: "addon",
          message: "Using add-on AI minutes",
        };
      }
      
      // Check if overage is enabled and under cap
      if (org.overageEnabled && org.overageUsedCents < org.overageCapCents) {
        return { 
          allowed: true, 
          source: "overage",
          message: "Using overage AI minutes",
        };
      }
      
      // Check 48-hour grace period
      if (org.aiGraceStartedAt) {
        const graceEnds = new Date(org.aiGraceStartedAt.getTime() + 48 * 60 * 60 * 1000);
        if (new Date() < graceEnds) {
          return { 
            allowed: true, 
            source: "grace",
            message: "In grace period",
            graceEndsAt: graceEnds,
          };
        }
      }
      
      // No more AI minutes available - drop to basic mode
      return {
        allowed: false,
        error: "AI minutes exhausted",
        code: "AI_LIMIT_EXCEEDED",
        used: totalAIUsed,
        limit: totalAIPool,
        type: "ai_minutes",
        fallbackToBasic: true,
      };
    }
  }

  return { allowed: true, source: "plan" };
}

/**
 * Increment usage for an organization
 * Handles: Plan pool -> Add-on pool -> Overage
 */
async function incrementUsage(organizationId, usageType, amount = 1) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        plan: true,
        monthlyCallMinutes: true,
        monthlyAIMinutes: true,
        usedCallMinutes: true,
        usedAIMinutes: true,
        addonCallMinutes: true,
        addonAIMinutes: true,
        usedAddonCallMinutes: true,
        usedAddonAIMinutes: true,
        overageEnabled: true,
        overageCapCents: true,
        overageUsedCents: true,
        aiGraceStartedAt: true,
      },
    });

    if (!org) {
      return { success: false, error: "Organization not found" };
    }

    const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.STARTER;
    const updateData = {};
    let source = "plan";
    let overageCharge = 0;

    if (usageType === "call") {
      const planLimit = org.monthlyCallMinutes || limits.monthlyCallMinutes;
      const planRemaining = Math.max(0, planLimit - org.usedCallMinutes);
      const addonRemaining = Math.max(0, org.addonCallMinutes - org.usedAddonCallMinutes);

      if (planRemaining >= amount) {
        // Use plan pool
        updateData.usedCallMinutes = { increment: amount };
        source = "plan";
      } else if (addonRemaining >= amount) {
        // Use add-on pool
        updateData.usedAddonCallMinutes = { increment: amount };
        source = "addon";
      } else if (org.overageEnabled && org.overageUsedCents < org.overageCapCents) {
        // Use overage
        overageCharge = amount * limits.callOverageRate;
        updateData.usedCallMinutes = { increment: amount };
        updateData.overageUsedCents = { increment: overageCharge };
        source = "overage";
      } else {
        // Split between pools if partial
        if (planRemaining > 0) {
          updateData.usedCallMinutes = { increment: planRemaining };
        }
        const remaining = amount - planRemaining;
        if (remaining > 0 && addonRemaining > 0) {
          updateData.usedAddonCallMinutes = { increment: Math.min(remaining, addonRemaining) };
        }
      }
    } else if (usageType === "ai") {
      const planLimit = org.monthlyAIMinutes || limits.monthlyAIMinutes;
      const planRemaining = Math.max(0, planLimit - org.usedAIMinutes);
      const addonRemaining = Math.max(0, org.addonAIMinutes - org.usedAddonAIMinutes);

      if (planRemaining >= amount) {
        // Use plan pool
        updateData.usedAIMinutes = { increment: amount };
        source = "plan";
      } else if (addonRemaining >= amount) {
        // Use add-on pool
        updateData.usedAddonAIMinutes = { increment: amount };
        source = "addon";
      } else if (org.overageEnabled && org.overageUsedCents < org.overageCapCents) {
        // Use overage
        overageCharge = amount * limits.aiOverageRate;
        updateData.usedAIMinutes = { increment: amount };
        updateData.overageUsedCents = { increment: overageCharge };
        source = "overage";
      } else {
        // Start grace period if not already started
        if (!org.aiGraceStartedAt) {
          updateData.aiGraceStartedAt = new Date();
        }
        updateData.usedAIMinutes = { increment: amount };
        source = "grace";
      }
    }

    // Update organization
    if (Object.keys(updateData).length > 0) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: updateData,
      });
    }

    // Log usage
    await prisma.usageLog.create({
      data: {
        organizationId,
        type: usageType === "call" ? "call_minutes" : "ai_minutes",
        quantity: amount,
        unit: "minutes",
        unitCost: overageCharge > 0 ? overageCharge / amount / 100 : 0,
        totalCost: overageCharge / 100,
        periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
      },
    });

    // Check for usage alerts
    await checkAndCreateUsageAlerts(organizationId, usageType);

    return { success: true, source, overageCharge };
  } catch (error) {
    console.error("❌ Usage increment error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Check and create usage alerts at thresholds
 */
async function checkAndCreateUsageAlerts(organizationId, usageType) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        plan: true,
        monthlyCallMinutes: true,
        monthlyAIMinutes: true,
        usedCallMinutes: true,
        usedAIMinutes: true,
        addonCallMinutes: true,
        addonAIMinutes: true,
        usedAddonCallMinutes: true,
        usedAddonAIMinutes: true,
      },
    });

    if (!org) return;

    const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.STARTER;
    
    let used, limit, type;
    if (usageType === "call") {
      used = org.usedCallMinutes;
      limit = org.monthlyCallMinutes || limits.monthlyCallMinutes;
      type = "call";
    } else {
      used = org.usedAIMinutes;
      limit = org.monthlyAIMinutes || limits.monthlyAIMinutes;
      type = "ai";
    }

    const percent = Math.round((used / limit) * 100);

    for (const threshold of ALERT_THRESHOLDS) {
      if (percent >= threshold) {
        const alertType = `usage_warning_${type}_${threshold}`;
        
        // Check if alert already exists
        const existing = await prisma.usageAlert.findFirst({
          where: {
            organizationId,
            type: alertType,
            dismissed: false,
          },
        });

        if (!existing) {
          await prisma.usageAlert.create({
            data: {
              organizationId,
              type: alertType,
              title: `${threshold}% of ${type === "call" ? "call" : "AI"} minutes used`,
              message: `You've used ${used} of ${limit} ${type === "call" ? "call" : "AI"} minutes this billing period.`,
              severity: threshold >= 100 ? "error" : threshold >= 90 ? "warning" : "info",
              data: JSON.stringify({ used, limit, percent, type }),
            },
          });
        }
      }
    }
  } catch (error) {
    console.error("❌ Alert creation error:", error);
  }
}

/**
 * Check team size limits
 */
async function checkTeamLimit(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      maxUsers: true,
      _count: { select: { users: true } },
    },
  });

  if (!org) {
    return { allowed: false, error: "Organization not found" };
  }

  const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.STARTER;
  const maxUsers = org.maxUsers || limits.maxUsers;

  if (maxUsers && org._count.users >= maxUsers) {
    return {
      allowed: false,
      error: `Team limit reached (${org._count.users}/${maxUsers})`,
      current: org._count.users,
      limit: maxUsers,
    };
  }

  return { allowed: true, current: org._count.users, limit: maxUsers };
}

/**
 * Check phone number limits
 */
async function checkPhoneNumberLimit(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      maxPhoneNumbers: true,
      _count: { select: { phoneNumbers: true } },
    },
  });

  if (!org) {
    return { allowed: false, error: "Organization not found" };
  }

  const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.STARTER;
  const maxNumbers = org.maxPhoneNumbers || limits.maxPhoneNumbers;

  if (maxNumbers && org._count.phoneNumbers >= maxNumbers) {
    return {
      allowed: false,
      error: `Phone number limit reached (${org._count.phoneNumbers}/${maxNumbers})`,
      current: org._count.phoneNumbers,
      limit: maxNumbers,
    };
  }

  return { allowed: true, current: org._count.phoneNumbers, limit: maxNumbers };
}

/**
 * Middleware to check usage before allowing calls
 */
const usageCheckMiddleware = (usageType) => async (req, res, next) => {
  if (!req.organizationId) {
    return next();
  }

  const check = await checkUsageLimits(req.organizationId, usageType);
  
  if (!check.allowed) {
    // For AI, allow fallback to basic mode
    if (check.fallbackToBasic && usageType === "ai") {
      req.aiDisabled = true;
      req.aiDisabledReason = check.error;
      return next();
    }
    
    return res.status(429).json({
      error: check.error,
      code: check.code || "USAGE_LIMIT_EXCEEDED",
      details: {
        type: check.type,
        used: check.used,
        limit: check.limit,
      },
    });
  }

  // Store source for logging
  req.usageSource = check.source;
  next();
};

/**
 * Get current usage stats for an organization
 */
async function getUsageStats(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      monthlyCallMinutes: true,
      monthlyAIMinutes: true,
      usedCallMinutes: true,
      usedAIMinutes: true,
      addonCallMinutes: true,
      addonAIMinutes: true,
      usedAddonCallMinutes: true,
      usedAddonAIMinutes: true,
      overageEnabled: true,
      overageCapCents: true,
      overageUsedCents: true,
      maxUsers: true,
      maxPhoneNumbers: true,
      usageResetAt: true,
      aiGraceStartedAt: true,
      _count: {
        select: {
          users: true,
          phoneNumbers: true,
          callLogs: true,
          leads: true,
        },
      },
    },
  });

  if (!org) {
    return null;
  }

  const limits = PLAN_LIMITS[org.plan] || PLAN_LIMITS.STARTER;
  const callLimit = org.monthlyCallMinutes || limits.monthlyCallMinutes;
  const aiLimit = org.monthlyAIMinutes || limits.monthlyAIMinutes;

  return {
    plan: org.plan,
    callMinutes: {
      used: org.usedCallMinutes,
      limit: callLimit,
      percent: Math.round((org.usedCallMinutes / callLimit) * 100),
      addonTotal: org.addonCallMinutes,
      addonUsed: org.usedAddonCallMinutes,
      addonRemaining: Math.max(0, org.addonCallMinutes - org.usedAddonCallMinutes),
    },
    aiMinutes: {
      used: org.usedAIMinutes,
      limit: aiLimit,
      percent: Math.round((org.usedAIMinutes / aiLimit) * 100),
      addonTotal: org.addonAIMinutes,
      addonUsed: org.usedAddonAIMinutes,
      addonRemaining: Math.max(0, org.addonAIMinutes - org.usedAddonAIMinutes),
      graceStartedAt: org.aiGraceStartedAt,
    },
    overage: {
      enabled: org.overageEnabled,
      capCents: org.overageCapCents,
      usedCents: org.overageUsedCents,
      remainingCents: Math.max(0, org.overageCapCents - org.overageUsedCents),
    },
    users: {
      current: org._count.users,
      limit: org.maxUsers || limits.maxUsers,
    },
    phoneNumbers: {
      current: org._count.phoneNumbers,
      limit: org.maxPhoneNumbers || limits.maxPhoneNumbers,
    },
    totals: {
      calls: org._count.callLogs,
      leads: org._count.leads,
    },
    resetsAt: org.usageResetAt,
  };
}

module.exports = {
  PLAN_LIMITS,
  ALERT_THRESHOLDS,
  checkUsageLimits,
  incrementUsage,
  checkTeamLimit,
  checkPhoneNumberLimit,
  usageCheckMiddleware,
  getUsageStats,
  checkAndCreateUsageAlerts,
};
