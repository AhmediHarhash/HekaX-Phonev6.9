// ============================================================================
// HEKAX Phone - Automation Engine
// Central automation service for all automated workflows
// ============================================================================

const prisma = require("../lib/prisma");
const EventEmitter = require("events");

// Global event bus for automation triggers
const automationBus = new EventEmitter();
automationBus.setMaxListeners(50);

// ============================================================================
// EVENT TYPES
// ============================================================================

const EVENTS = {
  // Call events
  CALL_STARTED: "call:started",
  CALL_COMPLETED: "call:completed",
  CALL_MISSED: "call:missed",
  CALL_TRANSFERRED: "call:transferred",

  // Lead events
  LEAD_CREATED: "lead:created",
  LEAD_UPDATED: "lead:updated",
  LEAD_STATUS_CHANGED: "lead:statusChanged",
  LEAD_ASSIGNED: "lead:assigned",

  // Appointment events
  APPOINTMENT_BOOKED: "appointment:booked",
  APPOINTMENT_REMINDER: "appointment:reminder",
  APPOINTMENT_CANCELLED: "appointment:cancelled",
  APPOINTMENT_NO_SHOW: "appointment:noShow",

  // Feedback events
  FEEDBACK_SUBMITTED: "feedback:submitted",
  FEEDBACK_APPROVED: "feedback:approved",

  // Usage events
  USAGE_THRESHOLD_80: "usage:threshold80",
  USAGE_THRESHOLD_90: "usage:threshold90",
  USAGE_LIMIT_REACHED: "usage:limitReached",

  // Trial events
  TRIAL_ENDING_SOON: "trial:endingSoon",
  TRIAL_ENDED: "trial:ended",

  // Channel events
  MESSAGE_RECEIVED: "message:received",
  CONVERSATION_STARTED: "conversation:started",
};

// ============================================================================
// AUTOMATION RULES ENGINE
// ============================================================================

/**
 * Get automation rules for an organization
 */
async function getAutomationRules(organizationId) {
  return prisma.automationRule.findMany({
    where: { organizationId, enabled: true },
    orderBy: { priority: "desc" },
  });
}

/**
 * Create or update an automation rule
 */
async function saveAutomationRule(organizationId, data) {
  const { id, ...ruleData } = data;

  if (id) {
    return prisma.automationRule.update({
      where: { id, organizationId },
      data: ruleData,
    });
  }

  return prisma.automationRule.create({
    data: { ...ruleData, organizationId },
  });
}

/**
 * Delete an automation rule
 */
async function deleteAutomationRule(ruleId, organizationId) {
  return prisma.automationRule.delete({
    where: { id: ruleId, organizationId },
  });
}

/**
 * Execute automation rules for an event
 */
async function executeRules(organizationId, eventType, eventData) {
  const rules = await prisma.automationRule.findMany({
    where: {
      organizationId,
      enabled: true,
      triggerEvent: eventType,
    },
    orderBy: { priority: "desc" },
  });

  const results = [];

  for (const rule of rules) {
    try {
      // Check conditions
      if (!checkConditions(rule.conditions, eventData)) {
        continue;
      }

      // Execute actions
      const actionResults = await executeActions(
        organizationId,
        rule.actions,
        eventData
      );

      // Log execution
      await prisma.automationLog.create({
        data: {
          organizationId,
          ruleId: rule.id,
          ruleName: rule.name,
          triggerEvent: eventType,
          eventData: JSON.stringify(eventData),
          actionsExecuted: rule.actions,
          status: "SUCCESS",
          result: JSON.stringify(actionResults),
        },
      });

      results.push({ ruleId: rule.id, success: true, actions: actionResults });
    } catch (err) {
      console.error(`Automation rule ${rule.id} failed:`, err);

      await prisma.automationLog.create({
        data: {
          organizationId,
          ruleId: rule.id,
          ruleName: rule.name,
          triggerEvent: eventType,
          eventData: JSON.stringify(eventData),
          actionsExecuted: rule.actions,
          status: "FAILED",
          error: err.message,
        },
      });

      results.push({ ruleId: rule.id, success: false, error: err.message });
    }
  }

  return results;
}

/**
 * Check if conditions are met
 */
function checkConditions(conditions, eventData) {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
    return true;
  }

  return conditions.every((condition) => {
    const { field, operator, value } = condition;
    const fieldValue = getNestedValue(eventData, field);

    switch (operator) {
      case "equals":
        return fieldValue === value;
      case "notEquals":
        return fieldValue !== value;
      case "contains":
        return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      case "greaterThan":
        return Number(fieldValue) > Number(value);
      case "lessThan":
        return Number(fieldValue) < Number(value);
      case "in":
        return Array.isArray(value) && value.includes(fieldValue);
      case "exists":
        return fieldValue !== undefined && fieldValue !== null;
      default:
        return true;
    }
  });
}

