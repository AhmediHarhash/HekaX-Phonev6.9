// ============================================================================
// HEKAX Phone - Microsoft Outlook 365 Calendar Provider
// OAuth 2.0 integration with Microsoft Graph API
// ============================================================================

const BaseCalendarProvider = require("./base");

class OutlookCalendarProvider extends BaseCalendarProvider {
  constructor() {
    super();
    this.baseUrl = "https://graph.microsoft.com/v1.0";
    this.authUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
    this.tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  }

  // ===========================================================================
  // OAUTH CONFIGURATION
  // ===========================================================================
  static getAuthUrl(redirectUri, state) {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const scopes = [
      "openid",
      "profile",
      "email",
      "offline_access",
      "Calendars.ReadWrite",
      "User.Read",
    ].join(" ");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      response_mode: "query",
      state,
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  static async exchangeCode(code, redirectUri) {
    const response = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          scope: "openid profile email offline_access Calendars.ReadWrite User.Read",
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Microsoft token exchange failed: ${error}`);
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
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
        scope: "openid profile email offline_access Calendars.ReadWrite User.Read",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh Microsoft token");
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await this.saveTokens(data.access_token, data.refresh_token || this.refreshToken, expiresAt);
    console.log("✅ Outlook Calendar token refreshed");
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
      throw new Error(`Microsoft Graph API error: ${error}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // ===========================================================================
  // GET AVAILABLE SLOTS
  // ===========================================================================
  async getAvailableSlots(date, duration = 30) {
    // Get start and end of day in ISO format
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Use Microsoft's findMeetingTimes or manually check calendar
    const scheduleResponse = await this.apiRequest("/me/calendar/getSchedule", {
      method: "POST",
      body: JSON.stringify({
        schedules: ["me"],
        startTime: {
          dateTime: startOfDay.toISOString(),
          timeZone: "America/New_York",
        },
        endTime: {
          dateTime: endOfDay.toISOString(),
          timeZone: "America/New_York",
        },
        availabilityViewInterval: 30,
      }),
    });

    // Parse availability view (each character represents a 30-min slot)
    // 0 = free, 1 = tentative, 2 = busy, 3 = out of office, 4 = working elsewhere
    const busySlots = [];
    const schedule = scheduleResponse.value?.[0];

    if (schedule?.scheduleItems) {
      for (const item of schedule.scheduleItems) {
        busySlots.push({
          start: item.start.dateTime,
          end: item.end.dateTime,
        });
      }
    }

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
    const startTime = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
    const endTime = event.endTime instanceof Date ? event.endTime : new Date(event.endTime);

    const eventData = {
      subject: event.title,
      body: {
        contentType: "text",
        content: event.description,
      },
      start: {
        dateTime: startTime.toISOString().slice(0, -1), // Remove Z for local time
        timeZone: "America/New_York",
      },
      end: {
        dateTime: endTime.toISOString().slice(0, -1),
        timeZone: "America/New_York",
      },
      location: {
        displayName: event.location || "Phone Call",
      },
      attendees: [],
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
    };

    // Add caller as attendee if email provided
    if (event.callerEmail) {
      eventData.attendees.push({
        emailAddress: {
          address: event.callerEmail,
          name: event.callerName || event.callerEmail,
        },
        type: "required",
      });
    }

    // Add other attendees
    if (event.attendees) {
      for (const email of event.attendees) {
        eventData.attendees.push({
          emailAddress: { address: email },
          type: "required",
        });
      }
    }

    // Add Teams meeting if requested
    if (event.addVideoConference) {
      eventData.isOnlineMeeting = true;
      eventData.onlineMeetingProvider = "teamsForBusiness";
    }

    const response = await this.apiRequest("/me/calendar/events", {
      method: "POST",
      body: JSON.stringify(eventData),
    });

    console.log("✅ Outlook Calendar event created:", response.id);

    return {
      eventId: response.id,
      eventLink: response.webLink,
      confirmedTime: startTime,
      meetLink: response.onlineMeeting?.joinUrl,
    };
  }

  // ===========================================================================
  // UPDATE EVENT
  // ===========================================================================
  async updateEvent(eventId, updates) {
    const patchData = {};

    if (updates.startTime) {
      const startTime = updates.startTime instanceof Date ? updates.startTime : new Date(updates.startTime);
      const duration = updates.duration || 30;
      const endTime = new Date(startTime.getTime() + duration * 60000);

      patchData.start = {
        dateTime: startTime.toISOString().slice(0, -1),
        timeZone: "America/New_York",
      };
      patchData.end = {
        dateTime: endTime.toISOString().slice(0, -1),
        timeZone: "America/New_York",
      };
    }

    if (updates.title) {
      patchData.subject = updates.title;
    }

    if (updates.description) {
      patchData.body = {
        contentType: "text",
        content: updates.description,
      };
    }

    const response = await this.apiRequest(`/me/calendar/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(patchData),
    });

    console.log("✅ Outlook Calendar event updated:", eventId);

    return {
      eventId: response.id,
      eventLink: response.webLink,
      confirmedTime: new Date(response.start.dateTime),
    };
  }

  // ===========================================================================
  // DELETE EVENT
  // ===========================================================================
  async deleteEvent(eventId, reason) {
    await this.apiRequest(`/me/calendar/events/${eventId}`, {
      method: "DELETE",
    });

    console.log("✅ Outlook Calendar event deleted:", eventId, reason ? `(${reason})` : "");
  }

  // ===========================================================================
  // GET EVENTS
  // ===========================================================================
  async getEvents(startDate, endDate) {
    const params = new URLSearchParams({
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
      $orderby: "start/dateTime",
      $top: "100",
    });

    const response = await this.apiRequest(`/me/calendar/calendarView?${params.toString()}`);

    return (response.value || []).map((event) => ({
      id: event.id,
      title: event.subject,
      description: event.bodyPreview,
      start: new Date(event.start.dateTime + "Z"),
      end: new Date(event.end.dateTime + "Z"),
      link: event.webLink,
      attendees: event.attendees?.map((a) => a.emailAddress.address) || [],
      location: event.location?.displayName,
      meetLink: event.onlineMeeting?.joinUrl,
      isAllDay: event.isAllDay,
    }));
  }

  // ===========================================================================
  // GET CALENDARS LIST
  // ===========================================================================
  async getCalendarsList() {
    const response = await this.apiRequest("/me/calendars");

    return (response.value || []).map((cal) => ({
      id: cal.id,
      name: cal.name,
      color: cal.color,
      isDefaultCalendar: cal.isDefaultCalendar,
      canEdit: cal.canEdit,
      owner: cal.owner?.address,
    }));
  }

  // ===========================================================================
  // GET USER PROFILE
  // ===========================================================================
  async getUserProfile() {
    const response = await this.apiRequest("/me");

    return {
      id: response.id,
      name: response.displayName,
      email: response.mail || response.userPrincipalName,
      jobTitle: response.jobTitle,
    };
  }
}

module.exports = OutlookCalendarProvider;
