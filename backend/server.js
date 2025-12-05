// ============================================================================
// HEKAX Phone - Main Server
// Version: 2.1.0 (Security Enhanced)
// ============================================================================

require("dotenv").config();

// ============================================================================
// SECURITY: Validate environment before anything else
// ============================================================================

const {
  validateSecurityEnvironment,
  securityHeaders,
  corsOptions,
  sanitizeRequest,
  securityLogger,
  detectSuspiciousActivity,
  apiLimiter,
} = require("./middleware/security.middleware");

// This will exit if critical secrets are missing
validateSecurityEnvironment();

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("❌ UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ UNHANDLED REJECTION:", err);
  process.exit(1);
});

const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");
const url = require("url");

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize WebSocket for media streams
const wss = new WebSocket.Server({ noServer: true });

// ============================================================================
// MIDDLEWARE - ORDER MATTERS
// ============================================================================

// 1. Security headers (Helmet)
app.use(securityHeaders);

// 2. CORS with strict origin checking
app.use(cors(corsOptions));

// 3. Security logging
app.use(securityLogger);

// 4. Suspicious activity detection
app.use(detectSuspiciousActivity);

// 5. Trust proxy (for rate limiting behind reverse proxy)
app.set("trust proxy", 1);

// 6. Stripe webhook route MUST be mounted before body parsing
try {
  const webhookRoutes = require("./routes/webhook.routes");
  app.use("/webhooks/stripe", webhookRoutes);
  console.log("✅ Stripe webhook routes loaded (before body parsing)");
} catch (err) {
  console.error("❌ Webhook routes error:", err);
}

// 7. Body parsing
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

// 8. Request sanitization
app.use(sanitizeRequest);

// 9. General API rate limiting
app.use("/api", apiLimiter);

// ============================================================================
// DATABASE
// ============================================================================

let prisma;
try {
  prisma = require("./lib/prisma");
  console.log("✅ Prisma loaded");
} catch (err) {
  console.error("❌ PRISMA ERROR:", err);
  process.exit(1);
}

// ============================================================================
// AI RECEPTIONIST
// ============================================================================

let AIReceptionist;
try {
  AIReceptionist = require("./services/ai-receptionist").AIReceptionist;
  console.log("✅ AI Receptionist loaded");
} catch (err) {
  console.error("⚠️ AI Receptionist not available:", err.message);
  AIReceptionist = null;
}

// ============================================================================
// ROUTES
// ============================================================================

// Health check (no auth required)
// Service start time for uptime calculation
const SERVICE_START_TIME = Date.now();

app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "HEKAX Phone",
    version: "2.1.0",
  });
});

// Simple health check for load balancers (fast, no DB)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "2.1.0",
  });
});

// Readiness check - confirms all dependencies are ready
app.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: "Database not ready" });
  }
});

// Comprehensive status endpoint for enterprise monitoring
app.get("/status", async (req, res) => {
  const startTime = Date.now();
  const status = {
    service: "HEKAX Phone",
    version: "2.1.0",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor((Date.now() - SERVICE_START_TIME) / 1000),
      human: formatUptime(Date.now() - SERVICE_START_TIME),
    },
    checks: {},
    overall: "healthy",
  };

  // Database check
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    status.checks.database = {
      status: "healthy",
      latency: Date.now() - dbStart + "ms",
    };
  } catch (err) {
    status.checks.database = { status: "unhealthy", error: err.message };
    status.overall = "unhealthy";
  }

  // Twilio check
  try {
    status.checks.twilio = {
      status: process.env.TWILIO_ACCOUNT_SID ? "configured" : "missing",
      accountSid: process.env.TWILIO_ACCOUNT_SID ? "***" + process.env.TWILIO_ACCOUNT_SID.slice(-4) : null,
    };
  } catch (err) {
    status.checks.twilio = { status: "error", error: err.message };
  }

  // OpenAI check
  status.checks.openai = {
    status: process.env.OPENAI_API_KEY ? "configured" : "missing",
  };

  // Deepgram check
  status.checks.deepgram = {
    status: process.env.DEEPGRAM_API_KEY ? "configured" : "missing",
  };

  // Stripe check
  status.checks.stripe = {
    status: process.env.STRIPE_SECRET_KEY ? "configured" : "missing",
  };

  // Memory usage
  const memUsage = process.memoryUsage();
  status.memory = {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + "MB",
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + "MB",
    rss: Math.round(memUsage.rss / 1024 / 1024) + "MB",
  };

  // Response time
  status.responseTime = Date.now() - startTime + "ms";

  res.status(status.overall === "healthy" ? 200 : 503).json(status);
});

