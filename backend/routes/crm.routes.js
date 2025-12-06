// ============================================================================
// HEKAX Phone - CRM Integration Routes
// OAuth flows and sync management for HubSpot, Salesforce, Zoho, Pipedrive
// ============================================================================

const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { CRMService, CRMProvider } = require("../services/crm");
const HubSpotProvider = require("../services/crm/providers/hubspot");
const SalesforceProvider = require("../services/crm/providers/salesforce");
const ZohoProvider = require("../services/crm/providers/zoho");
const PipedriveProvider = require("../services/crm/providers/pipedrive");

const router = express.Router();
const crmService = new CRMService(prisma);

// State tokens for OAuth
const oauthStates = new Map();

// ============================================================================
// GET /api/crm/integrations
// List connected CRM integrations
// ============================================================================
router.get("/integrations", authMiddleware, async (req, res) => {
  try {
    const integrations = await prisma.crmIntegration.findMany({
      where: { organizationId: req.organizationId },
      select: {
        id: true,
        provider: true,
        enabled: true,
        syncLeads: true,
        syncCalls: true,
        syncTranscripts: true,
        syncAppointments: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastError: true,
        createdAt: true,
        connectedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({ integrations });
  } catch (error) {
    console.error("❌ Get CRM integrations error:", error);
    res.status(500).json({ error: "Failed to fetch integrations" });
  }
});

// ============================================================================
// GET /api/crm/connect/:provider
// Start OAuth flow for a CRM provider
// ============================================================================
router.get("/connect/:provider", authMiddleware, requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  try {
    const { provider } = req.params;
    const validProviders = ["hubspot", "salesforce", "zoho", "pipedrive"];

    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    // Check if OAuth credentials are configured
    const credentialCheck = {
      hubspot: { id: process.env.HUBSPOT_CLIENT_ID, secret: process.env.HUBSPOT_CLIENT_SECRET },
      salesforce: { id: process.env.SALESFORCE_CLIENT_ID, secret: process.env.SALESFORCE_CLIENT_SECRET },
      zoho: { id: process.env.ZOHO_CLIENT_ID, secret: process.env.ZOHO_CLIENT_SECRET },
      pipedrive: { id: process.env.PIPEDRIVE_CLIENT_ID, secret: process.env.PIPEDRIVE_CLIENT_SECRET },
    };

    const creds = credentialCheck[provider];
    if (!creds.id || !creds.secret) {
      console.log(`⚠️ ${provider} OAuth credentials not configured`);
      return res.status(400).json({
        error: `${provider.charAt(0).toUpperCase() + provider.slice(1)} integration is not configured. Please contact support to enable this integration.`,
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

    // Clean up old states
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of oauthStates) {
      if (value.createdAt < tenMinutesAgo) {
        oauthStates.delete(key);
      }
    }

    const redirectUri = `${process.env.PUBLIC_BASE_URL}/api/crm/callback/${provider}`;

    let authUrl;
    switch (provider) {
      case "hubspot":
        authUrl = HubSpotProvider.getAuthUrl(redirectUri, state);
        break;
      case "salesforce":
        authUrl = SalesforceProvider.getAuthUrl(redirectUri, state);
        break;
      case "zoho":
        authUrl = ZohoProvider.getAuthUrl(redirectUri, state);
        break;
      case "pipedrive":
        authUrl = PipedriveProvider.getAuthUrl(redirectUri, state);
        break;
    }

    res.json({ authUrl });
  } catch (error) {
    console.error("❌ CRM connect error:", error);
    res.status(500).json({ error: "Failed to generate auth URL" });
  }
});

// ============================================================================
// GET /api/crm/callback/:provider
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

    const redirectUri = `${process.env.PUBLIC_BASE_URL}/api/crm/callback/${provider}`;

    // Exchange code for tokens
    let tokens;
    switch (provider) {
      case "hubspot":
        tokens = await HubSpotProvider.exchangeCode(code, redirectUri);
        break;
      case "salesforce":
        tokens = await SalesforceProvider.exchangeCode(code, redirectUri);
        break;
      case "zoho":
        tokens = await ZohoProvider.exchangeCode(code, redirectUri);
        break;
      case "pipedrive":
        tokens = await PipedriveProvider.exchangeCode(code, redirectUri);
        break;
    }

    // Save or update integration
    await prisma.crmIntegration.upsert({
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
        instanceUrl: tokens.instanceUrl || tokens.apiDomain,
        enabled: true,
      },
      create: {
        organizationId: stateData.organizationId,
        provider: provider.toUpperCase(),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        instanceUrl: tokens.instanceUrl || tokens.apiDomain,
        connectedById: stateData.userId,
      },
    });

    console.log(`✅ CRM connected: ${provider} for org ${stateData.organizationId}`);

    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?success=crm_${provider}`);
  } catch (error) {
    console.error("❌ CRM callback error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=connection_failed`);
  }
});

