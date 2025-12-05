// ============================================================================
// HEKAX Phone - Salesforce CRM Provider
// OAuth 2.0 integration with Salesforce REST API
// ============================================================================

const BaseCRMProvider = require("./base");

class SalesforceProvider extends BaseCRMProvider {
  constructor() {
    super();
    this.apiVersion = "v59.0";
  }

  // ===========================================================================
  // OAUTH CONFIGURATION
  // ===========================================================================
  static getAuthUrl(redirectUri, state) {
    const clientId = process.env.SALESFORCE_CLIENT_ID;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: "api refresh_token",
    });

    // Use login.salesforce.com for production, test.salesforce.com for sandbox
    return `https://login.salesforce.com/services/oauth2/authorize?${params.toString()}`;
  }

  static async exchangeCode(code, redirectUri) {
    const response = await fetch("https://login.salesforce.com/services/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.SALESFORCE_CLIENT_ID,
        client_secret: process.env.SALESFORCE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Salesforce token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // Salesforce tokens last ~2 hours
      instanceUrl: data.instance_url,
    };
  }

  // ===========================================================================
  // TOKEN REFRESH
  // ===========================================================================
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch("https://login.salesforce.com/services/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.SALESFORCE_CLIENT_ID,
        client_secret: process.env.SALESFORCE_CLIENT_SECRET,
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh Salesforce token");
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    this.instanceUrl = data.instance_url;
    await this.saveTokens(data.access_token, this.refreshToken, expiresAt);

    // Also update instance URL
    await this.prisma.crmIntegration.update({
      where: { id: this.integrationId },
      data: { instanceUrl: data.instance_url },
    });

    console.log("✅ Salesforce token refreshed");
  }

  // ===========================================================================
  // API REQUEST HELPER
  // ===========================================================================
  async apiRequest(endpoint, options = {}) {
    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }

    const baseUrl = `${this.instanceUrl}/services/data/${this.apiVersion}`;
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
      throw new Error(`Salesforce API error: ${response.status} - ${error}`);
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
    // Salesforce has both Leads and Contacts
    // For new prospects, we'll create Leads
    // Check if contact/lead exists first

    let existing = null;
    if (contact.email) {
      existing = await this.findContactByEmail(contact.email);
    }
    if (!existing && contact.phone) {
      existing = await this.findContactByPhone(contact.phone);
    }

    const leadData = {
      FirstName: contact.firstName || "",
      LastName: contact.lastName || "Unknown",
      Email: contact.email || "",
      Phone: this.formatPhoneE164(contact.phone) || "",
      Company: contact.company || "Unknown Company",
      Title: contact.jobTitle || "",
      LeadSource: contact.source || "Phone - AI Receptionist",
      Status: "New",
      Description: contact.notes || "",
    };

    // Add custom fields if configured
    if (contact.customFields) {
      if (contact.customFields.call_reason) {
        leadData.Description = `${contact.customFields.call_reason}\n\n${leadData.Description}`;
      }
    }

    if (existing) {
      // Update existing record
      await this.apiRequest(`/sobjects/${existing.type}/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify(leadData),
      });

      return {
        id: existing.id,
        type: existing.type,
        isNew: false,
      };
    } else {
      // Create new Lead
      const result = await this.apiRequest("/sobjects/Lead", {
        method: "POST",
        body: JSON.stringify(leadData),
      });

      return {
        id: result.id,
        type: "Lead",
        isNew: true,
      };
    }
  }

  async findContactByPhone(phone) {
    if (!phone) return null;

    const normalizedPhone = this.normalizePhone(phone);
    const last10 = normalizedPhone.slice(-10);

    // Search both Leads and Contacts
    const query = `SELECT Id, FirstName, LastName, Email, Phone, Company, Title
                   FROM Lead
                   WHERE Phone LIKE '%${last10}%'
                   LIMIT 1`;

    try {
      const response = await this.apiRequest(`/query?q=${encodeURIComponent(query)}`);

      if (response.records && response.records.length > 0) {
        const record = response.records[0];
        return {
          id: record.Id,
          type: "Lead",
          name: `${record.FirstName || ""} ${record.LastName || ""}`.trim(),
          firstName: record.FirstName,
          lastName: record.LastName,
          email: record.Email,
          phone: record.Phone,
          company: record.Company,
          jobTitle: record.Title,
        };
      }

      // Also check Contacts
      const contactQuery = `SELECT Id, FirstName, LastName, Email, Phone, Account.Name, Title
                            FROM Contact
                            WHERE Phone LIKE '%${last10}%'
                            LIMIT 1`;

      const contactResponse = await this.apiRequest(`/query?q=${encodeURIComponent(contactQuery)}`);

      if (contactResponse.records && contactResponse.records.length > 0) {
        const record = contactResponse.records[0];
        return {
          id: record.Id,
          type: "Contact",
          name: `${record.FirstName || ""} ${record.LastName || ""}`.trim(),
          firstName: record.FirstName,
          lastName: record.LastName,
          email: record.Email,
          phone: record.Phone,
          company: record.Account?.Name,
          jobTitle: record.Title,
        };
      }

      return null;
    } catch (error) {
      console.error("Salesforce phone search error:", error.message);
      return null;
    }
  }

  async findContactByEmail(email) {
    if (!email) return null;

    const query = `SELECT Id, FirstName, LastName, Email, Phone, Company, Title
                   FROM Lead
                   WHERE Email = '${email.replace(/'/g, "\\'")}'
                   LIMIT 1`;

    try {
      const response = await this.apiRequest(`/query?q=${encodeURIComponent(query)}`);

      if (response.records && response.records.length > 0) {
        const record = response.records[0];
        return {
          id: record.Id,
          type: "Lead",
          name: `${record.FirstName || ""} ${record.LastName || ""}`.trim(),
          firstName: record.FirstName,
          lastName: record.LastName,
          email: record.Email,
          phone: record.Phone,
          company: record.Company,
          jobTitle: record.Title,
        };
      }

      // Also check Contacts
      const contactQuery = `SELECT Id, FirstName, LastName, Email, Phone, Account.Name, Title
                            FROM Contact
                            WHERE Email = '${email.replace(/'/g, "\\'")}'
                            LIMIT 1`;

      const contactResponse = await this.apiRequest(`/query?q=${encodeURIComponent(contactQuery)}`);

      if (contactResponse.records && contactResponse.records.length > 0) {
        const record = contactResponse.records[0];
        return {
          id: record.Id,
          type: "Contact",
          name: `${record.FirstName || ""} ${record.LastName || ""}`.trim(),
          firstName: record.FirstName,
          lastName: record.LastName,
          email: record.Email,
          phone: record.Phone,
          company: record.Account?.Name,
          jobTitle: record.Title,
        };
      }

      return null;
    } catch (error) {
      console.error("Salesforce email search error:", error.message);
      return null;
    }
  }

  async updateContact(contactId, updates) {
    const data = {};

    if (updates.firstName) data.FirstName = updates.firstName;
    if (updates.lastName) data.LastName = updates.lastName;
    if (updates.email) data.Email = updates.email;
    if (updates.phone) data.Phone = this.formatPhoneE164(updates.phone);
    if (updates.company) data.Company = updates.company;
    if (updates.jobTitle) data.Title = updates.jobTitle;

    await this.apiRequest(`/sobjects/Lead/${contactId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });

    return { id: contactId };
  }

  // ===========================================================================
  // ACTIVITY METHODS
  // ===========================================================================
  async createCallActivity(callData) {
    const task = {
      Subject: `Phone Call - ${callData.direction || "Inbound"}`,
      Status: "Completed",
      Priority: "Normal",
      TaskSubtype: "Call",
      CallType: callData.direction === "OUTBOUND" ? "Outbound" : "Inbound",
      CallDurationInSeconds: callData.duration || 0,
      Description: callData.notes || `Call from ${callData.fromNumber} to ${callData.toNumber}`,
      ActivityDate: new Date(callData.startTime).toISOString().split("T")[0],
    };

    // Associate with Lead/Contact
    if (callData.contactId) {
      // Determine if it's a Lead or Contact
      const isLead = callData.contactType === "Lead";
      task.WhoId = isLead ? null : callData.contactId;
      if (isLead) {
        task.WhoId = callData.contactId;
      }
    }

    const result = await this.apiRequest("/sobjects/Task", {
      method: "POST",
      body: JSON.stringify(task),
    });

    return {
      id: result.id,
      type: "Task",
    };
  }

  async createMeeting(meetingData) {
    const event = {
      Subject: meetingData.title || "Scheduled Meeting",
      StartDateTime: new Date(meetingData.startTime).toISOString(),
      EndDateTime: new Date(new Date(meetingData.startTime).getTime() + (meetingData.duration || 30) * 60000).toISOString(),
      Description: meetingData.description || "",
      Type: "Meeting",
    };

    if (meetingData.contactId) {
      event.WhoId = meetingData.contactId;
    }

    const result = await this.apiRequest("/sobjects/Event", {
      method: "POST",
      body: JSON.stringify(event),
    });

    return {
      id: result.id,
      type: "Event",
    };
  }

  async createNote(contactId, noteContent) {
    // Salesforce uses ContentNote for notes
    const note = {
      Title: `AI Call Note - ${new Date().toISOString().split("T")[0]}`,
      Content: Buffer.from(noteContent).toString("base64"),
    };

    const result = await this.apiRequest("/sobjects/ContentNote", {
      method: "POST",
      body: JSON.stringify(note),
    });

    // Link note to the contact/lead
    await this.apiRequest("/sobjects/ContentDocumentLink", {
      method: "POST",
      body: JSON.stringify({
        ContentDocumentId: result.id,
        LinkedEntityId: contactId,
        ShareType: "V",
      }),
    });

    return {
      id: result.id,
      type: "ContentNote",
    };
  }

  // ===========================================================================
  // OPPORTUNITY METHODS
  // ===========================================================================
  async createDeal(dealData) {
    const opportunity = {
      Name: dealData.name || `Opportunity from ${dealData.contactName || "Phone Call"}`,
      StageName: dealData.stage || "Prospecting",
      CloseDate: dealData.closeDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      Amount: dealData.amount || null,
      Description: dealData.description || "Created from AI phone call",
      LeadSource: "Phone - AI Receptionist",
    };

    const result = await this.apiRequest("/sobjects/Opportunity", {
      method: "POST",
      body: JSON.stringify(opportunity),
    });

    return {
      id: result.id,
      type: "Opportunity",
    };
  }

  // ===========================================================================
  // GET USER INFO
  // ===========================================================================
  async getUserInfo() {
    const response = await this.apiRequest("/sobjects/User/Me");

    return {
      id: response.Id,
      name: response.Name,
      email: response.Email,
      username: response.Username,
    };
  }
}

module.exports = SalesforceProvider;