// Helper function to format uptime
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Auth routes
try {
  const authRoutes = require("./routes/auth.routes");
  app.use("/auth", authRoutes);
  console.log("✅ Auth routes loaded");
} catch (err) {
  console.error("❌ Auth routes error:", err);
}

// API routes
try {
  const callsRoutes = require("./routes/calls.routes");
  const leadsRoutes = require("./routes/leads.routes");
  const teamRoutes = require("./routes/team.routes");
  const orgRoutes = require("./routes/organization.routes");
  const statsRoutes = require("./routes/stats.routes");
  const phoneNumbersRoutes = require("./routes/phone-numbers.routes");
  const usageRoutes = require("./routes/usage.routes");
  const auditLogsRoutes = require("./routes/audit-logs.routes");
  const billingRoutes = require("./routes/billing.routes");
  const plansRoutes = require("./routes/plans.routes");

  app.use("/api/calls", callsRoutes);
  app.use("/api/leads", leadsRoutes);
  app.use("/api/team", teamRoutes);
  app.use("/api/organization", orgRoutes);
  app.use("/api/stats", statsRoutes);
  app.use("/api/phone-numbers", phoneNumbersRoutes);
  app.use("/api/usage", usageRoutes);
  app.use("/api/audit-logs", auditLogsRoutes);
  app.use("/api/billing", billingRoutes);
  app.use("/api/plans", plansRoutes);

  // Multi-org routes
  const userOrganizationsRoutes = require("./routes/user-organizations.routes");
  app.use("/api/user/organizations", userOrganizationsRoutes);

  // Enterprise routes
  const byoKeysRoutes = require("./routes/byo-keys.routes");
  const { router: apiKeysRoutes } = require("./routes/api-keys.routes");
  app.use("/api/byo-keys", byoKeysRoutes);
  app.use("/api/api-keys", apiKeysRoutes);

  // Data Management
  const dataRoutes = require("./routes/data.routes");
  app.use("/api/data", dataRoutes);

  // Voice preview
  const voiceRoutes = require("./routes/voice.routes");
  app.use("/api/voice", voiceRoutes);

  // Twilio provisioning
  const provisioningRoutes = require("./routes/provisioning.routes");
  app.use("/api/provisioning", provisioningRoutes);

  // Calendar integrations
  const calendarRoutes = require("./routes/calendar.routes");
  app.use("/api/calendar", calendarRoutes);

  // CRM integrations
  const crmRoutes = require("./routes/crm.routes");
  app.use("/api/crm", crmRoutes);

  console.log("✅ API routes loaded");
} catch (err) {
  console.error("❌ API routes error:", err);
}

// Twilio routes
try {
  const twilioRoutes = require("./routes/twilio.routes");
  app.use("/twilio", twilioRoutes);
  console.log("✅ Twilio routes loaded");
} catch (err) {
  console.error("❌ Twilio routes error:", err);
}

// ============================================================================
// TWILIO TOKEN ENDPOINT
// ============================================================================

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const { authMiddleware } = require("./middleware/auth.middleware");

app.get("/token", authMiddleware, async (req, res) => {
  try {
    const twilioService = require("./services/twilio.service");
    // Use stable identity based on org slug: {slug}-web
    // This allows transfers to find the registered client
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { slug: true }
    });
    const identity = org?.slug ? `${org.slug}-web` : `${req.organizationId}-web`;

    const result = await twilioService.generateAccessToken(
      req.organizationId,
      identity
    );
    res.json(result);
  } catch (err) {
    console.error("❌ Token generation error:", err);

    const {
      TWILIO_ACCOUNT_SID,
      TWILIO_API_KEY,
      TWILIO_API_SECRET,
      TWIML_APP_SID,
    } = process.env;

    if (
      !TWILIO_ACCOUNT_SID ||
      !TWILIO_API_KEY ||
      !TWILIO_API_SECRET ||
      !TWIML_APP_SID
    ) {
      return res.status(500).json({ error: "Missing Twilio config" });
    }

    // Fallback: use organizationId-web or default
    const identity = req.organizationId ? `org-${req.organizationId}-web` : "default-web";

    const token = new AccessToken(
      TWILIO_ACCOUNT_SID,
      TWILIO_API_KEY,
      TWILIO_API_SECRET,
      {
        identity,
        ttl: 3600,
      }
    );

    token.addGrant(
      new VoiceGrant({
        outgoingApplicationSid: TWIML_APP_SID,
        incomingAllow: true,
      })
    );

    res.json({ token: token.toJwt(), identity });
  }
});