// ============================================================================
// POST /api/crm/webhook
// Add a generic webhook integration
// ============================================================================
router.post("/webhook", authMiddleware, requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  try {
    const { webhookUrl, secret, syncLeads, syncCalls, syncTranscripts, syncAppointments } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: "Webhook URL is required" });
    }

    // Validate URL
    try {
      new URL(webhookUrl);
    } catch {
      return res.status(400).json({ error: "Invalid webhook URL" });
    }

    const integration = await prisma.crmIntegration.upsert({
      where: {
        organizationId_provider: {
          organizationId: req.organizationId,
          provider: "WEBHOOK",
        },
      },
      update: {
        webhookUrl,
        apiKey: secret || null,
        syncLeads: syncLeads !== false,
        syncCalls: syncCalls !== false,
        syncTranscripts: syncTranscripts === true,
        syncAppointments: syncAppointments !== false,
        enabled: true,
      },
      create: {
        organizationId: req.organizationId,
        provider: "WEBHOOK",
        webhookUrl,
        apiKey: secret || null,
        syncLeads: syncLeads !== false,
        syncCalls: syncCalls !== false,
        syncTranscripts: syncTranscripts === true,
        syncAppointments: syncAppointments !== false,
        connectedById: req.userId,
      },
    });

    console.log(`✅ Webhook integration saved for org ${req.organizationId}`);

    res.json({ integration: { id: integration.id, provider: "WEBHOOK", webhookUrl } });
  } catch (error) {
    console.error("❌ Webhook save error:", error);
    res.status(500).json({ error: "Failed to save webhook" });
  }
});

// ============================================================================
// POST /api/crm/webhook/test
// Test webhook endpoint
// ============================================================================
router.post("/webhook/test", authMiddleware, async (req, res) => {
  try {
    const integration = await prisma.crmIntegration.findFirst({
      where: {
        organizationId: req.organizationId,
        provider: "WEBHOOK",
        enabled: true,
      },
    });

    if (!integration) {
      return res.status(404).json({ error: "No webhook configured" });
    }

    const WebhookProvider = require("../services/crm/providers/webhook");
    const provider = new WebhookProvider();
    await provider.initialize({
      webhookUrl: integration.webhookUrl,
      apiKey: integration.apiKey,
    });

    const result = await provider.testConnection();

    res.json(result);
  } catch (error) {
    console.error("❌ Webhook test error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DELETE /api/crm/integrations/:id
// Disconnect a CRM integration
// ============================================================================
router.delete("/integrations/:id", authMiddleware, requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await prisma.crmIntegration.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    await prisma.crmIntegration.delete({ where: { id } });

    console.log(`✅ CRM disconnected: ${integration.provider} for org ${req.organizationId}`);

    res.json({ message: "Integration disconnected" });
  } catch (error) {
    console.error("❌ CRM disconnect error:", error);
    res.status(500).json({ error: "Failed to disconnect integration" });
  }
});

// ============================================================================
// PATCH /api/crm/integrations/:id
// Update integration settings
// ============================================================================
router.patch("/integrations/:id", authMiddleware, requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, syncLeads, syncCalls, syncTranscripts, syncAppointments, fieldMappings } = req.body;

    const integration = await prisma.crmIntegration.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const updated = await prisma.crmIntegration.update({
      where: { id },
      data: {
        enabled: enabled !== undefined ? enabled : undefined,
        syncLeads: syncLeads !== undefined ? syncLeads : undefined,
        syncCalls: syncCalls !== undefined ? syncCalls : undefined,
        syncTranscripts: syncTranscripts !== undefined ? syncTranscripts : undefined,
        syncAppointments: syncAppointments !== undefined ? syncAppointments : undefined,
        fieldMappings: fieldMappings !== undefined ? fieldMappings : undefined,
      },
    });

    res.json({ integration: updated });
  } catch (error) {
    console.error("❌ CRM update error:", error);
    res.status(500).json({ error: "Failed to update integration" });
  }
});

// ============================================================================
// POST /api/crm/sync/lead/:leadId
// Manually sync a lead to CRM
// ============================================================================
router.post("/sync/lead/:leadId", authMiddleware, async (req, res) => {
  try {
    const { leadId } = req.params;

    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        organizationId: req.organizationId,
      },
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const results = await crmService.syncLead(req.organizationId, lead);

    res.json({ results });
  } catch (error) {
    console.error("❌ Lead sync error:", error);
    res.status(500).json({ error: "Failed to sync lead" });
  }
});

