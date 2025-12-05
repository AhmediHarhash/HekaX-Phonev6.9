// ============================================================================
// HEKAX Phone - Generic Webhook Provider
// Send events to any external system via HTTP webhooks
// Supports Zapier, Make (Integromat), n8n, custom endpoints
// ============================================================================

const crypto = require("crypto");
const BaseCRMProvider = require("./base");

class WebhookProvider extends BaseCRMProvider {
  constructor() {
    super();
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  async initialize(config) {
    this.webhookUrl = config.webhookUrl;
    this.webhookSecret = config.apiKey; // Used for signing
    this.settings = config.settings || {};
    this.organizationId = config.organizationId;
    this.integrationId = config.integrationId;
    this.prisma = config.prisma;
    this.initialized = true;
  }

  // ===========================================================================
  // SEND WEBHOOK
  // ===========================================================================
  async sendWebhook(eventType, data) {
    if (!this.webhookUrl) {
      throw new Error("No webhook URL configured");
    }

    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      source: "hekax-phone",
      version: "1.0",
      data,
    };

    const headers = {
      "Content-Type": "application/json",
      "X-HEKAX-Event": eventType,
      "X-HEKAX-Timestamp": payload.timestamp,
      "User-Agent": "HEKAX-Phone-Webhook/1.0",
    };

    // Add signature if secret is configured
    if (this.webhookSecret) {
      const signature = this.generateSignature(JSON.stringify(payload));
      headers["X-HEKAX-Signature"] = signature;
    }

    // Add custom headers from settings
    if (this.settings.customHeaders) {
      Object.assign(headers, this.settings.customHeaders);
    }

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Webhook failed: ${response.status} - ${error}`);
    }

    return {
      success: true,
      statusCode: response.status,
      eventType,
    };
  }

  // ===========================================================================
  // GENERATE SIGNATURE (HMAC-SHA256)
  // ===========================================================================
  generateSignature(payload) {
    return crypto
      .createHmac("sha256", this.webhookSecret)
      .update(payload)
      .digest("hex");
  }

  // ===========================================================================
  // CRM INTERFACE METHODS (Adapted for Webhooks)
  // ===========================================================================
  async createOrUpdateContact(contact) {
    const result = await this.sendWebhook("contact.created", {
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        jobTitle: contact.jobTitle,
        source: contact.source,
        notes: contact.notes,
        customFields: contact.customFields,
      },
    });

    return {
      id: `webhook_${Date.now()}`,
      isNew: true,
      ...result,
    };
  }

  async findContactByPhone(phone) {
    // Webhooks are typically one-way, no lookup capability
    return null;
  }

  async findContactByEmail(email) {
    // Webhooks are typically one-way, no lookup capability
    return null;
  }

  async updateContact(contactId, updates) {
    const result = await this.sendWebhook("contact.updated", {
      contactId,
      updates,
    });

    return { id: contactId, ...result };
  }

  async createCallActivity(callData) {
    const result = await this.sendWebhook("call.completed", {
      call: {
        direction: callData.direction,
        duration: callData.duration,
        status: callData.status,
        fromNumber: callData.fromNumber,
        toNumber: callData.toNumber,
        recordingUrl: callData.recordingUrl,
        startTime: callData.startTime,
        endTime: callData.endTime,
        outcome: callData.outcome,
        handledByAI: callData.customFields?.handled_by_ai,
        transferredToHuman: callData.customFields?.transferred_to_human,
        callSid: callData.customFields?.hekax_call_sid,
      },
      transcript: callData.notes,
      contactId: callData.contactId,
    });

    return {
      id: `webhook_call_${Date.now()}`,
      type: "webhook",
      ...result,
    };
  }

  async createMeeting(meetingData) {
    const result = await this.sendWebhook("appointment.created", {
      appointment: {
        title: meetingData.title,
        startTime: meetingData.startTime,
        duration: meetingData.duration,
        description: meetingData.description,
        attendeeName: meetingData.attendeeName,
        attendeeEmail: meetingData.attendeeEmail,
        bookedByAI: true,
      },
      contactId: meetingData.contactId,
    });

    return {
      id: `webhook_meeting_${Date.now()}`,
      type: "webhook",
      ...result,
    };
  }

  async createNote(contactId, noteContent) {
    const result = await this.sendWebhook("note.created", {
      contactId,
      note: noteContent,
    });

    return {
      id: `webhook_note_${Date.now()}`,
      type: "webhook",
      ...result,
    };
  }

  async createDeal(dealData) {
    const result = await this.sendWebhook("deal.created", {
      deal: {
        name: dealData.name,
        amount: dealData.amount,
        stage: dealData.stage,
        closeDate: dealData.closeDate,
        description: dealData.description,
      },
      contactId: dealData.contactId,
      contactName: dealData.contactName,
    });

    return {
      id: `webhook_deal_${Date.now()}`,
      type: "webhook",
      ...result,
    };
  }

  // ===========================================================================
  // TEST WEBHOOK
  // ===========================================================================
  async testConnection() {
    try {
      const result = await this.sendWebhook("test", {
        message: "This is a test webhook from HEKAX Phone",
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        statusCode: result.statusCode,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// ===========================================================================
// WEBHOOK EVENT TYPES
// ===========================================================================
const WebhookEvents = {
  // Contact events
  CONTACT_CREATED: "contact.created",
  CONTACT_UPDATED: "contact.updated",

  // Call events
  CALL_STARTED: "call.started",
  CALL_COMPLETED: "call.completed",
  CALL_TRANSFERRED: "call.transferred",
  CALL_MISSED: "call.missed",

  // Lead events
  LEAD_CAPTURED: "lead.captured",
  LEAD_QUALIFIED: "lead.qualified",

  // Appointment events
  APPOINTMENT_CREATED: "appointment.created",
  APPOINTMENT_CANCELLED: "appointment.cancelled",
  APPOINTMENT_RESCHEDULED: "appointment.rescheduled",

  // Transcript events
  TRANSCRIPT_READY: "transcript.ready",

  // Other events
  VOICEMAIL_RECEIVED: "voicemail.received",
  CALLBACK_REQUESTED: "callback.requested",
  URGENT_ISSUE: "urgent.issue",

  // Test
  TEST: "test",
};

module.exports = WebhookProvider;
module.exports.WebhookEvents = WebhookEvents;
