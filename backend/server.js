// ============================================================================
// HEKAX Phone - Main Server
// Version: 2.0.0 (Refactored)
// ============================================================================

require("dotenv").config();

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION:', err);
  process.exit(1);
});

const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize WebSocket for media streams
const wss = new WebSocket.Server({ server, path: "/media-stream" });

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors({
  origin: [
    'https://phone.hekax.com',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  credentials: true,
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

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

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "running", 
    service: "HEKAX Phone", 
    version: "2.0.0",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/health", async (req, res) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    checks: {},
  };

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = { status: "ok" };
  } catch (err) {
    health.checks.database = { status: "error", message: err.message };
    health.status = "degraded";
  }

  // Check environment variables
  const requiredEnvVars = [
    "DATABASE_URL",
    "JWT_SECRET",
    "TWILIO_ACCOUNT_SID",
    "OPENAI_API_KEY",
  ];
  
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    health.checks.environment = { 
      status: "warning", 
      missing: missingVars.length,
    };
  } else {
    health.checks.environment = { status: "ok" };
  }

  res.status(health.status === "healthy" ? 200 : 503).json(health);
});

// Readiness check (for k8s/docker)
app.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: err.message });
  }
});

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
  
  // Phase 6.3: Multi-org routes
  const userOrganizationsRoutes = require("./routes/user-organizations.routes");
  app.use("/api/user/organizations", userOrganizationsRoutes);
  
  // Phase 6.4: BYO Keys & API Keys (Enterprise)
  const byoKeysRoutes = require("./routes/byo-keys.routes");
  const { router: apiKeysRoutes } = require("./routes/api-keys.routes");
  app.use("/api/byo-keys", byoKeysRoutes);
  app.use("/api/api-keys", apiKeysRoutes);
  
  // Phase 6.5: Data Management (Retention, Cleanup, Export)
  const dataRoutes = require("./routes/data.routes");
  app.use("/api/data", dataRoutes);
  
  // Voice preview routes
  const voiceRoutes = require("./routes/voice.routes");
  app.use("/api/voice", voiceRoutes);
  
  console.log("✅ API routes loaded (including Phase 6.5 Data Management)");
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

// Stripe webhook route (must use raw body)
try {
  const webhookRoutes = require("./routes/webhook.routes");
  app.use("/webhooks/stripe", webhookRoutes);
  console.log("✅ Stripe webhook routes loaded");
} catch (err) {
  console.error("❌ Webhook routes error:", err);
}

// ============================================================================
// TWILIO TOKEN ENDPOINT
// ============================================================================

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

app.get("/token", (req, res) => {
  const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWIML_APP_SID } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY || !TWILIO_API_SECRET || !TWIML_APP_SID) {
    return res.status(500).json({ error: "Missing Twilio config" });
  }

  const identity = req.query.identity || "web-user";
  
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity,
    ttl: 3600,
  });

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: TWIML_APP_SID,
      incomingAllow: true,
    })
  );

  res.json({ token: token.toJwt(), identity });
});

// ============================================================================
// WEBSOCKET FOR AI MEDIA STREAMS
// ============================================================================

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
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("✅ Database connected");
    
    server.listen(PORT, HOST, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║           HEKAX Phone Backend v2.0.0                      ║
║           Refactored & Production Ready                   ║
╠═══════════════════════════════════════════════════════════╣
║  Server:     http://${HOST}:${PORT}                             ║
║  AI:         ${AIReceptionist ? "✅ ENABLED" : "❌ DISABLED"}                               ║
║  Database:   ✅ CONNECTED                                 ║
║  WebSocket:  ✅ READY                                     ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error("❌ STARTUP ERROR:", err);
    process.exit(1);
  }
}

startServer();