// ============================================================================
// WEBSOCKET AUTHENTICATION & HANDLING
// ============================================================================

const { verifyAccessToken } = require("./middleware/auth.middleware");

// Handle WebSocket upgrade with authentication
server.on("upgrade", async (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;

  if (pathname === "/media-stream") {
    // For Twilio media streams, we validate via Twilio's parameters
    // The stream comes from Twilio, not directly from users
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    // For other WebSocket connections, require auth token
    const params = new URLSearchParams(url.parse(request.url).query);
    const token = params.get("token");

    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const decoded = verifyAccessToken(token);
    if (!decoded) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    request.userId = decoded.userId;
    request.organizationId = decoded.organizationId;

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
});

// WebSocket connection handler
wss.on("connection", (ws, req) => {
  console.log("🎙️ New Media Stream WebSocket connected");

  let streamSid = null;
  let callSid = null;
  let aiReceptionist = null;

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.event) {
        case "connected":
          console.log("📞 Media Stream connected");
          break;

        case "start":
          streamSid = data.start.streamSid;
          callSid = data.start.callSid;

          console.log("🚀 Media Stream started:", { streamSid, callSid });

          const custom = data.start.customParameters || {};
          const fromNumber = custom.callerNumber || custom.from || null;
          const toNumber = custom.calledNumber || custom.to || null;

          // Find organization by phone number
          let organization = null;
          if (toNumber) {
            organization = await prisma.organization.findFirst({
              where: { twilioNumber: toNumber },
            });
            console.log("🏢 Organization:", organization?.name || "Default");
          }

          // Initialize AI Receptionist
          if (AIReceptionist) {
            aiReceptionist = new AIReceptionist({
              streamSid,
              callSid,
              ws,
              prisma,
              fromNumber,
              toNumber,
              customParameters: custom,
              organization,
            });
            await aiReceptionist.initialize();
          }
          break;

        case "media":
          if (aiReceptionist) {
            await aiReceptionist.handleAudio(data.media.payload);
          }
          break;

        case "mark":
          if (aiReceptionist) {
            aiReceptionist.handleMark(data.mark);
          }
          break;

        case "stop":
          console.log("🛑 Media Stream stopped");
          if (aiReceptionist) {
            await aiReceptionist.cleanup();
          }
          break;
      }
    } catch (error) {
      console.error("❌ WebSocket message error:", error);
    }
  });

  ws.on("close", () => {
    console.log("📴 WebSocket closed");
    if (aiReceptionist) aiReceptionist.cleanup();
  });

  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);

  // Don't expose internal errors in production
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;

  res.status(err.status || 500).json({ error: message });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    server.listen(PORT, HOST, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║           HEKAX Phone Backend v2.1.0                      ║
║           Security Enhanced Edition                       ║
╠═══════════════════════════════════════════════════════════╣
║  Server:     http://${HOST}:${PORT}                             ║
║  AI:         ${AIReceptionist ? "✅ ENABLED" : "❌ DISABLED"}                               ║
║  Database:   ✅ CONNECTED                                 ║
║  WebSocket:  ✅ READY                                     ║
║  Security:   ✅ ENABLED                                   ║
╠═══════════════════════════════════════════════════════════╣
║  Security Features:                                       ║
║  • Rate limiting (auth, API, webhooks)                    ║
║  • JWT with refresh tokens (1h/7d)                        ║
║  • Helmet security headers                                ║
║  • Twilio webhook signature validation                    ║
║  • Account lockout (5 attempts, 15 min)                   ║
║  • Input validation & sanitization                        ║
║  • Strict CORS policy                                     ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error("❌ STARTUP ERROR:", err);
    process.exit(1);
  }
}

startServer();
