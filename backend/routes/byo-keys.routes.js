// ============================================================================
// HEKAX Phone - BYO Keys Routes
// Phase 6.4: Bring Your Own Keys (Enterprise Feature)
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { encrypt, decrypt, maskValue } = require("../lib/encryption");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { createAuditLog } = require("../middleware/audit.middleware");

const router = express.Router();

// Supported providers
const PROVIDERS = {
  openai: {
    name: "OpenAI",
    field: "byoOpenaiKey",
    testEndpoint: "https://api.openai.com/v1/models",
    testHeader: "Authorization",
    testHeaderPrefix: "Bearer ",
  },
  elevenlabs: {
    name: "ElevenLabs",
    field: "byoElevenlabsKey",
    testEndpoint: "https://api.elevenlabs.io/v1/user",
    testHeader: "xi-api-key",
    testHeaderPrefix: "",
  },
  deepgram: {
    name: "Deepgram",
    field: "byoDeepgramKey",
    testEndpoint: "https://api.deepgram.com/v1/projects",
    testHeader: "Authorization",
    testHeaderPrefix: "Token ",
  },
};

/**
 * GET /api/byo-keys
 * Get BYO keys status (masked values)
 */
router.get("/", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: {
        plan: true,
        byoKeysEnabled: true,
        byoOpenaiKey: true,
        byoElevenlabsKey: true,
        byoDeepgramKey: true,
        byoTwilioAccountSid: true,
        byoTwilioAuthToken: true,
        byoTwilioNumber: true,
        byoKeysValidatedAt: true,
      },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Check if enterprise plan (SCALE and ENTERPRISE have enterprise features)
    const isEnterprise = org.plan === "ENTERPRISE" || org.plan === "SCALE";

    res.json({
      enabled: org.byoKeysEnabled,
      isEnterprise,
      validatedAt: org.byoKeysValidatedAt,
      keys: {
        openai: {
          configured: !!org.byoOpenaiKey,
          masked: org.byoOpenaiKey ? maskValue(decrypt(org.byoOpenaiKey), 4) : null,
        },
        elevenlabs: {
          configured: !!org.byoElevenlabsKey,
          masked: org.byoElevenlabsKey ? maskValue(decrypt(org.byoElevenlabsKey), 4) : null,
        },
        deepgram: {
          configured: !!org.byoDeepgramKey,
          masked: org.byoDeepgramKey ? maskValue(decrypt(org.byoDeepgramKey), 4) : null,
        },
        twilio: {
          configured: !!(org.byoTwilioAccountSid && org.byoTwilioAuthToken),
          accountSid: org.byoTwilioAccountSid || null,
          phoneNumber: org.byoTwilioNumber || null,
        },
      },
    });
  } catch (err) {
    console.error("❌ GET /api/byo-keys error:", err);
    res.status(500).json({ error: "Failed to get BYO keys" });
  }
});

/**
 * POST /api/byo-keys/:provider
 * Set a BYO key for a provider
 */
router.post("/:provider", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { provider } = req.params;
    const { apiKey, accountSid, authToken, phoneNumber } = req.body;

    // Check if enterprise
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { plan: true },
    });

    // BYO Keys available for all paid plans (teams can have multiple members)
    if (org.plan === "TRIAL") {
      return res.status(403).json({
        error: "BYO Keys require a paid plan. Please upgrade to access this feature."
      });
    }

    // Handle Twilio separately (has multiple fields)
    if (provider === "twilio") {
      if (!accountSid || !authToken) {
        return res.status(400).json({ error: "Account SID and Auth Token required" });
      }

      await prisma.organization.update({
        where: { id: req.organizationId },
        data: {
          byoTwilioAccountSid: accountSid,
          byoTwilioAuthToken: encrypt(authToken),
          byoTwilioNumber: phoneNumber || null,
          byoKeysEnabled: true,
        },
      });

      await createAuditLog({
        actorType: "user",
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: "byo_keys.twilio.set",
        entityType: "organization",
        entityId: req.organizationId,
        organizationId: req.organizationId,
      });

      return res.json({ message: "Twilio credentials saved" });
    }

    // Handle other providers
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    if (!apiKey) {
      return res.status(400).json({ error: "API key required" });
    }

    // Encrypt and save
    const encryptedKey = encrypt(apiKey);
    
    await prisma.organization.update({
      where: { id: req.organizationId },
      data: {
        [providerConfig.field]: encryptedKey,
        byoKeysEnabled: true,
      },
    });

    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: `byo_keys.${provider}.set`,
      entityType: "organization",
      entityId: req.organizationId,
      organizationId: req.organizationId,
    });

    console.log(`✅ BYO key set for ${provider}:`, req.organizationId);

    res.json({ message: `${providerConfig.name} key saved` });
  } catch (err) {
    console.error("❌ POST /api/byo-keys/:provider error:", err);
    res.status(500).json({ error: "Failed to save key" });
  }
});

/**
 * DELETE /api/byo-keys/:provider
 * Remove a BYO key
 */
