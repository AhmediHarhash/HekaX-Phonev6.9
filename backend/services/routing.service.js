// ============================================================================
// HEKAX Phone - Call Routing Service
// Business hours, department routing, VIP handling
// ============================================================================

const prisma = require("../lib/prisma");

/**
 * Determine where to route an incoming call
 * Returns routing decision with context
 */
async function routeCall(organizationId, fromNumber, toNumber) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      callRoutes: {
        where: { enabled: true },
        orderBy: { priority: "asc" },
      },
    },
  });

  if (!org) {
    return {
      action: "ai",
      reason: "Organization not found - using AI",
    };
  }

  const now = new Date();
  const routingContext = {
    isBusinessHours: checkBusinessHours(org.businessHours, org.timezone),
    isVIP: false,
    matchedRoute: null,
    callerInfo: null,
  };

  // 1. Check if caller is VIP
  const vipCheck = await checkVIPCaller(organizationId, fromNumber);
  if (vipCheck.isVIP) {
    routingContext.isVIP = true;
    routingContext.callerInfo = vipCheck.contact;

    // VIP callers always get priority routing
    if (vipCheck.preferredAgent) {
      return {
        action: "transfer",
        target: vipCheck.preferredAgent,
        reason: "VIP caller - routing to preferred agent",
        context: routingContext,
      };
    }
  }

  // 2. Check custom routing rules
  if (org.callRoutes && org.callRoutes.length > 0) {
    for (const route of org.callRoutes) {
      if (matchesRoute(route, fromNumber, toNumber, routingContext)) {
        routingContext.matchedRoute = route;

        switch (route.action) {
          case "FORWARD":
            return {
              action: "forward",
              target: route.forwardNumber,
              reason: `Matched route: ${route.name}`,
              context: routingContext,
            };

          case "VOICEMAIL":
            return {
              action: "voicemail",
              greeting: route.customGreeting || org.afterHoursGreeting,
              reason: `Matched route: ${route.name}`,
              context: routingContext,
            };

          case "DEPARTMENT":
            return {
              action: "department",
              department: route.department,
              agents: await getDepartmentAgents(organizationId, route.department),
              reason: `Matched route: ${route.name}`,
              context: routingContext,
            };

          case "AI":
            return {
              action: "ai",
              personality: route.aiPersonality,
              reason: `Matched route: ${route.name}`,
              context: routingContext,
            };

          case "QUEUE":
            return {
              action: "queue",
              queueId: route.queueId,
              maxWaitTime: route.maxWaitTime || 300,
              reason: `Matched route: ${route.name}`,
              context: routingContext,
            };
        }
      }
    }
  }

  // 3. Check business hours
  if (!routingContext.isBusinessHours) {
    const afterHoursMode = org.afterHoursMode || "ai";

    switch (afterHoursMode) {
      case "voicemail":
        return {
          action: "voicemail",
          greeting: org.afterHoursGreeting,
          reason: "Outside business hours - voicemail",
          context: routingContext,
        };

      case "forward":
        return {
          action: "forward",
          target: org.afterHoursForwardNumber,
          reason: "Outside business hours - forwarding",
          context: routingContext,
        };

      case "ai":
      default:
        return {
          action: "ai",
          reason: "Outside business hours - AI handling",
          context: routingContext,
        };
    }
  }

  // 4. Default: AI receptionist
  return {
    action: "ai",
    reason: "Default routing to AI",
    context: routingContext,
  };
}

/**
 * Check if current time is within business hours
 */
