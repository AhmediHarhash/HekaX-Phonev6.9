// ============================================================================
// HEKAX Phone - CRM Service
// Unified CRM integration for HubSpot, Salesforce, Zoho, Pipedrive + Webhooks
// ============================================================================

const HubSpotProvider = require("./providers/hubspot");
const SalesforceProvider = require("./providers/salesforce");
const ZohoProvider = require("./providers/zoho");
const PipedriveProvider = require("./providers/pipedrive");
const WebhookProvider = require("./providers/webhook");

// ============================================================================
// CRM PROVIDER TYPES
// ============================================================================
const CRMProvider = {
  HUBSPOT: "hubspot",
  SALESFORCE: "salesforce",
  ZOHO: "zoho",
  PIPEDRIVE: "pipedrive",
  WEBHOOK: "webhook",
};

// ============================================================================
// SYNC TYPES
// ============================================================================
const SyncType = {
  LEAD: "lead",
  CONTACT: "contact",
  CALL: "call",
  TRANSCRIPT: "transcript",
  APPOINTMENT: "appointment",
  NOTE: "note",
};

// ============================================================================
// UNIFIED CRM SERVICE
// ============================================================================
class CRMService {
  constructor(prisma) {
    this.prisma = prisma;
    this.providers = {
      [CRMProvider.HUBSPOT]: new HubSpotProvider(),
      [CRMProvider.SALESFORCE]: new SalesforceProvider(),
      [CRMProvider.ZOHO]: new ZohoProvider(),
      [CRMProvider.PIPEDRIVE]: new PipedriveProvider(),
      [CRMProvider.WEBHOOK]: new WebhookProvider(),
    };
  }

  // ===========================================================================
  // GET ACTIVE INTEGRATIONS FOR ORGANIZATION
  // ===========================================================================
  async getActiveIntegrations(organizationId) {
    const integrations = await this.prisma.crmIntegration.findMany({
      where: {
        organizationId,
        enabled: true,
      },
    });

    return integrations;
  }

  // ===========================================================================
  // GET PROVIDER INSTANCE
  // ===========================================================================
  async getProvider(integration) {
    const provider = this.providers[integration.provider.toLowerCase()];
    if (!provider) {
      throw new Error(`Unknown CRM provider: ${integration.provider}`);
    }

    await provider.initialize({
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken,
      expiresAt: integration.tokenExpiresAt,
      instanceUrl: integration.instanceUrl,
      apiKey: integration.apiKey,
      webhookUrl: integration.webhookUrl,
      organizationId: integration.organizationId,
      integrationId: integration.id,
      settings: integration.settings,
      prisma: this.prisma,
    });

    return provider;
  }

  // ===========================================================================
  // SYNC LEAD TO ALL CONNECTED CRMs
  // ===========================================================================
  async syncLead(organizationId, lead) {
    const integrations = await this.getActiveIntegrations(organizationId);
    const results = [];

    for (const integration of integrations) {
      try {
        const provider = await this.getProvider(integration);
        const result = await provider.createOrUpdateContact({
          firstName: this.extractFirstName(lead.name),
          lastName: this.extractLastName(lead.name),
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          jobTitle: lead.jobTitle,
          source: "HEKAX Phone - AI Call",
          notes: this.formatLeadNotes(lead),
          customFields: {
            hekax_lead_id: lead.id,
            hekax_call_sid: lead.callSid,
            call_reason: lead.reason,
            urgency: lead.urgency,
            service_interest: lead.serviceInterest,
          },
        });

        // Log sync
        await this.logSync(integration.id, SyncType.LEAD, lead.id, result);

        results.push({
          provider: integration.provider,
          success: true,
          externalId: result.id,
        });

        console.log(`✅ Lead synced to ${integration.provider}:`, result.id);
      } catch (error) {
        console.error(`❌ Lead sync failed for ${integration.provider}:`, error.message);
        results.push({
          provider: integration.provider,
          success: false,
          error: error.message,
        });

        // Log failed sync
        await this.logSync(integration.id, SyncType.LEAD, lead.id, null, error.message);
      }
    }

    return results;
  }

