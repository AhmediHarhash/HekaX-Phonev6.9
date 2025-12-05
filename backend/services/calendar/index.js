// ============================================================================
// HEKAX Phone - Calendar Service
// Unified calendar integration for Google, Outlook, and Calendly
// ============================================================================

const GoogleCalendarProvider = require("./providers/google");
const OutlookCalendarProvider = require("./providers/outlook");
const CalendlyProvider = require("./providers/calendly");

// ============================================================================
// CALENDAR PROVIDER TYPES
// ============================================================================
const CalendarProvider = {
  GOOGLE: "google",
  OUTLOOK: "outlook",
  CALENDLY: "calendly",
};

// ============================================================================
// UNIFIED CALENDAR SERVICE
// ============================================================================
class CalendarService {
  constructor(prisma) {
    this.prisma = prisma;
    this.providers = {
      [CalendarProvider.GOOGLE]: new GoogleCalendarProvider(),
      [CalendarProvider.OUTLOOK]: new OutlookCalendarProvider(),
      [CalendarProvider.CALENDLY]: new CalendlyProvider(),
    };
  }

  // ===========================================================================
  // GET PROVIDER FOR ORGANIZATION
  // ===========================================================================
  async getProvider(organizationId) {
    const settings = await this.prisma.calendarIntegration.findFirst({
      where: {
        organizationId,
        enabled: true,
      },
    });

    if (!settings) {
      return null;
    }

    const provider = this.providers[settings.provider];
    if (!provider) {
      throw new Error(`Unknown calendar provider: ${settings.provider}`);
    }

    // Initialize provider with credentials
    await provider.initialize({
      accessToken: settings.accessToken,
      refreshToken: settings.refreshToken,
      expiresAt: settings.tokenExpiresAt,
      calendarId: settings.calendarId,
      organizationId,
      prisma: this.prisma,
    });

    return provider;
  }

  // ===========================================================================
  // CHECK AVAILABILITY
  // ===========================================================================
  async checkAvailability(organizationId, date, duration = 30) {
    const provider = await this.getProvider(organizationId);
    if (!provider) {
      return {
        available: false,
        slots: [],
        error: "No calendar connected"
      };
    }

    try {
      return await provider.getAvailableSlots(date, duration);
    } catch (error) {
      console.error("❌ Calendar availability error:", error.message);
      return {
        available: false,
        slots: [],
        error: error.message
      };
    }
  }

  // ===========================================================================
  // BOOK APPOINTMENT
  // ===========================================================================
  async bookAppointment(organizationId, appointment) {
    const provider = await this.getProvider(organizationId);
    if (!provider) {
      return {
        success: false,
        error: "No calendar connected",
        needsManualBooking: true,
      };
    }

    try {
      const result = await provider.createEvent({
        title: appointment.title || `Call with ${appointment.callerName}`,
        description: this.formatDescription(appointment),
        startTime: appointment.startTime,
        endTime: appointment.endTime || this.addMinutes(appointment.startTime, appointment.duration || 30),
        attendees: appointment.attendees || [],
        location: appointment.location || "Phone Call",
        callerPhone: appointment.callerPhone,
        callerName: appointment.callerName,
        callerEmail: appointment.callerEmail,
        purpose: appointment.purpose,
      });

      // Log the booking
      await this.logBooking(organizationId, appointment, result);

      return {
        success: true,
        eventId: result.eventId,
        eventLink: result.eventLink,
        confirmedTime: result.confirmedTime,
      };
    } catch (error) {
      console.error("❌ Calendar booking error:", error.message);
      return {
        success: false,
        error: error.message,
        needsManualBooking: true,
      };
    }
  }

  // ===========================================================================
  // CANCEL APPOINTMENT
  // ===========================================================================
  async cancelAppointment(organizationId, eventId, reason) {
    const provider = await this.getProvider(organizationId);
    if (!provider) {
      return { success: false, error: "No calendar connected" };
    }

    try {
      await provider.deleteEvent(eventId, reason);
      return { success: true };
    } catch (error) {
      console.error("❌ Calendar cancel error:", error.message);
      return { success: false, error: error.message };
    }
  }