/**
 * Get nested value from object
 */
function getNestedValue(obj, path) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

/**
 * Execute automation actions
 */
async function executeActions(organizationId, actions, eventData) {
  const results = [];

  for (const action of actions) {
    const result = await executeAction(organizationId, action, eventData);
    results.push({ action: action.type, result });
  }

  return results;
}

/**
 * Execute a single action
 */
async function executeAction(organizationId, action, eventData) {
  switch (action.type) {
    case "sendSms":
      return await sendSmsAction(organizationId, action, eventData);

    case "sendEmail":
      return await sendEmailAction(organizationId, action, eventData);

    case "updateLead":
      return await updateLeadAction(organizationId, action, eventData);

    case "assignLead":
      return await assignLeadAction(organizationId, action, eventData);

    case "createTask":
      return await createTaskAction(organizationId, action, eventData);

    case "syncCrm":
      return await syncCrmAction(organizationId, action, eventData);

    case "notify":
      return await notifyAction(organizationId, action, eventData);

    case "webhook":
      return await webhookAction(action, eventData);

    case "addToSequence":
      return await addToSequenceAction(organizationId, action, eventData);

    case "updateAiTraining":
      return await updateAiTrainingAction(organizationId, action, eventData);

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// ============================================================================
// ACTION IMPLEMENTATIONS
// ============================================================================

/**
 * Send SMS action
 */
async function sendSmsAction(organizationId, action, eventData) {
  const smsService = require("./sms.service");

  const phone = getNestedValue(eventData, action.phoneField) || eventData.phone;
  const message = interpolateTemplate(action.message, eventData);

  await smsService.sendSMS(organizationId, phone, message);
  return { sent: true, phone };
}

/**
 * Send Email action
 */
async function sendEmailAction(organizationId, action, eventData) {
  const emailService = require("./email.service");

  const email = getNestedValue(eventData, action.emailField) || eventData.email;
  const subject = interpolateTemplate(action.subject, eventData);
  const body = interpolateTemplate(action.body, eventData);

  await emailService.sendEmail({
    to: email,
    subject,
    html: body,
  });

  return { sent: true, email };
}

/**
 * Update lead action
 */
async function updateLeadAction(organizationId, action, eventData) {
  const leadId = eventData.leadId || eventData.id;

  const updateData = {};
  for (const [field, value] of Object.entries(action.updates || {})) {
    updateData[field] = interpolateTemplate(value, eventData);
  }

  await prisma.lead.update({
    where: { id: leadId, organizationId },
    data: updateData,
  });

  return { updated: true, leadId };
}

/**
 * Assign lead action
 */
async function assignLeadAction(organizationId, action, eventData) {
  const leadId = eventData.leadId || eventData.id;

  // Get agent based on strategy
  let agentId;

  switch (action.strategy) {
    case "roundRobin":
      agentId = await getNextRoundRobinAgent(organizationId);
      break;
    case "leastBusy":
      agentId = await getLeastBusyAgent(organizationId);
      break;
    case "specific":
      agentId = action.agentId;
      break;
    default:
      agentId = await getNextRoundRobinAgent(organizationId);
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      assignedToId: agentId,
      assignedAt: new Date(),
    },
  });

  return { assigned: true, leadId, agentId };
}

/**
 * Get next agent using round-robin
 */
async function getNextRoundRobinAgent(organizationId) {
  const agents = await prisma.userOrganization.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { in: ["AGENT", "MANAGER", "ADMIN", "OWNER"] },
    },
    include: {
      user: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (agents.length === 0) return null;

  // Get last assigned agent
  const lastAssignment = await prisma.lead.findFirst({
    where: { organizationId, assignedToId: { not: null } },
    orderBy: { assignedAt: "desc" },
    select: { assignedToId: true },
  });

  if (!lastAssignment) {
    return agents[0].user.id;
  }

  // Find next agent in rotation
  const lastIndex = agents.findIndex(
    (a) => a.user.id === lastAssignment.assignedToId
  );
  const nextIndex = (lastIndex + 1) % agents.length;

  return agents[nextIndex].user.id;
}

/**
 * Get least busy agent
 */
async function getLeastBusyAgent(organizationId) {
  const agents = await prisma.userOrganization.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { in: ["AGENT", "MANAGER", "ADMIN", "OWNER"] },
    },
    include: {
      user: {
        select: {
          id: true,
          _count: {
            select: {
              assignedLeads: {
                where: { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
              },
            },
          },
        },
      },
    },
  });

  if (agents.length === 0) return null;

  // Sort by active lead count
  agents.sort(
    (a, b) =>
      (a.user._count?.assignedLeads || 0) - (b.user._count?.assignedLeads || 0)
  );

  return agents[0].user.id;
}

/**
 * Create task action
 */
