// ============================================================================
// HEKAX Phone - Google Calendar Provider
// OAuth 2.0 integration with Google Calendar API
// ============================================================================

const BaseCalendarProvider = require("./base");

class GoogleCalendarProvider extends BaseCalendarProvider {
  constructor() {
    super();
    this.baseUrl = "https://www.googleapis.com/calendar/v3";
    this.authUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    this.tokenUrl = "https://oauth2.googleapis.com/token";
  }

  // ===========================================================================
  // OAUTH CONFIGURATION
  // ===========================================================================
  static getAuthUrl(redirectUri, state) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const scopes = [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ].join(" ");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  static async exchangeCode(code, redirectUri) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token exchange failed: ${error}`);
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
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh Google token");
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await this.saveTokens(data.access_token, this.refreshToken, expiresAt);
    console.log("✅ Google Calendar token refreshed");
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
      throw new Error(`Google Calendar API error: ${error}`);
    }

    return response.json();
  }

  // ===========================================================================
  // GET AVAILABLE SLOTS
  // ===========================================================================
  async getAvailableSlots(date, duration = 30) {
    const calendarId = this.calendarId || "primary";

    // Get start and end of day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch busy times using freebusy API
    const freebusyResponse = await this.apiRequest("/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        items: [{ id: calendarId }],
      }),
    });

    const busySlots = freebusyResponse.calendars?.[calendarId]?.busy || [];

    // Generate available slots
    const slots = this.generateTimeSlots(date, duration, busySlots);

    return {
      available: slots.length > 0,
      slots,
      date: date.toISOString().split("T")[0],
    };
  }

  // ===========================================================================
  // CREATE EVENT
  // ===========================================================================
  async createEvent(event) {
    const calendarId = this.calendarId || "primary";

    const startTime = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
    const endTime = event.endTime instanceof Date ? event.endTime : new Date(event.endTime);

    const eventData = {
      summary: event.title,
      description: event.description,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: "America/New_York",
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: "America/New_York",
      },
      attendees: event.attendees?.map((email) => ({ email })) || [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 15 },
        ],
      },
      conferenceData: event.addVideoConference
        ? {
            createRequest: {
              requestId: `hekax-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          }
        : undefined,
      extendedProperties: {
        private: {
          bookedBy: "hekax-ai-receptionist",
          callerPhone: event.callerPhone || "",
          callerName: event.callerName || "",
          purpose: event.purpose || "",
        },
      },
    };

    // Add caller as attendee if email provided
    if (event.callerEmail) {
      eventData.attendees.push({ email: event.callerEmail });
    }

    const response = await this.apiRequest(
      `/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        body: JSON.stringify(eventData),
      }
    );

    console.log("✅ Google Calendar event created:", response.id);

    return {
      eventId: response.id,
      eventLink: response.htmlLink,
      confirmedTime: startTime,
      meetLink: response.conferenceData?.entryPoints?.[0]?.uri,
    };
  }

  // ===========================================================================
  // UPDATE EVENT
  // ===========================================================================
  async updateEvent(eventId, updates) {
    const calendarId = this.calendarId || "primary";

    const patchData = {};

    if (updates.startTime) {
      const startTime = updates.startTime instanceof Date ? updates.startTime : new Date(updates.startTime);
      const duration = updates.duration || 30;
      const endTime = new Date(startTime.getTime() + duration * 60000);

      patchData.start = {
        dateTime: startTime.toISOString(),
        timeZone: "America/New_York",
      };
      patchData.end = {
        dateTime: endTime.toISOString(),
        timeZone: "America/New_York",
      };
    }

    if (updates.title) {
      patchData.summary = updates.title;
    }

    if (updates.description) {
      patchData.description = updates.description;
    }

    const response = await this.apiRequest(
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=all`,
      {
        method: "PATCH",
        body: JSON.stringify(patchData),
      }
    );

    console.log("✅ Google Calendar event updated:", eventId);

    return {
      eventId: response.id,
      eventLink: response.htmlLink,
      confirmedTime: new Date(response.start.dateTime),
    };
  }

  // ===========================================================================
  // DELETE EVENT
  // ===========================================================================
  async deleteEvent(eventId, reason) {
    const calendarId = this.calendarId || "primary";

    await fetch(
      `${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=all`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    console.log("✅ Google Calendar event deleted:", eventId, reason ? `(${reason})` : "");
  }

  // ===========================================================================
  // GET EVENTS
  // ===========================================================================
  async getEvents(startDate, endDate) {
    const calendarId = this.calendarId || "primary";

    const params = new URLSearchParams({
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
    });

    const response = await this.apiRequest(
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
    );

    return (response.items || []).map((event) => ({
      id: event.id,
      title: event.summary,
      description: event.description,
      start: new Date(event.start.dateTime || event.start.date),
      end: new Date(event.end.dateTime || event.end.date),
      link: event.htmlLink,
      attendees: event.attendees?.map((a) => a.email) || [],
      location: event.location,
      meetLink: event.conferenceData?.entryPoints?.[0]?.uri,
      isAllDay: !event.start.dateTime,
    }));
  }

  // ===========================================================================
  // GET CALENDARS LIST
  // ===========================================================================
  async getCalendarsList() {
    const response = await this.apiRequest("/users/me/calendarList");

    return (response.items || []).map((cal) => ({
      id: cal.id,
      name: cal.summary,
      description: cal.description,
      primary: cal.primary || false,
      accessRole: cal.accessRole,
      backgroundColor: cal.backgroundColor,
    }));
  }
}

module.exports = GoogleCalendarProvider;
