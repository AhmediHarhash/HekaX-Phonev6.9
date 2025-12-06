// ============================================================================
// HEKAX Phone - Calendar Integration Routes
// OAuth flows and booking management for Google, Outlook, and Calendly
// ============================================================================

const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { CalendarService, CalendarProvider } = require("../services/calendar");
const GoogleCalendarProvider = require("../services/calendar/providers/google");
const OutlookCalendarProvider = require("../services/calendar/providers/outlook");
const CalendlyProvider = require("../services/calendar/providers/calendly");
const automationService = require("../services/automation.service");

const router = express.Router();
const calendarService = new CalendarService(prisma);

// State tokens for OAuth (in production, use Redis or database)
const oauthStates = new Map();

// ============================================================================
// GET /api/calendar/integrations
// List connected calendar integrations
// ============================================================================
router.get("/integrations", authMiddleware, async (req, res) => {
  try {
    const integrations = await prisma.calendarIntegration.findMany({
      where: { organizationId: req.organizationId },
      select: {
        id: true,
        provider: true,
        enabled: true,
        calendarName: true,
        defaultDuration: true,
        businessHours: true,
        createdAt: true,
        connectedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({ integrations });
  } catch (error) {
    console.error("❌ Get integrations error:", error);
    res.status(500).json({ error: "Failed to fetch integrations" });
  }
});

// ============================================================================
// GET /api/calendar/connect/:provider
// Start OAuth flow for a calendar provider
// ============================================================================
router.get("/connect/:provider", authMiddleware, requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  try {
    const { provider } = req.params;
    const validProviders = ["google", "outlook", "calendly"];

    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    // Check if OAuth credentials are configured
    const credentialCheck = {
      google: { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET },
      outlook: { id: process.env.MICROSOFT_CLIENT_ID, secret: process.env.MICROSOFT_CLIENT_SECRET },
      calendly: { id: process.env.CALENDLY_CLIENT_ID, secret: process.env.CALENDLY_CLIENT_SECRET },
    };

    const providerNames = { google: "Google Calendar", outlook: "Microsoft Outlook", calendly: "Calendly" };
    const creds = credentialCheck[provider];
    if (!creds.id || !creds.secret) {
      console.log(`⚠️ ${provider} OAuth credentials not configured`);
      return res.status(400).json({
        error: `${providerNames[provider]} integration is not configured. Please contact support to enable this integration.`,
        code: "OAUTH_NOT_CONFIGURED"
      });
    }

    // Generate state token
    const state = crypto.randomBytes(32).toString("hex");
    oauthStates.set(state, {
      organizationId: req.organizationId,
      userId: req.userId,
      provider,
      createdAt: Date.now(),
    });

    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of oauthStates) {
      if (value.createdAt < tenMinutesAgo) {
        oauthStates.delete(key);
      }
    }

    const redirectUri = `${process.env.PUBLIC_BASE_URL}/api/calendar/callback/${provider}`;

    let authUrl;
    switch (provider) {
      case "google":
        authUrl = GoogleCalendarProvider.getAuthUrl(redirectUri, state);
        break;
      case "outlook":
        authUrl = OutlookCalendarProvider.getAuthUrl(redirectUri, state);
        break;
      case "calendly":
        authUrl = CalendlyProvider.getAuthUrl(redirectUri, state);
        break;
    }

    res.json({ authUrl });
  } catch (error) {
    console.error("❌ Connect error:", error);
    res.status(500).json({ error: "Failed to generate auth URL" });
  }
});

// ============================================================================
// GET /api/calendar/callback/:provider
// OAuth callback handler
// ============================================================================
router.get("/callback/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=${oauthError}`);
    }

    if (!state || !oauthStates.has(state)) {
      return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=invalid_state`);
    }

    const stateData = oauthStates.get(state);
    oauthStates.delete(state);

    if (stateData.provider !== provider) {
      return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=provider_mismatch`);
    }

    const redirectUri = `${process.env.PUBLIC_BASE_URL}/api/calendar/callback/${provider}`;

    // Exchange code for tokens
    let tokens;
    switch (provider) {
      case "google":
        tokens = await GoogleCalendarProvider.exchangeCode(code, redirectUri);
        break;
      case "outlook":
        tokens = await OutlookCalendarProvider.exchangeCode(code, redirectUri);
        break;
      case "calendly":
        tokens = await CalendlyProvider.exchangeCode(code, redirectUri);
        break;
    }

    // Save or update integration
    await prisma.calendarIntegration.upsert({
      where: {
        organizationId_provider: {
          organizationId: stateData.organizationId,
          provider: provider.toUpperCase(),
        },
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        enabled: true,
      },
      create: {
        organizationId: stateData.organizationId,
        provider: provider.toUpperCase(),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        connectedById: stateData.userId,
      },
    });

    console.log(`✅ Calendar connected: ${provider} for org ${stateData.organizationId}`);

    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?success=${provider}`);
  } catch (error) {
    console.error("❌ Callback error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=connection_failed`);
  }
});