function checkBusinessHours(businessHours, timezone = "America/New_York") {
  if (!businessHours) return true; // No hours set = always open

  try {
    const now = new Date();
    const options = { timeZone: timezone, weekday: "short" };
    const dayName = now.toLocaleString("en-US", options).toLowerCase().slice(0, 3);

    const dayConfig = businessHours[dayName];
    if (!dayConfig || !dayConfig.enabled) {
      return false;
    }

    // Get current time in org timezone
    const timeOptions = { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false };
    const currentTime = now.toLocaleString("en-US", timeOptions);

    // Compare times
    const [startHour, startMin] = dayConfig.start.split(":").map(Number);
    const [endHour, endMin] = dayConfig.end.split(":").map(Number);
    const [currentHour, currentMin] = currentTime.split(":").map(Number);

    const currentMinutes = currentHour * 60 + currentMin;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch (err) {
    console.error("❌ Business hours check error:", err);
    return true; // Default to open on error
  }
}

/**
 * Check if caller is a VIP contact
 */
async function checkVIPCaller(organizationId, phoneNumber) {
  // Check leads with VIP flag
  const vipLead = await prisma.lead.findFirst({
    where: {
      organizationId,
      phone: {
        contains: phoneNumber.replace(/\D/g, "").slice(-10),
      },
      isVIP: true,
    },
  });

  if (vipLead) {
    return {
      isVIP: true,
      contact: {
        id: vipLead.id,
        name: vipLead.name,
        phone: vipLead.phone,
        company: vipLead.company,
      },
      preferredAgent: vipLead.assignedToId,
    };
  }

  return { isVIP: false };
}

/**
 * Check if a route matches the current call
 */
function matchesRoute(route, fromNumber, toNumber, context) {
  // Time-based conditions
  if (route.scheduleStart && route.scheduleEnd) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [startHour, startMin] = route.scheduleStart.split(":").map(Number);
    const [endHour, endMin] = route.scheduleEnd.split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (currentTime < startMinutes || currentTime > endMinutes) {
      return false;
    }
  }

  // Day of week conditions
  if (route.daysOfWeek && route.daysOfWeek.length > 0) {
    const dayIndex = new Date().getDay();
    if (!route.daysOfWeek.includes(dayIndex)) {
      return false;
    }
  }

  // Phone number pattern matching
  if (route.callerPattern) {
    const pattern = new RegExp(route.callerPattern);
    if (!pattern.test(fromNumber)) {
      return false;
    }
  }

  // VIP-only routes
  if (route.vipOnly && !context.isVIP) {
    return false;
  }

  // Business hours only
  if (route.businessHoursOnly && !context.isBusinessHours) {
    return false;
  }

  return true;
}

/**
 * Get agents for a department
 */
async function getDepartmentAgents(organizationId, department) {
  const members = await prisma.userOrganization.findMany({
    where: {
      organizationId,
      department,
      status: "ACTIVE",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  });

  return members.map((m) => ({
    id: m.userId,
    name: m.user.name,
    phone: m.user.phone,
  }));
}

/**
 * Create or update a routing rule
 */
async function saveRoutingRule(organizationId, ruleData) {
  const {
    id,
    name,
    priority,
    action,
    forwardNumber,
    department,
    customGreeting,
    aiPersonality,
    scheduleStart,
    scheduleEnd,
    daysOfWeek,
    callerPattern,
    vipOnly,
    businessHoursOnly,
    enabled,
  } = ruleData;

  const data = {
    name,
    priority: priority || 0,
    action,
    forwardNumber,
    department,
    customGreeting,
    aiPersonality,
    scheduleStart,
    scheduleEnd,
    daysOfWeek,
    callerPattern,
    vipOnly: vipOnly || false,
    businessHoursOnly: businessHoursOnly || false,
    enabled: enabled !== false,
    organizationId,
  };

  if (id) {
    return prisma.callRoute.update({
      where: { id },
      data,
    });
  }

  return prisma.callRoute.create({
    data,
  });
}

/**
 * Delete a routing rule
 */
async function deleteRoutingRule(ruleId, organizationId) {
  return prisma.callRoute.deleteMany({
    where: {
      id: ruleId,
      organizationId,
    },
  });
}

/**
 * Get all routing rules for an organization
 */
async function getRoutingRules(organizationId) {
  return prisma.callRoute.findMany({
    where: { organizationId },
    orderBy: { priority: "asc" },
  });
}

module.exports = {
  routeCall,
  checkBusinessHours,
  checkVIPCaller,
  saveRoutingRule,
  deleteRoutingRule,
  getRoutingRules,
};