router.delete("/:provider", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { provider } = req.params;

    // Handle Twilio
    if (provider === "twilio") {
      await prisma.organization.update({
        where: { id: req.organizationId },
        data: {
          byoTwilioAccountSid: null,
          byoTwilioAuthToken: null,
          byoTwilioNumber: null,
        },
      });
    } else {
      const providerConfig = PROVIDERS[provider];
      if (!providerConfig) {
        return res.status(400).json({ error: "Invalid provider" });
      }

      await prisma.organization.update({
        where: { id: req.organizationId },
        data: {
          [providerConfig.field]: null,
        },
      });
    }

    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: `byo_keys.${provider}.remove`,
      entityType: "organization",
      entityId: req.organizationId,
      organizationId: req.organizationId,
    });

    console.log(`✅ BYO key removed for ${provider}:`, req.organizationId);

    res.json({ message: "Key removed" });
  } catch (err) {
    console.error("❌ DELETE /api/byo-keys/:provider error:", err);
    res.status(500).json({ error: "Failed to remove key" });
  }
});

/**
 * POST /api/byo-keys/:provider/test
 * Test a BYO key
 */
router.post("/:provider/test", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { provider } = req.params;
    const { apiKey, accountSid, authToken } = req.body;

    // Handle Twilio test
    if (provider === "twilio") {
      if (!accountSid || !authToken) {
        return res.status(400).json({ error: "Account SID and Auth Token required" });
      }

      try {
        // Test Twilio credentials by fetching account info
        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
          headers: { Authorization: `Basic ${credentials}` },
        });

        if (!response.ok) {
          return res.json({ valid: false, error: "Invalid Twilio credentials" });
        }

        const data = await response.json();
        return res.json({ 
          valid: true, 
          details: { 
            friendlyName: data.friendly_name,
            status: data.status,
          } 
        });
      } catch (err) {
        return res.json({ valid: false, error: err.message });
      }
    }

    // Handle other providers
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    if (!apiKey) {
      return res.status(400).json({ error: "API key required" });
    }

    try {
      const response = await fetch(providerConfig.testEndpoint, {
        method: "GET",
        headers: {
          [providerConfig.testHeader]: `${providerConfig.testHeaderPrefix}${apiKey}`,
        },
      });

      if (!response.ok) {
        return res.json({ valid: false, error: `API returned ${response.status}` });
      }

      res.json({ valid: true });
    } catch (err) {
      res.json({ valid: false, error: err.message });
    }
  } catch (err) {
    console.error("❌ POST /api/byo-keys/:provider/test error:", err);
    res.status(500).json({ error: "Failed to test key" });
  }
});

/**
 * POST /api/byo-keys/validate-all
 * Validate all configured BYO keys
 */
router.post("/validate-all", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: {
        byoOpenaiKey: true,
        byoElevenlabsKey: true,
        byoDeepgramKey: true,
        byoTwilioAccountSid: true,
        byoTwilioAuthToken: true,
      },
    });

    const results = {
      openai: { configured: false, valid: null },
      elevenlabs: { configured: false, valid: null },
      deepgram: { configured: false, valid: null },
      twilio: { configured: false, valid: null },
    };

    // Test each configured key
    for (const [provider, config] of Object.entries(PROVIDERS)) {
      const encryptedKey = org[config.field];
      if (encryptedKey) {
        results[provider].configured = true;
        try {
          const apiKey = decrypt(encryptedKey);
          const response = await fetch(config.testEndpoint, {
            method: "GET",
            headers: {
              [config.testHeader]: `${config.testHeaderPrefix}${apiKey}`,
            },
          });
          results[provider].valid = response.ok;
        } catch {
          results[provider].valid = false;
        }
      }
    }

    // Test Twilio
    if (org.byoTwilioAccountSid && org.byoTwilioAuthToken) {
      results.twilio.configured = true;
      try {
        const authToken = decrypt(org.byoTwilioAuthToken);
        const credentials = Buffer.from(`${org.byoTwilioAccountSid}:${authToken}`).toString("base64");
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${org.byoTwilioAccountSid}.json`,
          { headers: { Authorization: `Basic ${credentials}` } }
        );
        results.twilio.valid = response.ok;
      } catch {
        results.twilio.valid = false;
      }
    }

    // Update validation timestamp
    const allValid = Object.values(results).every(r => !r.configured || r.valid);
    if (allValid) {
      await prisma.organization.update({
        where: { id: req.organizationId },
        data: { byoKeysValidatedAt: new Date() },
      });
    }

    res.json({ results, allValid });
  } catch (err) {
    console.error("❌ POST /api/byo-keys/validate-all error:", err);
    res.status(500).json({ error: "Failed to validate keys" });
  }
});

/**
 * POST /api/byo-keys/toggle
 * Enable/disable BYO keys usage
 */
router.post("/toggle", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { enabled } = req.body;

    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { plan: true },
    });

    // BYO Keys available for all paid plans
    if (org.plan === "TRIAL") {
      return res.status(403).json({ error: "BYO Keys require a paid plan" });
    }

    await prisma.organization.update({
      where: { id: req.organizationId },
      data: { byoKeysEnabled: !!enabled },
    });

    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: enabled ? "byo_keys.enabled" : "byo_keys.disabled",
      entityType: "organization",
      entityId: req.organizationId,
      organizationId: req.organizationId,
    });

    res.json({ enabled: !!enabled });
  } catch (err) {
    console.error("❌ POST /api/byo-keys/toggle error:", err);
    res.status(500).json({ error: "Failed to toggle BYO keys" });
  }
});

module.exports = router;