async function createTaskAction(organizationId, action, eventData) {
  const task = await prisma.task.create({
    data: {
      organizationId,
      title: interpolateTemplate(action.title, eventData),
      description: interpolateTemplate(action.description || "", eventData),
      dueAt: action.dueInHours
        ? new Date(Date.now() + action.dueInHours * 60 * 60 * 1000)
        : null,
      assignedToId: action.assignToField
        ? getNestedValue(eventData, action.assignToField)
        : null,
      relatedLeadId: eventData.leadId || eventData.id,
      priority: action.priority || "MEDIUM",
    },
  });

  return { created: true, taskId: task.id };
}

/**
 * Sync CRM action
 */
async function syncCrmAction(organizationId, action, eventData) {
  const crmService = require("./crm.service");

  const result = await crmService.syncLead(
    organizationId,
    eventData.leadId || eventData.id
  );

  return { synced: true, result };
}

/**
 * Notify action (internal notification)
 */
async function notifyAction(organizationId, action, eventData) {
  const message = interpolateTemplate(action.message, eventData);

  // Create internal notification
  await prisma.notification.create({
    data: {
      organizationId,
      type: action.notificationType || "INFO",
      title: action.title || "Automation Notification",
      message,
      targetUserId: action.targetUserId,
      data: eventData,
    },
  });

  // Also send via realtime if available
  try {
    const realtimeService = require("./realtime.service");
    realtimeService.broadcast(organizationId, "notification", {
      type: action.notificationType || "INFO",
      title: action.title,
      message,
    });
  } catch (err) {
    // Realtime not critical
  }

  return { notified: true };
}

/**
 * Webhook action
 */
async function webhookAction(action, eventData) {
  const response = await fetch(action.url, {
    method: action.method || "POST",
    headers: {
      "Content-Type": "application/json",
      ...(action.headers || {}),
    },
    body: JSON.stringify(eventData),
  });

  return { sent: true, status: response.status };
}

/**
 * Add to sequence action (for drip campaigns)
 */
async function addToSequenceAction(organizationId, action, eventData) {
  // Future: Add to email/SMS sequence
  // For now, schedule follow-up messages
  const leadId = eventData.leadId || eventData.id;

  await prisma.sequenceEnrollment.create({
    data: {
      organizationId,
      leadId,
      sequenceId: action.sequenceId,
      currentStep: 0,
      status: "ACTIVE",
      nextStepAt: new Date(Date.now() + (action.delayMinutes || 60) * 60 * 1000),
    },
  });

  return { enrolled: true, sequenceId: action.sequenceId };
}

/**
 * Update AI training action
 */
async function updateAiTrainingAction(organizationId, action, eventData) {
  if (action.createFaq && eventData.question && eventData.answer) {
    await prisma.aIFAQ.create({
      data: {
        organizationId,
        question: eventData.question,
        answer: eventData.answer,
        category: action.category || "auto-generated",
        priority: 0,
        keywords: [],
      },
    });
  }

  if (action.addToKnowledge && eventData.content) {
    await prisma.aIKnowledgeBase.create({
      data: {
        organizationId,
        title: eventData.title || "Auto-generated",
        content: eventData.content,
        category: action.category || "auto-generated",
        source: "automation",
      },
    });
  }

  return { updated: true };
}

/**
 * Interpolate template with event data
 */
function interpolateTemplate(template, data) {
  if (!template) return "";

  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    const value = getNestedValue(data, path);
    return value !== undefined ? String(value) : match;
  });
}

// ============================================================================
// EVENT EMISSION HELPERS
// ============================================================================

/**
 * Emit an automation event
 */
async function emit(eventType, organizationId, eventData) {
  console.log(`📡 Automation event: ${eventType}`, { organizationId });

  // Execute rules for this event
  const results = await executeRules(organizationId, eventType, eventData);

  // Also emit to event bus for real-time listeners
  automationBus.emit(eventType, { organizationId, ...eventData });

  return results;
}

/**
 * Subscribe to automation events
 */
function on(eventType, handler) {
  automationBus.on(eventType, handler);
}

/**
 * Unsubscribe from automation events
 */
function off(eventType, handler) {
  automationBus.off(eventType, handler);
}

// ============================================================================
// AUTOMATION LOGS
// ============================================================================

/**
 * Get automation logs
 */
async function getAutomationLogs(organizationId, options = {}) {
  const { status, ruleId, limit = 100, offset = 0 } = options;

  const where = { organizationId };
  if (status) where.status = status;
  if (ruleId) where.ruleId = ruleId;

  const [logs, total] = await Promise.all([
    prisma.automationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.automationLog.count({ where }),
  ]);

  return { logs, total, limit, offset };
}

module.exports = {
  EVENTS,
  getAutomationRules,
  saveAutomationRule,
  deleteAutomationRule,
  executeRules,
  emit,
  on,
  off,
  getAutomationLogs,
  interpolateTemplate,
};