  // ===========================================================================
  // SYNC CALL LOG TO ALL CONNECTED CRMs
  // ===========================================================================
  async syncCall(organizationId, callLog, transcript = null) {
    const integrations = await this.getActiveIntegrations(organizationId);
    const results = [];

    for (const integration of integrations) {
      // Check if call sync is enabled for this integration
      if (!integration.syncCalls) continue;

      try {
        const provider = await this.getProvider(integration);

        // First, find or create contact
        let contactId = null;
        if (callLog.fromNumber) {
          const contact = await provider.findContactByPhone(callLog.fromNumber);
          contactId = contact?.id;
        }

        // Create call activity
        const result = await provider.createCallActivity({
          contactId,
          direction: callLog.direction,
          duration: callLog.duration,
          status: callLog.status,
          fromNumber: callLog.fromNumber,
          toNumber: callLog.toNumber,
          recordingUrl: callLog.recordingUrl,
          startTime: callLog.createdAt,
          endTime: callLog.endedAt,
          outcome: callLog.handledByAI ? "AI Handled" : "Human Handled",
          notes: transcript ? this.formatTranscriptNotes(transcript) : null,
          customFields: {
            hekax_call_sid: callLog.callSid,
            handled_by_ai: callLog.handledByAI,
            transferred_to_human: callLog.transferredToHuman,
          },
        });

        await this.logSync(integration.id, SyncType.CALL, callLog.id, result);

        results.push({
          provider: integration.provider,
          success: true,
          externalId: result.id,
        });

        console.log(`✅ Call synced to ${integration.provider}:`, result.id);
      } catch (error) {
        console.error(`❌ Call sync failed for ${integration.provider}:`, error.message);
        results.push({
          provider: integration.provider,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  // ===========================================================================
  // SYNC APPOINTMENT TO ALL CONNECTED CRMs
  // ===========================================================================
  async syncAppointment(organizationId, appointment) {
    const integrations = await this.getActiveIntegrations(organizationId);
    const results = [];

    for (const integration of integrations) {
      if (!integration.syncAppointments) continue;

      try {
        const provider = await this.getProvider(integration);

        // Find contact
        let contactId = null;
        if (appointment.callerPhone || appointment.callerEmail) {
          const contact = await provider.findContactByPhone(appointment.callerPhone) ||
                          await provider.findContactByEmail(appointment.callerEmail);
          contactId = contact?.id;
        }

        const result = await provider.createMeeting({
          contactId,
          title: `Call: ${appointment.purpose || "Scheduled Call"}`,
          startTime: appointment.scheduledAt,
          duration: appointment.duration,
          description: this.formatAppointmentNotes(appointment),
          attendeeEmail: appointment.callerEmail,
          attendeeName: appointment.callerName,
          customFields: {
            hekax_booking_id: appointment.id,
            booked_by_ai: appointment.bookedByAI,
          },
        });

        await this.logSync(integration.id, SyncType.APPOINTMENT, appointment.id, result);

        results.push({
          provider: integration.provider,
          success: true,
          externalId: result.id,
        });

        console.log(`✅ Appointment synced to ${integration.provider}:`, result.id);
      } catch (error) {
        console.error(`❌ Appointment sync failed for ${integration.provider}:`, error.message);
        results.push({
          provider: integration.provider,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  // ===========================================================================
  // LOOKUP CONTACT FROM CRM (for caller ID)
  // ===========================================================================
  async lookupContact(organizationId, phone, email = null) {
    const integrations = await this.getActiveIntegrations(organizationId);

    for (const integration of integrations) {
      try {
        const provider = await this.getProvider(integration);

        let contact = null;
        if (phone) {
          contact = await provider.findContactByPhone(phone);
        }
        if (!contact && email) {
          contact = await provider.findContactByEmail(email);
        }

        if (contact) {
          console.log(`✅ Contact found in ${integration.provider}:`, contact.name);
          return {
            found: true,
            provider: integration.provider,
            contact: {
              id: contact.id,
              name: contact.name,
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
              phone: contact.phone,
              company: contact.company,
              jobTitle: contact.jobTitle,
              notes: contact.notes,
              customFields: contact.customFields,
            },
          };
        }
      } catch (error) {
        console.error(`⚠️ Contact lookup failed for ${integration.provider}:`, error.message);
      }
    }

    return { found: false };
  }

  // ===========================================================================
  // TRIGGER WEBHOOKS
  // ===========================================================================
  async triggerWebhooks(organizationId, eventType, data) {
    const integrations = await this.prisma.crmIntegration.findMany({
      where: {
        organizationId,
        provider: "WEBHOOK",
        enabled: true,
      },
    });

    const results = [];

    for (const integration of integrations) {
      try {
        const provider = await this.getProvider(integration);
        const result = await provider.sendWebhook(eventType, {
          ...data,
          organizationId,
          timestamp: new Date().toISOString(),
        });

        results.push({
          webhookUrl: integration.webhookUrl,
          success: true,
          statusCode: result.statusCode,
        });

        console.log(`✅ Webhook sent to ${integration.webhookUrl}`);
      } catch (error) {
        console.error(`❌ Webhook failed for ${integration.webhookUrl}:`, error.message);
        results.push({
          webhookUrl: integration.webhookUrl,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  // ===========================================================================
  // LOG SYNC ACTIVITY
  // ===========================================================================
  async logSync(integrationId, syncType, entityId, result, error = null) {
    try {
      await this.prisma.crmSyncLog.create({
        data: {
          crmIntegrationId: integrationId,
          syncType,
          entityId,
          externalId: result?.id || null,
          status: error ? "FAILED" : "SUCCESS",
          error,
          responseData: result ? JSON.stringify(result) : null,
        },
      });
    } catch (err) {
      console.error("⚠️ Failed to log sync:", err.message);
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================
  extractFirstName(fullName) {
    if (!fullName) return "Unknown";
    const parts = fullName.trim().split(" ");
    return parts[0] || "Unknown";
  }

  extractLastName(fullName) {
    if (!fullName) return "";
    const parts = fullName.trim().split(" ");
    return parts.slice(1).join(" ") || "";
  }

  formatLeadNotes(lead) {
    const lines = [
      "📞 Lead captured via HEKAX Phone AI",
      "",
      `Reason for calling: ${lead.reason || "Not specified"}`,
      `Service interest: ${lead.serviceInterest || "Not specified"}`,
      `Urgency: ${lead.urgency || "MEDIUM"}`,
      "",
      lead.preferredCallbackTime ? `Preferred callback: ${lead.preferredCallbackTime}` : "",
      lead.appointmentDate ? `Appointment requested: ${lead.appointmentDate} ${lead.appointmentTime || ""}` : "",
      "",
      `Source: AI Phone Call`,
      `Call SID: ${lead.callSid}`,
    ].filter(Boolean);

    return lines.join("\n");
  }

  formatTranscriptNotes(transcript) {
    const lines = [
      "📝 Call Transcript (AI Handled)",
      "",
      `Summary: ${transcript.summary || "No summary available"}`,
      "",
      "--- Full Transcript ---",
      transcript.fullText || "No transcript available",
    ];

    return lines.join("\n");
  }

  formatAppointmentNotes(appointment) {
    const lines = [
      "📅 Appointment booked via HEKAX Phone AI",
      "",
      `Purpose: ${appointment.purpose || "Not specified"}`,
      `Caller: ${appointment.callerName || "Unknown"}`,
      `Phone: ${appointment.callerPhone || "Not provided"}`,
      `Email: ${appointment.callerEmail || "Not provided"}`,
      "",
      appointment.bookedByAI ? "Booked automatically by AI receptionist" : "Manually scheduled",
    ];

    return lines.join("\n");
  }
}

module.exports = { CRMService, CRMProvider, SyncType };