// ============================================================================
// DELETE /api/calendar/integrations/:id
// Disconnect a calendar integration
// ============================================================================
router.delete("/integrations/:id", authMiddleware, requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await prisma.calendarIntegration.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    await prisma.calendarIntegration.delete({ where: { id } });

    console.log(`✅ Calendar disconnected: ${integration.provider} for org ${req.organizationId}`);

    res.json({ message: "Integration disconnected" });
  } catch (error) {
    console.error("❌ Disconnect error:", error);
    res.status(500).json({ error: "Failed to disconnect integration" });
  }
});

// ============================================================================
// PATCH /api/calendar/integrations/:id
// Update integration settings
// ============================================================================
router.patch("/integrations/:id", authMiddleware, requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, defaultDuration, businessHours, calendarId } = req.body;

    const integration = await prisma.calendarIntegration.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const updated = await prisma.calendarIntegration.update({
      where: { id },
      data: {
        enabled: enabled !== undefined ? enabled : undefined,
        defaultDuration: defaultDuration !== undefined ? defaultDuration : undefined,
        businessHours: businessHours !== undefined ? businessHours : undefined,
        calendarId: calendarId !== undefined ? calendarId : undefined,
      },
    });

    res.json({ integration: updated });
  } catch (error) {
    console.error("❌ Update integration error:", error);
    res.status(500).json({ error: "Failed to update integration" });
  }
});

// ============================================================================
// GET /api/calendar/availability
// Check availability for a date
// ============================================================================
router.get("/availability", authMiddleware, async (req, res) => {
  try {
    const { date, duration } = req.query;

    if (!date) {
      return res.status(400).json({ error: "Date is required" });
    }

    const targetDate = new Date(date);
    const durationMinutes = parseInt(duration) || 30;

    const availability = await calendarService.checkAvailability(
      req.organizationId,
      targetDate,
      durationMinutes
    );

    res.json(availability);
  } catch (error) {
    console.error("❌ Availability error:", error);
    res.status(500).json({ error: "Failed to check availability" });
  }
});

// ============================================================================
// POST /api/calendar/book
// Book an appointment
// ============================================================================
router.post("/book", authMiddleware, async (req, res) => {
  try {
    const {
      date,
      time,
      duration,
      callerName,
      callerPhone,
      callerEmail,
      purpose,
      addVideoConference,
    } = req.body;

    if (!callerName || !purpose) {
      return res.status(400).json({ error: "Caller name and purpose are required" });
    }

    // Parse date and time
    const startTime = calendarService.parseDateTime(date, time);
    const endTime = new Date(startTime.getTime() + (duration || 30) * 60000);

    const result = await calendarService.bookAppointment(req.organizationId, {
      title: `Call with ${callerName}`,
      startTime,
      endTime,
      duration: duration || 30,
      callerName,
      callerPhone,
      callerEmail,
      purpose,
      addVideoConference,
    });

    // Emit automation event for appointment booked
    automationService.emit(
      automationService.EVENTS.APPOINTMENT_BOOKED,
      req.organizationId,
      {
        ...result,
        callerName,
        callerPhone,
        callerEmail,
        purpose,
        scheduledAt: startTime,
      }
    );

    res.json(result);
  } catch (error) {
    console.error("❌ Book appointment error:", error);
    res.status(500).json({ error: "Failed to book appointment" });
  }
});