  // ===========================================================================
  // RESCHEDULE APPOINTMENT
  // ===========================================================================
  async rescheduleAppointment(organizationId, eventId, newTime) {
    const provider = await this.getProvider(organizationId);
    if (!provider) {
      return { success: false, error: "No calendar connected" };
    }

    try {
      const result = await provider.updateEvent(eventId, { startTime: newTime });
      return {
        success: true,
        newTime: result.confirmedTime,
        eventLink: result.eventLink,
      };
    } catch (error) {
      console.error("❌ Calendar reschedule error:", error.message);
      return { success: false, error: error.message };
    }
  }

  // ===========================================================================
  // GET UPCOMING APPOINTMENTS
  // ===========================================================================
  async getUpcomingAppointments(organizationId, days = 7) {
    const provider = await this.getProvider(organizationId);
    if (!provider) {
      return { appointments: [], error: "No calendar connected" };
    }

    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);

      const events = await provider.getEvents(startDate, endDate);
      return { appointments: events };
    } catch (error) {
      console.error("❌ Calendar fetch error:", error.message);
      return { appointments: [], error: error.message };
    }
  }

  // ===========================================================================
  // PARSE NATURAL LANGUAGE DATE/TIME
  // ===========================================================================
  parseDateTime(dateStr, timeStr) {
    const now = new Date();
    let targetDate = new Date();

    // Parse date
    const dateLower = (dateStr || "").toLowerCase().trim();

    if (dateLower === "today") {
      // Keep today
    } else if (dateLower === "tomorrow") {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (dateLower.startsWith("next ")) {
      const dayName = dateLower.replace("next ", "");
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const targetDay = days.indexOf(dayName);
      if (targetDay !== -1) {
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        targetDate.setDate(targetDate.getDate() + daysUntil);
      }
    } else if (dateLower.match(/^\d{4}-\d{2}-\d{2}$/)) {
      targetDate = new Date(dateLower);
    } else if (dateLower.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)) {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const targetDay = days.indexOf(dateLower);
      if (targetDay !== -1) {
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        targetDate.setDate(targetDate.getDate() + daysUntil);
      }
    }

    // Parse time
    const timeLower = (timeStr || "").toLowerCase().trim();
    let hours = 9; // Default to 9 AM
    let minutes = 0;

    if (timeLower === "morning") {
      hours = 9;
    } else if (timeLower === "afternoon") {
      hours = 14;
    } else if (timeLower === "evening") {
      hours = 17;
    } else if (timeLower.match(/^(\d{1,2})(:\d{2})?\s*(am|pm)?$/i)) {
      const match = timeLower.match(/^(\d{1,2})(:\d{2})?\s*(am|pm)?$/i);
      hours = parseInt(match[1]);
      minutes = match[2] ? parseInt(match[2].slice(1)) : 0;
      if (match[3]?.toLowerCase() === "pm" && hours < 12) hours += 12;
      if (match[3]?.toLowerCase() === "am" && hours === 12) hours = 0;
    } else if (timeLower.match(/^(\d{1,2}):(\d{2})$/)) {
      const match = timeLower.match(/^(\d{1,2}):(\d{2})$/);
      hours = parseInt(match[1]);
      minutes = parseInt(match[2]);
    }

    targetDate.setHours(hours, minutes, 0, 0);

    return targetDate;
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================
  formatDescription(appointment) {
    const lines = [
      `📞 Phone Appointment`,
      ``,
      `Caller: ${appointment.callerName || "Unknown"}`,
      `Phone: ${appointment.callerPhone || "Not provided"}`,
      `Email: ${appointment.callerEmail || "Not provided"}`,
      ``,
      `Purpose: ${appointment.purpose || "Not specified"}`,
      ``,
      `---`,
      `Booked via HEKAX Phone AI Receptionist`,
    ];
    return lines.join("\n");
  }

  addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
  }

  async logBooking(organizationId, appointment, result) {
    try {
      await this.prisma.calendarBooking.create({
        data: {
          organizationId,
          eventId: result.eventId,
          callerName: appointment.callerName,
          callerPhone: appointment.callerPhone,
          callerEmail: appointment.callerEmail,
          purpose: appointment.purpose,
          scheduledAt: appointment.startTime,
          duration: appointment.duration || 30,
          status: "CONFIRMED",
          callSid: appointment.callSid,
        },
      });
    } catch (error) {
      console.error("⚠️ Failed to log booking:", error.message);
    }
  }
}

module.exports = { CalendarService, CalendarProvider };
