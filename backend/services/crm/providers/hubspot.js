// ============================================================================
// HEKAX Phone - HubSpot CRM Provider
// OAuth 2.0 integration with HubSpot CRM API
// ============================================================================

const BaseCRMProvider = require("./base");

class HubSpotProvider extends BaseCRMProvider {
  constructor() {
    super();
    this.baseUrl = "https://api.hubapi.com";
    this.authUrl = "https://app.hubspot.com/oauth/authorize";
    this.tokenUrl = "https://api.hubapi.com/oauth/v1/token";
  }

  // ===========================================================================
  // OAUTH CONFIGURATION
  // ===========================================================================
  static getAuthUrl(redirectUri, state) {
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const scopes = [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
      "crm.objects.companies.read",
      "crm.objects.companies.write",
      "sales-email-read",
      "timeline",
    ].join(" ");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
    });

    return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
  }

  static async exchangeCode(code, redirectUri) {
    const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HubSpot token exchange failed: ${error}`);
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };
  }

  // ===========================================================================
  // TOKEN REFRESH
  // ===========================================================================
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh HubSpot token");
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await this.saveTokens(data.access_token, data.refresh_token, expiresAt);
    console.log("✅ HubSpot token refreshed");
  }

  // ===========================================================================
  // API REQUEST HELPER
  // ===========================================================================
  async apiRequest(endpoint, options = {}) {
    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }

    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HubSpot API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // ===========================================================================
  // CONTACT METHODS
  // ===========================================================================
  async createOrUpdateContact(contact) {
    // First try to find existing contact
    let existingContact = null;
    if (contact.email) {
      existingContact = await this.findContactByEmail(contact.email);
    }
    if (!existingContact && contact.phone) {
      existingContact = await this.findContactByPhone(contact.phone);
    }

    const properties = {
      firstname: contact.firstName || "",
      lastname: contact.lastName || "",
      email: contact.email || "",
      phone: this.formatPhoneE164(contact.phone) || "",
      company: contact.company || "",
      jobtitle: contact.jobTitle || "",
      hs_lead_status: "NEW",
      lifecyclestage: "lead",
    };

    // Add custom properties if they exist in HubSpot
    if (contact.customFields) {
      if (contact.customFields.call_reason) {
        properties.message = contact.customFields.call_reason;
      }
    }

    if (contact.notes) {
      properties.hs_content_membership_notes = contact.notes.substring(0, 65535);
    }

    if (existingContact) {
      // Update existing contact
      const result = await this.apiRequest(`/crm/v3/objects/contacts/${existingContact.id}`, {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      });

      // Add note about the call
      if (contact.notes) {
        await this.createNote(existingContact.id, contact.notes);
      }

      return {
        id: result.id,
        isNew: false,
        ...result.properties,
      };
    } else {
      // Create new contact
      const result = await this.apiRequest("/crm/v3/objects/contacts", {
        method: "POST",
        body: JSON.stringify({ properties }),
      });

      // Add note about the call
      if (contact.notes) {
        await this.createNote(result.id, contact.notes);
      }

      return {
        id: result.id,
        isNew: true,
        ...result.properties,
      };
    }
  }

  async findContactByPhone(phone) {
    if (!phone) return null;

    const normalizedPhone = this.normalizePhone(phone);

    try {
      const response = await this.apiRequest("/crm/v3/objects/contacts/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "phone",
                  operator: "CONTAINS_TOKEN",
                  value: normalizedPhone.slice(-10), // Last 10 digits
                },
              ],
            },
          ],
          properties: ["firstname", "lastname", "email", "phone", "company", "jobtitle"],
          limit: 1,
        }),
      });

      if (response.results && response.results.length > 0) {
        const contact = response.results[0];
        return {
          id: contact.id,
          name: `${contact.properties.firstname || ""} ${contact.properties.lastname || ""}`.trim(),
          firstName: contact.properties.firstname,
          lastName: contact.properties.lastname,
          email: contact.properties.email,
          phone: contact.properties.phone,
          company: contact.properties.company,
          jobTitle: contact.properties.jobtitle,
        };
      }

      return null;
    } catch (error) {
      console.error("HubSpot phone search error:", error.message);
      return null;
    }
  }

  async findContactByEmail(email) {
    if (!email) return null;

    try {
      const response = await this.apiRequest("/crm/v3/objects/contacts/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  operator: "EQ",
                  value: email.toLowerCase(),
                },
              ],
            },
          ],
          properties: ["firstname", "lastname", "email", "phone", "company", "jobtitle"],
          limit: 1,
        }),
      });

      if (response.results && response.results.length > 0) {
        const contact = response.results[0];
        return {
          id: contact.id,
          name: `${contact.properties.firstname || ""} ${contact.properties.lastname || ""}`.trim(),
          firstName: contact.properties.firstname,
          lastName: contact.properties.lastname,
          email: contact.properties.email,
          phone: contact.properties.phone,
          company: contact.properties.company,
          jobTitle: contact.properties.jobtitle,
        };
      }

      return null;
    } catch (error) {
      console.error("HubSpot email search error:", error.message);
      return null;
    }
  }

  async updateContact(contactId, updates) {
    const properties = {};

    if (updates.firstName) properties.firstname = updates.firstName;
    if (updates.lastName) properties.lastname = updates.lastName;
    if (updates.email) properties.email = updates.email;
    if (updates.phone) properties.phone = this.formatPhoneE164(updates.phone);
    if (updates.company) properties.company = updates.company;
    if (updates.jobTitle) properties.jobtitle = updates.jobTitle;

    const result = await this.apiRequest(`/crm/v3/objects/contacts/${contactId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });

    return { id: result.id, ...result.properties };
  }

  // ===========================================================================
  // ACTIVITY METHODS
  // ===========================================================================
  async createCallActivity(callData) {
    // Create an engagement (call)
    const engagement = {
      engagement: {
        active: true,
        type: "CALL",
        timestamp: new Date(callData.startTime).getTime(),
      },
      associations: {
        contactIds: callData.contactId ? [callData.contactId] : [],
      },
      metadata: {
        toNumber: callData.toNumber,
        fromNumber: callData.fromNumber,
        status: callData.status === "COMPLETED" ? "COMPLETED" : "NO_ANSWER",
        durationMilliseconds: (callData.duration || 0) * 1000,
        disposition: callData.outcome || "Connected",
        body: callData.notes || `Call ${callData.direction?.toLowerCase() || ""}`,
      },
    };

    const result = await this.apiRequest("/engagements/v1/engagements", {
      method: "POST",
      body: JSON.stringify(engagement),
    });

    return {
      id: result.engagement.id,
      type: "call",
    };
  }

  async createMeeting(meetingData) {
    const startTime = new Date(meetingData.startTime).getTime();
    const endTime = startTime + (meetingData.duration || 30) * 60 * 1000;

    const engagement = {
      engagement: {
        active: true,
        type: "MEETING",
        timestamp: startTime,
      },
      associations: {
        contactIds: meetingData.contactId ? [meetingData.contactId] : [],
      },
      metadata: {
        title: meetingData.title,
        body: meetingData.description || "",
        startTime,
        endTime,
        internalMeetingNotes: meetingData.description,
      },
    };

    const result = await this.apiRequest("/engagements/v1/engagements", {
      method: "POST",
      body: JSON.stringify(engagement),
    });

    return {
      id: result.engagement.id,
      type: "meeting",
    };
  }

  async createNote(contactId, noteContent) {
    const engagement = {
      engagement: {
        active: true,
        type: "NOTE",
        timestamp: Date.now(),
      },
      associations: {
        contactIds: [contactId],
      },
      metadata: {
        body: noteContent,
      },
    };

    const result = await this.apiRequest("/engagements/v1/engagements", {
      method: "POST",
      body: JSON.stringify(engagement),
    });

    return {
      id: result.engagement.id,
      type: "note",
    };
  }

  // ===========================================================================
  // DEAL METHODS
  // ===========================================================================
  async createDeal(dealData) {
    const properties = {
      dealname: dealData.name || `Deal from ${dealData.contactName || "Phone Call"}`,
      pipeline: dealData.pipeline || "default",
      dealstage: dealData.stage || "appointmentscheduled",
      amount: dealData.amount || "",
      closedate: dealData.closeDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = await this.apiRequest("/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify({ properties }),
    });

    // Associate with contact if provided
    if (dealData.contactId) {
      await this.apiRequest(`/crm/v3/objects/deals/${result.id}/associations/contacts/${dealData.contactId}/deal_to_contact`, {
        method: "PUT",
      });
    }

    return {
      id: result.id,
      ...result.properties,
    };
  }

  // ===========================================================================
  // GET ACCOUNT INFO
  // ===========================================================================
  async getAccountInfo() {
    const response = await this.apiRequest("/oauth/v1/access-tokens/" + this.accessToken);

    return {
      hubId: response.hub_id,
      userId: response.user_id,
      appId: response.app_id,
      scopes: response.scopes,
    };
  }
}

module.exports = HubSpotProvider;