// ============================================================================
// POST /api/crm/sync/call/:callId
// Manually sync a call to CRM
// ============================================================================
router.post("/sync/call/:callId", authMiddleware, async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await prisma.callLog.findFirst({
      where: {
        id: callId,
        organizationId: req.organizationId,
      },
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    // Get transcript if exists
    const transcript = await prisma.transcript.findFirst({
      where: { callSid: call.callSid },
    });

    const results = await crmService.syncCall(req.organizationId, call, transcript);

    res.json({ results });
  } catch (error) {
    console.error("❌ Call sync error:", error);
    res.status(500).json({ error: "Failed to sync call" });
  }
});

// ============================================================================
// GET /api/crm/lookup
// Lookup a contact in CRM by phone or email
// ============================================================================
router.get("/lookup", authMiddleware, async (req, res) => {
  try {
    const { phone, email } = req.query;

    if (!phone && !email) {
      return res.status(400).json({ error: "Phone or email is required" });
    }

    const result = await crmService.lookupContact(req.organizationId, phone, email);

    res.json(result);
  } catch (error) {
    console.error("❌ CRM lookup error:", error);
    res.status(500).json({ error: "Failed to lookup contact" });
  }
});

// ============================================================================
// GET /api/crm/sync-logs
// Get sync history
// ============================================================================
router.get("/sync-logs", authMiddleware, async (req, res) => {
  try {
    const { integrationId, status, limit = 50 } = req.query;

    const where = {};

    if (integrationId) {
      where.crmIntegrationId = integrationId;
    } else {
      // Get all integrations for this org
      const integrations = await prisma.crmIntegration.findMany({
        where: { organizationId: req.organizationId },
        select: { id: true },
      });
      where.crmIntegrationId = { in: integrations.map((i) => i.id) };
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    const logs = await prisma.crmSyncLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
      include: {
        crmIntegration: {
          select: { provider: true },
        },
      },
    });

    res.json({ logs });
  } catch (error) {
    console.error("❌ Get sync logs error:", error);
    res.status(500).json({ error: "Failed to fetch sync logs" });
  }
});

// ============================================================================
// GET /api/crm/providers
// List available CRM providers with their status
// ============================================================================
router.get("/providers", authMiddleware, async (req, res) => {
  try {
    const integrations = await prisma.crmIntegration.findMany({
      where: { organizationId: req.organizationId },
      select: { provider: true, enabled: true },
    });

    const connectedProviders = new Map(integrations.map((i) => [i.provider, i.enabled]));

    const providers = [
      {
        id: "hubspot",
        name: "HubSpot",
        description: "Popular CRM for SMBs with free tier",
        icon: "hubspot",
        connected: connectedProviders.has("HUBSPOT"),
        enabled: connectedProviders.get("HUBSPOT") || false,
        configured: !!process.env.HUBSPOT_CLIENT_ID,
      },
      {
        id: "salesforce",
        name: "Salesforce",
        description: "Enterprise CRM standard",
        icon: "salesforce",
        connected: connectedProviders.has("SALESFORCE"),
        enabled: connectedProviders.get("SALESFORCE") || false,
        configured: !!process.env.SALESFORCE_CLIENT_ID,
      },
      {
        id: "zoho",
        name: "Zoho CRM",
        description: "Affordable CRM for SMBs",
        icon: "zoho",
        connected: connectedProviders.has("ZOHO"),
        enabled: connectedProviders.get("ZOHO") || false,
        configured: !!process.env.ZOHO_CLIENT_ID,
      },
      {
        id: "pipedrive",
        name: "Pipedrive",
        description: "Sales-focused CRM",
        icon: "pipedrive",
        connected: connectedProviders.has("PIPEDRIVE"),
        enabled: connectedProviders.get("PIPEDRIVE") || false,
        configured: !!process.env.PIPEDRIVE_CLIENT_ID,
      },
      {
        id: "webhook",
        name: "Custom Webhook",
        description: "Connect any CRM via Zapier, Make, or custom webhook",
        icon: "webhook",
        connected: connectedProviders.has("WEBHOOK"),
        enabled: connectedProviders.get("WEBHOOK") || false,
        configured: true, // Always available
      },
    ];

    res.json({ providers });
  } catch (error) {
    console.error("❌ Get providers error:", error);
    res.status(500).json({ error: "Failed to fetch providers" });
  }
});

module.exports = router;
