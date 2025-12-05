// ============================================================================
// HEKAX Phone - Pipedrive CRM Provider
// OAuth 2.0 integration with Pipedrive API
// ============================================================================

const BaseCRMProvider = require("./base");

class PipedriveProvider extends BaseCRMProvider {
  constructor() {
    super();
    this.baseUrl = "https://api.pipedrive.com/v1";
  }

  // ===========================================================================
  // OAUTH CONFIGURATION
  // ===========================================================================
  static getAuthUrl(redirectUri, state) {
    const clientId = process.env.PIPEDRIVE_CLIENT_ID;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
    });

    return `https://oauth.pipedrive.com/oauth/authorize?${params.toString()}`;
  }

  static async exchangeCode(code, redirectUri) {
    const credentials = Buffer.from(
      `${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch("https://oauth.pipedrive.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pipedrive token exchange failed: ${error}`);
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      apiDomain: data.api_domain, // Company-specific domain
    };
  }

  // ===========================================================================
  // TOKEN REFRESH
  // ===========================================================================
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const credentials = Buffer.from(
      `${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch("https://oauth.pipedrive.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh Pipedrive token");
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await this.saveTokens(data.access_token, data.refresh_token, expiresAt);
    console.log("✅ Pipedrive token refreshed");
  }

  // ===========================================================================
  // API REQUEST HELPER
  // ===========================================================================
  async apiRequest(endpoint, options = {}) {
    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }

    const baseUrl = this.instanceUrl || this.baseUrl;
    const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

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
      throw new Error(`Pipedrive API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (!data.success && data.error) {
      throw new Error(`Pipedrive API error: ${data.error}`);
    }

    return data;
  }

  // ===========================================================================
  // PERSON (CONTACT) METHODS
  // ===========================================================================
  async createOrUpdateContact(contact) {
    // Check if person exists
    let existing = null;
    if (contact.email) {
      existing = await this.findContactByEmail(contact.email);
    }
    if (!existing && contact.phone) {
      existing = await this.findContactByPhone(contact.phone);
    }

    const personData = {
      name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || "Unknown",
      email: contact.email ? [{ value: contact.email, primary: true }] : undefined,
      phone: contact.phone ? [{ value: this.formatPhoneE164(contact.phone), primary: true }] : undefined,
    };

    // Add organization if company provided
    let orgId = null;
    if (contact.company) {
      orgId = await this.findOrCreateOrganization(contact.company);
      if (orgId) {
        personData.org_id = orgId;
      }
    }

    if (existing) {
      // Update existing person
      const result = await this.apiRequest(`/persons/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify(personData),
      });

      // Add note about the call
      if (contact.notes) {
        await this.createNote(existing.id, contact.notes);
      }

      return {
        id: existing.id,
        isNew: false,
        ...result.data,
      };
    } else {
      // Create new person
      const result = await this.apiRequest("/persons", {
        method: "POST",
        body: JSON.stringify(personData),
      });

      // Add note about the call
      if (contact.notes) {
        await this.createNote(result.data.id, contact.notes);
      }

      return {
        id: result.data.id,
        isNew: true,
        ...result.data,
      };
    }
  }

  async findOrCreateOrganization(companyName) {
    if (!companyName) return null;

    try {
      // Search for existing org
      const searchResult = await this.apiRequest(`/organizations/search?term=${encodeURIComponent(companyName)}&limit=1`);

      if (searchResult.data?.items?.length > 0) {
        return searchResult.data.items[0].item.id;
      }

      // Create new org
      const createResult = await this.apiRequest("/organizations", {
        method: "POST",
        body: JSON.stringify({ name: companyName }),
      });

      return createResult.data.id;
    } catch (error) {
      console.error("Pipedrive org search/create error:", error.message);
      return null;
    }
  }

  async findContactByPhone(phone) {
    if (!phone) return null;

    const normalizedPhone = this.normalizePhone(phone);
    const last10 = normalizedPhone.slice(-10);

    try {
      const response = await this.apiRequest(`/persons/search?term=${encodeURIComponent(last10)}&fields=phone&limit=1`);

      if (response.data?.items?.length > 0) {
        const person = response.data.items[0].item;
        return {
          id: person.id,
          name: person.name,
          firstName: person.first_name,
          lastName: person.last_name,
          email: person.primary_email,
          phone: person.phones?.[0]?.value,
          company: person.organization?.name,
        };
      }

      return null;
    } catch (error) {
      console.error("Pipedrive phone search error:", error.message);
      return null;
    }
  }

  async findContactByEmail(email) {
    if (!email) return null;

    try {
      const response = await this.apiRequest(`/persons/search?term=${encodeURIComponent(email)}&fields=email&limit=1`);

      if (response.data?.items?.length > 0) {
        const person = response.data.items[0].item;
        return {
          id: person.id,
          name: person.name,
          firstName: person.first_name,
          lastName: person.last_name,
          email: person.primary_email,
          phone: person.phones?.[0]?.value,
          company: person.organization?.name,
        };
      }

      return null;
    } catch (error) {
      console.error("Pipedrive email search error:", error.message);
      return null;
    }
  }

  async updateContact(contactId, updates) {
    const data = {};

    if (updates.firstName || updates.lastName) {
      data.name = `${updates.firstName || ""} ${updates.lastName || ""}`.trim();
    }
    if (updates.email) {
      data.email = [{ value: updates.email, primary: true }];
    }
    if (updates.phone) {
      data.phone = [{ value: this.formatPhoneE164(updates.phone), primary: true }];
    }

    const result = await this.apiRequest(`/persons/${contactId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });

    return { id: contactId, ...result.data };
  }

  // ===========================================================================
  // ACTIVITY METHODS
  // ===========================================================================
  async createCallActivity(callData) {
    const activity = {
      subject: `Phone Call - ${callData.direction || "Inbound"}`,
      type: "call",
      done: 1,
      duration: this.formatDuration(callData.duration),
      note: callData.notes || `Call from ${callData.fromNumber} to ${callData.toNumber}`,
      due_date: new Date(callData.startTime).toISOString().split("T")[0],
      due_time: new Date(callData.startTime).toISOString().split("T")[1].slice(0, 5),
    };

    if (callData.contactId) {
      activity.person_id = callData.contactId;
    }

    const result = await this.apiRequest("/activities", {
      method: "POST",
      body: JSON.stringify(activity),
    });

    return {
      id: result.data.id,
      type: "activity",
    };
  }

  async createMeeting(meetingData) {
    const startDate = new Date(meetingData.startTime);

    const activity = {
      subject: meetingData.title || "Scheduled Meeting",
      type: "meeting",
      done: 0,
      duration: this.formatDuration(meetingData.duration * 60),
      note: meetingData.description || "",
      due_date: startDate.toISOString().split("T")[0],
      due_time: startDate.toISOString().split("T")[1].slice(0, 5),
    };

    if (meetingData.contactId) {
      activity.person_id = meetingData.contactId;
    }

    const result = await this.apiRequest("/activities", {
      method: "POST",
      body: JSON.stringify(activity),
    });

    return {
      id: result.data.id,
      type: "activity",
    };
  }

  async createNote(personId, noteContent) {
    const note = {
      content: noteContent,
      person_id: personId,
    };

    const result = await this.apiRequest("/notes", {
      method: "POST",
      body: JSON.stringify(note),
    });

    return {
      id: result.data.id,
      type: "note",
    };
  }

  // ===========================================================================
  // DEAL METHODS
  // ===========================================================================
  async createDeal(dealData) {
    const deal = {
      title: dealData.name || `Deal from ${dealData.contactName || "Phone Call"}`,
      value: dealData.amount || null,
      currency: "USD",
      expected_close_date: dealData.closeDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };

    if (dealData.contactId) {
      deal.person_id = dealData.contactId;
    }

    const result = await this.apiRequest("/deals", {
      method: "POST",
      body: JSON.stringify(deal),
    });

    return {
      id: result.data.id,
      type: "deal",
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================
  formatDuration(seconds) {
    if (!seconds) return "00:00:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  // ===========================================================================
  // GET USER INFO
  // ===========================================================================
  async getUserInfo() {
    const response = await this.apiRequest("/users/me");

    return {
      id: response.data.id,
      name: response.data.name,
      email: response.data.email,
      company: response.data.company_name,
    };
  }
}

module.exports = PipedriveProvider;
