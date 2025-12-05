// ============================================================================
// HEKAX Phone - Calendly Provider
// OAuth 2.0 integration with Calendly API v2
// ============================================================================

const BaseCalendarProvider = require("./base");

class CalendlyProvider extends BaseCalendarProvider {
  constructor() {
    super();
    this.baseUrl = "https://api.calendly.com";
    this.authUrl = "https://auth.calendly.com/oauth/authorize";
    this.tokenUrl = "https://auth.calendly.com/oauth/token";
    this.userUri = null; // Calendly user URI
    this.organizationUri = null; // Calendly organization URI
    this.eventTypeUri = null; // Default event type to use for booking
  }

  // ===========================================================================
  // OAUTH CONFIGURATION
  // ===========================================================================
  static getAuthUrl(redirectUri, state) {
    const clientId = process.env.CALENDLY_CLIENT_ID;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });

    return `https://auth.calendly.com/oauth/authorize?${params.toString()}`;
  }

  static async exchangeCode(code, redirectUri) {
    const response = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.CALENDLY_CLIENT_ID,
        client_secret: process.env.CALENDLY_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Calendly token exchange failed: ${error}`);
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
  // INITIALIZATION (Extended)
  // ===========================================================================
  async initialize(config) {
    await super.initialize(config);

    // Get user info to store URIs
    try {
      const userInfo = await this.apiRequest("/users/me");
      this.userUri = userInfo.resource.uri;
      this.organizationUri = userInfo.resource.current_organization;

      // Get default event type
      const eventTypes = await this.getEventTypes();
      if (eventTypes.length > 0) {
        this.eventTypeUri = eventTypes[0].uri;
      }
    } catch (error) {
      console.error("⚠️ Calendly initialization error:", error.message);
    }
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
        client_id: process.env.CALENDLY_CLIENT_ID,
        client_secret: process.env.CALENDLY_CLIENT_SECRET,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh Calendly token");
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await this.saveTokens(data.access_token, data.refresh_token || this.refreshToken, expiresAt);
    console.log("✅ Calendly token refreshed");
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
      throw new Error(`Calendly API error: ${error}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // ===========================================================================
  // GET EVENT TYPES
  // ===========================================================================
  async getEventTypes() {
    if (!this.userUri) {
      const userInfo = await this.apiRequest("/users/me");
      this.userUri = userInfo.resource.uri;
    }

    const response = await this.apiRequest(
      `/event_types?user=${encodeURIComponent(this.userUri)}&active=true`
    );

    return (response.collection || []).map((et) => ({
      uri: et.uri,
      name: et.name,
      description: et.description_plain,
      duration: et.duration,
      slug: et.slug,
      schedulingUrl: et.scheduling_url,
      color: et.color,
      type: et.type,
    }));
  }

  // ===========================================================================
  // GET AVAILABLE SLOTS
  // ===========================================================================
  async getAvailableSlots(date, duration = 30) {
    if (!this.eventTypeUri) {
      const eventTypes = await this.getEventTypes();
      if (eventTypes.length === 0) {
        return { available: false, slots: [], error: "No event types configured" };
      }
      // Find event type matching duration, or use first one
      const matchingType = eventTypes.find((et) => et.duration === duration) || eventTypes[0];
      this.eventTypeUri = matchingType.uri;
    }

    // Get start and end of day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Use Calendly's availability endpoint
    const params = new URLSearchParams({
      event_type: this.eventTypeUri,
      start_time: startOfDay.toISOString(),
      end_time: endOfDay.toISOString(),
    });

    try {
      const response = await this.apiRequest(`/event_type_available_times?${params.toString()}`);

      const slots = (response.collection || []).map((slot) => {
        const start = new Date(slot.start_time);
        const end = new Date(start.getTime() + duration * 60000);
        return {
          start,
          end,
          formatted: this.formatTimeSlot(start, end),
          status: slot.status,
        };
      });

      return {
        available: slots.length > 0,
        slots,
        date: date.toISOString().split("T")[0],
        schedulingUrl: this.getSchedulingUrl(),
      };
    } catch (error) {
      console.error("❌ Calendly availability error:", error.message);
      return { available: false, slots: [], error: error.message };
    }
  }

  // ===========================================================================
  // CREATE EVENT (Scheduling Link or One-Off)
  // ===========================================================================
  async createEvent(event) {
    // Calendly typically uses scheduling links, not direct event creation
    // For one-off events, we can use the invitee creation API

    if (!this.eventTypeUri) {
      const eventTypes = await this.getEventTypes();
      if (eventTypes.length === 0) {
        throw new Error("No event types configured in Calendly");
      }
      this.eventTypeUri = eventTypes[0].uri;
    }

    const startTime = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);

    // Create a one-off event using the scheduling API
    // Note: Calendly's API is primarily designed for invitees to book themselves
    // For AI-initiated booking, we create a "single-use scheduling link"

    try {
      const schedulingLinkResponse = await this.apiRequest("/scheduling_links", {
        method: "POST",
        body: JSON.stringify({
          max_event_count: 1,
          owner: this.eventTypeUri,
          owner_type: "EventType",
        }),
      });

      const schedulingUrl = schedulingLinkResponse.resource.booking_url;

      // For true integration, Calendly requires the invitee to complete booking
      // We'll return the scheduling link for the caller to use
      console.log("✅ Calendly scheduling link created");

      return {
        eventId: schedulingLinkResponse.resource.uri,
        eventLink: schedulingUrl,
        confirmedTime: startTime,
        needsInviteeAction: true,
        message: "Booking link generated - caller needs to confirm",
        schedulingUrl,
      };
    } catch (error) {
      // Fallback: return scheduling URL
      const eventTypes = await this.getEventTypes();
      const eventType = eventTypes[0];

      return {
        eventId: null,
        eventLink: eventType?.schedulingUrl,
        confirmedTime: startTime,
        needsInviteeAction: true,
        message: "Please use the scheduling link to book",
        schedulingUrl: eventType?.schedulingUrl,
      };
    }
  }

  // ===========================================================================
  // GET SCHEDULED EVENTS
  // ===========================================================================
  async getEvents(startDate, endDate) {
    if (!this.userUri) {
      const userInfo = await this.apiRequest("/users/me");
      this.userUri = userInfo.resource.uri;
    }

    const params = new URLSearchParams({
      user: this.userUri,
      min_start_time: startDate.toISOString(),
      max_start_time: endDate.toISOString(),
      status: "active",
    });

    const response = await this.apiRequest(`/scheduled_events?${params.toString()}`);

    return (response.collection || []).map((event) => ({
      id: event.uri,
      title: event.name,
      start: new Date(event.start_time),
      end: new Date(event.end_time),
      link: event.uri,
      location: event.location?.type,
      status: event.status,
      meetLink: event.location?.join_url,
      inviteesCount: event.invitees_counter?.total || 0,
    }));
  }

  // ===========================================================================
  // CANCEL EVENT
  // ===========================================================================
  async deleteEvent(eventId, reason) {
    await this.apiRequest(`${eventId}/cancellation`, {
      method: "POST",
      body: JSON.stringify({
        reason: reason || "Cancelled via AI Receptionist",
      }),
    });

    console.log("✅ Calendly event cancelled:", eventId);
  }

  // ===========================================================================
  // UPDATE EVENT (Limited in Calendly)
  // ===========================================================================
  async updateEvent(eventId, updates) {
    // Calendly has limited update capabilities
    // Most changes require cancellation and rebooking
    throw new Error("Calendly does not support event updates. Please cancel and rebook.");
  }

  // ===========================================================================
  // GET INVITEES FOR AN EVENT
  // ===========================================================================
  async getEventInvitees(eventUri) {
    const response = await this.apiRequest(`${eventUri}/invitees`);

    return (response.collection || []).map((invitee) => ({
      uri: invitee.uri,
      name: invitee.name,
      email: invitee.email,
      status: invitee.status,
      timezone: invitee.timezone,
      createdAt: new Date(invitee.created_at),
      questions: invitee.questions_and_answers,
    }));
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================
  getSchedulingUrl() {
    // Return the scheduling page URL for this user
    return `https://calendly.com/${this.userUri?.split("/").pop()}`;
  }

  // ===========================================================================
  // WEBHOOK SUBSCRIPTION (For real-time updates)
  // ===========================================================================
  async createWebhookSubscription(callbackUrl, events = ["invitee.created", "invitee.canceled"]) {
    if (!this.organizationUri) {
      const userInfo = await this.apiRequest("/users/me");
      this.organizationUri = userInfo.resource.current_organization;
    }

    const response = await this.apiRequest("/webhook_subscriptions", {
      method: "POST",
      body: JSON.stringify({
        url: callbackUrl,
        events,
        organization: this.organizationUri,
        scope: "organization",
      }),
    });

    console.log("✅ Calendly webhook subscription created");
    return response.resource;
  }

  async deleteWebhookSubscription(subscriptionUri) {
    await this.apiRequest(subscriptionUri, { method: "DELETE" });
    console.log("✅ Calendly webhook subscription deleted");
  }
}

module.exports = CalendlyProvider;
