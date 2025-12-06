// ============================================================================
// HEKAX Phone - SMS Service
// Auto-send follow-up SMS after calls
// ============================================================================

const twilio = require("twilio");
const prisma = require("../lib/prisma");
const { getClientForOrganization } = require("./twilio.service");

/**
 * Send SMS using organization's Twilio subaccount
 */
async function sendSMS(organizationId, to, body, options = {}) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        twilioNumber: true,
        twilioSubAccountSid: true,
        twilioSubAccountToken: true,
        name: true,
      },
    });

    if (!org?.twilioNumber) {
      throw new Error("Organization has no phone number configured");
    }

    const client = await getClientForOrganization(organizationId);

    const message = await client.messages.create({
      to,
      from: org.twilioNumber,
      body,
      ...(options.statusCallback && { statusCallback: options.statusCallback }),
    });

    console.log(`✅ SMS sent to ${to}: ${message.sid}`);

    // Log SMS usage
    await prisma.usageLog.create({
      data: {
        type: "sms",
        quantity: 1,
        unit: "messages",
        unitCost: 0.0079, // Twilio SMS rate
        totalCost: 0.0079,
        periodStart: new Date(),
        periodEnd: new Date(),
        organizationId,
      },
    });

    return {
      success: true,
      messageSid: message.sid,
      status: message.status,
    };
  } catch (error) {
    console.error("❌ SMS send error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send follow-up SMS after a call
 * Uses organization's SMS template settings
 */
async function sendCallFollowUp(callSid, organizationId) {
  try {
    // Get call details
    const call = await prisma.callLog.findUnique({
      where: { callSid },
      include: {
        organization: true,
        lead: true,
      },
    });

    if (!call) {
      console.log(`⚠️ Call not found for follow-up: ${callSid}`);
      return { success: false, error: "Call not found" };
    }

    // Get SMS settings from organization
    const org = call.organization;
    if (!org) {
      console.log(`⚠️ No organization for call: ${callSid}`);
      return { success: false, error: "No organization" };
    }

    // Check if SMS follow-up is enabled
    const smsSettings = org.smsSettings ? JSON.parse(org.smsSettings) : null;
    if (!smsSettings?.followUpEnabled) {
      console.log(`ℹ️ SMS follow-up disabled for org: ${org.name}`);
      return { success: false, error: "SMS follow-up disabled" };
    }

    // Don't send SMS for very short calls (likely spam/wrong number)
    if (call.duration < 10) {
      console.log(`ℹ️ Call too short for follow-up: ${call.duration}s`);
      return { success: false, error: "Call too short" };
    }

    // Build personalized message
    const callerNumber = call.direction === "INBOUND" ? call.fromNumber : call.toNumber;
    const callerName = call.lead?.name || "there";

    let template = smsSettings.followUpTemplate || getDefaultTemplate(org.industry);

    // Replace placeholders
    template = template
      .replace(/\{name\}/g, callerName)
      .replace(/\{company\}/g, org.name)
      .replace(/\{phone\}/g, org.twilioNumber || "")
      .replace(/\{duration\}/g, formatDuration(call.duration));

    // Send the SMS
    const result = await sendSMS(organizationId, callerNumber, template, {
      statusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/sms/status`,
    });

    if (result.success) {
      // Update call record with follow-up status
      await prisma.callLog.update({
        where: { callSid },
        data: {
          followUpSmsSent: true,
          followUpSmsSentAt: new Date(),
        },
      });
    }

    return result;
  } catch (error) {
    console.error("❌ Call follow-up error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get default SMS template based on industry
 */
function getDefaultTemplate(industry) {
  const templates = {
    healthcare: "Hi {name}, thank you for calling {company}. If you need to schedule an appointment or have questions, please call us back at {phone}. We're here to help!",
    legal: "Thank you for contacting {company}. If you have additional questions about your case, please call us at {phone}. We appreciate your trust in our firm.",
    realestate: "Hi {name}! Thanks for reaching out to {company}. Ready to find your perfect property? Call us at {phone} or visit our website for listings.",
    automotive: "Thanks for calling {company}! Whether you're looking for service or sales, we're here to help. Call us back at {phone} or stop by the dealership.",
    restaurant: "Thanks for calling {company}! We'd love to serve you. Make a reservation or order online, or call us at {phone}.",
    general: "Thank you for calling {company}. We appreciate your interest! If you have any questions, please don't hesitate to call us back at {phone}.",
  };

  return templates[industry] || templates.general;
}

/**
 * Send appointment reminder SMS
 */
async function sendAppointmentReminder(bookingId) {
  try {
    const booking = await prisma.calendarBooking.findUnique({
      where: { id: bookingId },
      include: {
        organization: true,
      },
    });

    if (!booking || !booking.organization) {
      return { success: false, error: "Booking not found" };
    }

    const org = booking.organization;
    const smsSettings = org.smsSettings ? JSON.parse(org.smsSettings) : null;

    if (!smsSettings?.appointmentReminders) {
      return { success: false, error: "Appointment reminders disabled" };
    }

    const appointmentDate = new Date(booking.scheduledAt);
    const formattedDate = appointmentDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const formattedTime = appointmentDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    const message = `Hi ${booking.callerName}, this is a reminder of your appointment with ${org.name} on ${formattedDate} at ${formattedTime}. Reply CONFIRM to confirm or call ${org.twilioNumber} to reschedule.`;

    return await sendSMS(org.id, booking.callerPhone, message);
  } catch (error) {
    console.error("❌ Appointment reminder error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send missed call notification SMS
 */
async function sendMissedCallNotification(callSid, organizationId) {
  try {
    const call = await prisma.callLog.findUnique({
      where: { callSid },
      include: { organization: true },
    });

    if (!call?.organization) {
      return { success: false, error: "Call or organization not found" };
    }

    const org = call.organization;
    const smsSettings = org.smsSettings ? JSON.parse(org.smsSettings) : null;

    if (!smsSettings?.missedCallSms) {
      return { success: false, error: "Missed call SMS disabled" };
    }

    const callerNumber = call.fromNumber;
    const message = `We missed your call to ${org.name}. We'll get back to you as soon as possible, or you can reach us at ${org.twilioNumber}. Thank you!`;

    return await sendSMS(organizationId, callerNumber, message);
  } catch (error) {
    console.error("❌ Missed call notification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Helper: Format duration for SMS
 */
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} seconds`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${mins} minute${mins > 1 ? "s" : ""}`;
  return `${mins}m ${secs}s`;
}

module.exports = {
  sendSMS,
  sendCallFollowUp,
  sendAppointmentReminder,
  sendMissedCallNotification,
  getDefaultTemplate,
};