// ============================================================================
// GET /api/calendar/bookings
// List bookings
// ============================================================================
router.get("/bookings", authMiddleware, async (req, res) => {
  try {
    const { status, startDate, endDate, limit = 50 } = req.query;

    const where = {
      organizationId: req.organizationId,
    };

    if (status) {
      where.status = status.toUpperCase();
    }

    if (startDate) {
      where.scheduledAt = { gte: new Date(startDate) };
    }

    if (endDate) {
      where.scheduledAt = { ...where.scheduledAt, lte: new Date(endDate) };
    }

    const bookings = await prisma.calendarBooking.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      take: parseInt(limit),
    });

    res.json({ bookings });
  } catch (error) {
    console.error("❌ Get bookings error:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// ============================================================================
// PATCH /api/calendar/bookings/:id
// Update booking status
// ============================================================================
router.patch("/bookings/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, cancelReason } = req.body;

    const booking = await prisma.calendarBooking.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const updateData = {};

    if (status) {
      updateData.status = status.toUpperCase();

      if (status.toUpperCase() === "CANCELLED") {
        updateData.cancelledAt = new Date();
        updateData.cancelReason = cancelReason;

        // Cancel in external calendar if eventId exists
        if (booking.eventId) {
          try {
            await calendarService.cancelAppointment(req.organizationId, booking.eventId, cancelReason);
          } catch (calError) {
            console.error("⚠️ Failed to cancel in calendar:", calError.message);
          }
        }
      }

      if (status.toUpperCase() === "COMPLETED") {
        updateData.completedAt = new Date();
      }

      if (status.toUpperCase() === "NO_SHOW") {
        updateData.noShowMarkedAt = new Date();
      }
    }

    const updated = await prisma.calendarBooking.update({
      where: { id },
      data: updateData,
    });

    // Emit automation events based on status
    if (status) {
      const upperStatus = status.toUpperCase();
      if (upperStatus === "CANCELLED") {
        automationService.emit(
          automationService.EVENTS.APPOINTMENT_CANCELLED,
          req.organizationId,
          { ...updated, cancelReason }
        );
      } else if (upperStatus === "NO_SHOW") {
        automationService.emit(
          automationService.EVENTS.APPOINTMENT_NO_SHOW,
          req.organizationId,
          updated
        );
      }
    }

    res.json({ booking: updated });
  } catch (error) {
    console.error("❌ Update booking error:", error);
    res.status(500).json({ error: "Failed to update booking" });
  }
});

// ============================================================================
// GET /api/calendar/upcoming
// Get upcoming appointments from external calendar
// ============================================================================
router.get("/upcoming", authMiddleware, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const result = await calendarService.getUpcomingAppointments(req.organizationId, parseInt(days));

    res.json(result);
  } catch (error) {
    console.error("❌ Get upcoming error:", error);
    res.status(500).json({ error: "Failed to fetch upcoming appointments" });
  }
});

// ============================================================================
// GET /api/calendar/calendars
// List available calendars from connected provider
// ============================================================================
router.get("/calendars", authMiddleware, async (req, res) => {
  try {
    const provider = await calendarService.getProvider(req.organizationId);

    if (!provider) {
      return res.status(400).json({ error: "No calendar connected" });
    }

    const calendars = await provider.getCalendarsList();

    res.json({ calendars });
  } catch (error) {
    console.error("❌ Get calendars error:", error);
    res.status(500).json({ error: "Failed to fetch calendars" });
  }
});

// ============================================================================
// GET /api/calendar/providers
// List available calendar providers with their status
// ============================================================================
router.get("/providers", authMiddleware, async (req, res) => {
  try {
    const integrations = await prisma.calendarIntegration.findMany({
      where: { organizationId: req.organizationId },
      select: { provider: true, enabled: true },
    });

    const connectedProviders = new Map(integrations.map((i) => [i.provider, i.enabled]));

    const providers = [
      {
        id: "google",
        name: "Google Calendar",
        description: "Sync with your Google Calendar",
        icon: "google",
        connected: connectedProviders.has("GOOGLE"),
        enabled: connectedProviders.get("GOOGLE") || false,
        configured: !!process.env.GOOGLE_CLIENT_ID,
      },
      {
        id: "outlook",
        name: "Microsoft Outlook",
        description: "Sync with Outlook/Office 365",
        icon: "outlook",
        connected: connectedProviders.has("OUTLOOK"),
        enabled: connectedProviders.get("OUTLOOK") || false,
        configured: !!process.env.MICROSOFT_CLIENT_ID,
      },
      {
        id: "calendly",
        name: "Calendly",
        description: "Connect your Calendly account",
        icon: "calendly",
        connected: connectedProviders.has("CALENDLY"),
        enabled: connectedProviders.get("CALENDLY") || false,
        configured: !!process.env.CALENDLY_CLIENT_ID,
      },
    ];

    res.json({ providers });
  } catch (error) {
    console.error("❌ Get providers error:", error);
    res.status(500).json({ error: "Failed to fetch providers" });
  }
});

module.exports = router;
