// ============================================================================
// HEKAX Phone - Zoho CRM Provider
// OAuth 2.0 integration with Zoho CRM API v2
// ============================================================================

const BaseCRMProvider = require("./base");

class ZohoProvider extends BaseCRMProvider {
  constructor() {
    super();
    this.baseUrl = "https://www.zohoapis.com/crm/v2";
    this.authDomain = "https://accounts.zoho.com"; // .com for US, .eu for EU, .in for India
  }

  // ===========================================================================
  // OAUTH CONFIGURATION
  // ===========================================================================
  static getAuthUrl(redirectUri, state) {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const scopes = [
      "ZohoCRM.modules.ALL",
      "ZohoCRM.settings.ALL",
      "ZohoCRM.users.READ",
    ].join(",");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      scope: scopes,
      state,
      prompt: "consent",
    });

    return `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`;
  }

  static async exchangeCode(code, redirectUri) {
    const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Zoho token exchange failed: ${error}`);
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      apiDomain: data.api_domain, // e.g., https://www.zohoapis.com
    };
  }

  // ===========================================================================
  // TOKEN REFRESH
  // ===========================================================================
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(`${this.authDomain}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh Zoho token");
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await this.saveTokens(data.access_token, this.refreshToken, expiresAt);
    console.log("✅ Zoho token refreshed");
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
        Authorization: `Zoho-oauthtoken ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Zoho API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // ===========================================================================
  // CONTACT/LEAD METHODS
  // ===========================================================================
  async createOrUpdateContact(contact) {
    // Check if lead exists
    let existing = null;
    if (contact.email) {
      existing = await this.findContactByEmail(contact.email);
    }
    if (!existing && contact.phone) {
      existing = await this.findContactByPhone(contact.phone);
    }

    const leadData = {
      First_Name: contact.firstName || "",
      Last_Name: contact.lastName || "Unknown",
      Email: contact.email || "",
      Phone: this.formatPhoneE164(contact.phone) || "",
      Company: contact.company || "Unknown",
      Designation: contact.jobTitle || "",
      Lead_Source: contact.source || "Phone - AI Receptionist",
      Lead_Status: "New",
      Description: contact.notes || "",
    };

    if (existing) {
      // Update existing lead
      const result = await this.apiRequest("/Leads", {
        method: "PUT",
        body: JSON.stringify({
          data: [{ ...leadData, id: existing.id }],
        }),
      });

      return {
        id: existing.id,
        isNew: false,
        ...result.data?.[0],
      };
    } else {
      // Create new lead
      const result = await this.apiRequest("/Leads", {
        method: "POST",
        body: JSON.stringify({
          data: [leadData],
        }),
      });

      return {
        id: result.data?.[0]?.details?.id,
        isNew: true,
      };
    }
  }

  async findContactByPhone(phone) {
    if (!phone) return null;

    const normalizedPhone = this.normalizePhone(phone);
    const last10 = normalizedPhone.slice(-10);

    try {
      // Search in Leads
      const response = await this.apiRequest(`/Leads/search?phone=${encodeURIComponent(last10)}`);

      if (response.data && response.data.length > 0) {
        const record = response.data[0];
        return {
          id: record.id,
          type: "Leads",
          name: `${record.First_Name || ""} ${record.Last_Name || ""}`.trim(),
          firstName: record.First_Name,
          lastName: record.Last_Name,
          email: record.Email,
          phone: record.Phone,
          company: record.Company,
          jobTitle: record.Designation,
        };
      }

      // Also check Contacts
      const contactResponse = await this.apiRequest(`/Contacts/search?phone=${encodeURIComponent(last10)}`);

      if (contactResponse.data && contactResponse.data.length > 0) {
        const record = contactResponse.data[0];
        return {
          id: record.id,
          type: "Contacts",
          name: `${record.First_Name || ""} ${record.Last_Name || ""}`.trim(),
          firstName: record.First_Name,
          lastName: record.Last_Name,
          email: record.Email,
          phone: record.Phone,
          company: record.Account_Name?.name,
          jobTitle: record.Title,
        };
      }

      return null;
    } catch (error) {
      // Zoho returns error for no results
      if (error.message.includes("No matching record")) {
        return null;
      }
      console.error("Zoho phone search error:", error.message);
      return null;
    }
  }

  async findContactByEmail(email) {
    if (!email) return null;

    try {
      const response = await this.apiRequest(`/Leads/search?email=${encodeURIComponent(email)}`);

      if (response.data && response.data.length > 0) {
        const record = response.data[0];
        return {
          id: record.id,
          type: "Leads",
          name: `${record.First_Name || ""} ${record.Last_Name || ""}`.trim(),
          firstName: record.First_Name,
          lastName: record.Last_Name,
          email: record.Email,
          phone: record.Phone,
          company: record.Company,
          jobTitle: record.Designation,
        };
      }

      // Also check Contacts
      const contactResponse = await this.apiRequest(`/Contacts/search?email=${encodeURIComponent(email)}`);

      if (contactResponse.data && contactResponse.data.length > 0) {
        const record = contactResponse.data[0];
        return {
          id: record.id,
          type: "Contacts",
          name: `${record.First_Name || ""} ${record.Last_Name || ""}`.trim(),
          firstName: record.First_Name,
          lastName: record.Last_Name,
          email: record.Email,
          phone: record.Phone,
          company: record.Account_Name?.name,
          jobTitle: record.Title,
        };
      }

      return null;
    } catch (error) {
      if (error.message.includes("No matching record")) {
        return null;
      }
      console.error("Zoho email search error:", error.message);
      return null;
    }
  }

  async updateContact(contactId, updates) {
    const data = {};

    if (updates.firstName) data.First_Name = updates.firstName;
    if (updates.lastName) data.Last_Name = updates.lastName;
    if (updates.email) data.Email = updates.email;
    if (updates.phone) data.Phone = this.formatPhoneE164(updates.phone);
    if (updates.company) data.Company = updates.company;
    if (updates.jobTitle) data.Designation = updates.jobTitle;

    const result = await this.apiRequest("/Leads", {
      method: "PUT",
      body: JSON.stringify({
        data: [{ ...data, id: contactId }],
      }),
    });

    return { id: contactId };
  }

  // ===========================================================================
  // ACTIVITY METHODS
  // ===========================================================================
  async createCallActivity(callData) {
    const callRecord = {
      Subject: `Phone Call - ${callData.direction || "Inbound"}`,
      Call_Type: callData.direction === "OUTBOUND" ? "Outbound" : "Inbound",
      Call_Duration: `${Math.floor((callData.duration || 0) / 60)}:${String((callData.duration || 0) % 60).padStart(2, "0")}`,
      Call_Start_Time: new Date(callData.startTime).toISOString(),
      Call_Result: callData.status === "COMPLETED" ? "Call Completed" : "No Answer",
      Description: callData.notes || `Call from ${callData.fromNumber}`,
    };

    if (callData.contactId) {
      callRecord.What_Id = callData.contactId;
    }

    const result = await this.apiRequest("/Calls", {
      method: "POST",
      body: JSON.stringify({
        data: [callRecord],
      }),
    });

    return {
      id: result.data?.[0]?.details?.id,
      type: "Call",
    };
  }

  async createMeeting(meetingData) {
    const meeting = {
      Event_Title: meetingData.title || "Scheduled Meeting",
      Start_DateTime: new Date(meetingData.startTime).toISOString(),
      End_DateTime: new Date(new Date(meetingData.startTime).getTime() + (meetingData.duration || 30) * 60000).toISOString(),
      Description: meetingData.description || "",
    };

    if (meetingData.contactId) {
      meeting.Participants = [{ participant: meetingData.contactId, type: "lead" }];
    }

    const result = await this.apiRequest("/Events", {
      method: "POST",
      body: JSON.stringify({
        data: [meeting],
      }),
    });

    return {
      id: result.data?.[0]?.details?.id,
      type: "Event",
    };
  }

  async createNote(contactId, noteContent) {
    const note = {
      Note_Title: `AI Call Note - ${new Date().toISOString().split("T")[0]}`,
      Note_Content: noteContent,
      Parent_Id: contactId,
      se_module: "Leads",
    };

    const result = await this.apiRequest("/Notes", {
      method: "POST",
      body: JSON.stringify({
        data: [note],
      }),
    });

    return {
      id: result.data?.[0]?.details?.id,
      type: "Note",
    };
  }

  // ===========================================================================
  // DEAL METHODS
  // ===========================================================================
  async createDeal(dealData) {
    const deal = {
      Deal_Name: dealData.name || `Deal from ${dealData.contactName || "Phone Call"}`,
      Stage: dealData.stage || "Qualification",
      Closing_Date: dealData.closeDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      Amount: dealData.amount || null,
      Description: dealData.description || "Created from AI phone call",
      Lead_Source: "Phone - AI Receptionist",
    };

    if (dealData.contactId) {
      deal.Contact_Name = dealData.contactId;
    }

    const result = await this.apiRequest("/Deals", {
      method: "POST",
      body: JSON.stringify({
        data: [deal],
      }),
    });

    return {
      id: result.data?.[0]?.details?.id,
      type: "Deal",
    };
  }

  // ===========================================================================
  // GET USER INFO
  // ===========================================================================
  async getUserInfo() {
    const response = await this.apiRequest("/users?type=CurrentUser");

    if (response.users && response.users.length > 0) {
      const user = response.users[0];
      return {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role?.name,
      };
    }

    return null;
  }
}

module.exports = ZohoProvider;
