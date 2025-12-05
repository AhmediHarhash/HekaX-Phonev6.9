// ============================================================================
// HEKAX Phone - Twilio Service
// FULL AUTOMATION: Subaccounts, TwiML Apps, API Keys, Phone Numbers
// One-click provisioning for new organizations
// ============================================================================

const twilio = require("twilio");
const prisma = require("../lib/prisma");

// Master Twilio client (your main account)
function getMasterClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Master Twilio credentials not configured");
  }
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

/**
 * Get Twilio client for an organization
 * Uses subaccount if available, falls back to master account
 */
async function getClientForOrganization(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      twilioSubAccountSid: true,
      twilioSubAccountToken: true,
    },
  });

  // If org has subaccount, use it
  if (org?.twilioSubAccountSid && org?.twilioSubAccountToken) {
    return twilio(org.twilioSubAccountSid, org.twilioSubAccountToken);
  }

  // Fall back to master account
  console.log("⚠️ No subaccount for org, using master account:", organizationId);
  return getMasterClient();
}

// ============================================================================
// FULL PROVISIONING - The Magic Happens Here
// ============================================================================

/**
 * FULL AUTO-PROVISIONING
 * Creates everything needed for a new organization:
 * 1. Twilio Subaccount (isolated billing & resources)
 * 2. TwiML App (voice webhook configuration)
 * 3. API Key & Secret (for access tokens)
 *
 * Call this when a new organization is created!
 */
async function provisionOrganization(organizationId, organizationName) {
  console.log("🚀 Starting full Twilio provisioning for:", organizationName);

  const webhookBaseUrl = process.env.PUBLIC_BASE_URL;
  if (!webhookBaseUrl) {
    throw new Error("PUBLIC_BASE_URL not configured - cannot set up webhooks");
  }

  const masterClient = getMasterClient();
  const results = {
    subaccount: null,
    twimlApp: null,
    apiKey: null,
    success: false,
    errors: [],
  };

  try {
    // ========================================================================
    // STEP 1: Create Twilio Subaccount
    // ========================================================================
    console.log("📦 Step 1: Creating Twilio subaccount...");

    const subaccount = await masterClient.api.accounts.create({
      friendlyName: `HEKAX - ${organizationName}`,
    });

    results.subaccount = {
      sid: subaccount.sid,
      friendlyName: subaccount.friendlyName,
    };

    console.log("✅ Subaccount created:", subaccount.sid);

    // Create client for the new subaccount
    const subClient = twilio(subaccount.sid, subaccount.authToken);

    // ========================================================================
    // STEP 2: Create TwiML App in Subaccount
    // ========================================================================
    console.log("📱 Step 2: Creating TwiML App...");

    const twimlApp = await subClient.applications.create({
      friendlyName: `${organizationName} Voice App`,
      voiceUrl: `${webhookBaseUrl}/twilio/voice/outbound`,
      voiceMethod: "POST",
      voiceFallbackUrl: `${webhookBaseUrl}/twilio/voice/fallback`,
      voiceFallbackMethod: "POST",
      statusCallback: `${webhookBaseUrl}/twilio/call/status`,
      statusCallbackMethod: "POST",
    });

    results.twimlApp = {
      sid: twimlApp.sid,
      friendlyName: twimlApp.friendlyName,
    };

    console.log("✅ TwiML App created:", twimlApp.sid);

    // ========================================================================
    // STEP 3: Create API Key for Access Tokens
    // ========================================================================
    console.log("🔑 Step 3: Creating API Key...");

    const apiKey = await subClient.newKeys.create({
      friendlyName: `${organizationName} API Key`,
    });

    results.apiKey = {
      sid: apiKey.sid,
      // Secret is only returned once at creation!
      secret: apiKey.secret,
    };

    console.log("✅ API Key created:", apiKey.sid);

    // ========================================================================
    // STEP 4: Save Everything to Database
    // ========================================================================
    console.log("💾 Step 4: Saving to database...");

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        // Subaccount credentials
        twilioSubAccountSid: subaccount.sid,
        twilioSubAccountToken: subaccount.authToken,
        // TwiML App
        twimlAppSid: twimlApp.sid,
        // API Key (for generating access tokens)
        twilioApiKeySid: apiKey.sid,
        twilioApiKeySecret: apiKey.secret,
        // Mark as provisioned
        twilioProvisioned: true,
        twilioProvisionedAt: new Date(),
      },
    });

    console.log("✅ Database updated");

    // ========================================================================
    // DONE!
    // ========================================================================
    results.success = true;
    console.log("🎉 Full provisioning complete for:", organizationName);
    console.log("   Subaccount:", subaccount.sid);
    console.log("   TwiML App:", twimlApp.sid);
    console.log("   API Key:", apiKey.sid);

    return results;

  } catch (error) {
    console.error("❌ Provisioning failed:", error);
    results.errors.push(error.message);

    // Try to cleanup if partial provisioning happened
    if (results.subaccount?.sid) {
      console.log("🧹 Attempting cleanup of partial provisioning...");
      try {
        // Close the subaccount (sets status to closed)
        await masterClient.api.accounts(results.subaccount.sid).update({
          status: "closed",
        });
        console.log("🗑️ Subaccount closed:", results.subaccount.sid);
      } catch (cleanupErr) {
        console.error("⚠️ Cleanup failed:", cleanupErr.message);
      }
    }

    throw error;
  }
}

/**
 * Deprovision an organization (cleanup when org is deleted)
 * Closes subaccount and removes from database
 */
async function deprovisionOrganization(organizationId) {
  console.log("🗑️ Deprovisioning organization:", organizationId);

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      twilioSubAccountSid: true,
    },
  });

  if (!org?.twilioSubAccountSid) {
    console.log("⚠️ No subaccount to deprovision");
    return { success: true, message: "No subaccount found" };
  }

  try {
    const masterClient = getMasterClient();

    // Close the subaccount (this releases all resources)
    await masterClient.api.accounts(org.twilioSubAccountSid).update({
      status: "closed",
    });

    console.log("✅ Subaccount closed:", org.twilioSubAccountSid);

    // Clear Twilio data from organization
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        twilioSubAccountSid: null,
        twilioSubAccountToken: null,
        twimlAppSid: null,
        twilioApiKeySid: null,
        twilioApiKeySecret: null,
        twilioProvisioned: false,
        twilioProvisionedAt: null,
      },
    });

    return { success: true, message: "Organization deprovisioned" };

  } catch (error) {
    console.error("❌ Deprovisioning failed:", error);
    throw error;
  }
}

/**
 * Check provisioning status for an organization
 */
async function getProvisioningStatus(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      twilioProvisioned: true,
      twilioProvisionedAt: true,
      twilioSubAccountSid: true,
      twimlAppSid: true,
      twilioApiKeySid: true,
      twilioNumber: true,
    },
  });

  if (!org) {
    return { provisioned: false, error: "Organization not found" };
  }

  return {
    provisioned: org.twilioProvisioned || false,
    provisionedAt: org.twilioProvisionedAt,
    hasSubaccount: !!org.twilioSubAccountSid,
    hasTwimlApp: !!org.twimlAppSid,
    hasApiKey: !!org.twilioApiKeySid,
    hasPhoneNumber: !!org.twilioNumber,
    ready: !!(org.twilioProvisioned && org.twilioNumber),
  };
}

// ============================================================================
// PHONE NUMBER MANAGEMENT
// ============================================================================

/**
 * Search available phone numbers
 */
async function searchAvailableNumbers(organizationId, options = {}) {
  const { areaCode, country = "US", type = "local", limit = 10, contains } = options;

  const client = await getClientForOrganization(organizationId);

  // Build search parameters
  const searchParams = {
    voiceEnabled: true,
    smsEnabled: true,
    limit,
  };

  if (areaCode) searchParams.areaCode = areaCode;
  if (contains) searchParams.contains = contains;

  let numbers = [];

  try {
    if (type === "tollfree") {
      numbers = await client.availablePhoneNumbers(country).tollFree.list(searchParams);
    } else {
      numbers = await client.availablePhoneNumbers(country).local.list(searchParams);
    }
  } catch (err) {
    console.error("❌ Number search failed:", err.message);
    throw new Error("Failed to search phone numbers: " + err.message);
  }

  console.log(`📞 Found ${numbers.length} available numbers`);

  return {
    numbers: numbers.map((n) => ({
      number: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality,
      region: n.region,
      postalCode: n.postalCode,
      capabilities: n.capabilities,
      monthlyPrice: n.price || "1.15", // Twilio local number base price
    })),
  };
}

/**
 * Purchase a phone number for an organization
 * Automatically configures webhooks
 */
async function purchaseNumber(organizationId, phoneNumber) {
  const webhookBaseUrl = process.env.PUBLIC_BASE_URL;
  if (!webhookBaseUrl) {
    throw new Error("PUBLIC_BASE_URL not configured");
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, twimlAppSid: true },
  });

  const client = await getClientForOrganization(organizationId);

  // Purchase the number with webhook configuration
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl: `${webhookBaseUrl}/twilio/voice/incoming`,
    voiceMethod: "POST",
    voiceFallbackUrl: `${webhookBaseUrl}/twilio/voice/fallback`,
    voiceFallbackMethod: "POST",
    statusCallback: `${webhookBaseUrl}/twilio/call/status`,
    statusCallbackMethod: "POST",
    smsUrl: `${webhookBaseUrl}/twilio/sms/incoming`,
    smsMethod: "POST",
    friendlyName: `${org?.name || "HEKAX"} Main Line`,
  });

  console.log("✅ Phone number purchased:", purchased.phoneNumber);

  // Save to PhoneNumber table
  const phoneRecord = await prisma.phoneNumber.create({
    data: {
      number: purchased.phoneNumber,
      friendlyName: purchased.friendlyName || "Main Line",
      twilioSid: purchased.sid,
      organizationId,
      status: "active",
      routeToAI: true,
      capabilities: {
        voice: purchased.capabilities.voice,
        sms: purchased.capabilities.sms,
        mms: purchased.capabilities.mms,
      },
    },
  });

  // Update organization's primary number if not set
  const currentOrg = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { twilioNumber: true },
  });

  if (!currentOrg?.twilioNumber) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { twilioNumber: purchased.phoneNumber },
    });
  }

  return {
    sid: purchased.sid,
    phoneNumber: purchased.phoneNumber,
    friendlyName: purchased.friendlyName,
    capabilities: purchased.capabilities,
    dbRecord: phoneRecord,
  };
}

/**
 * Release a phone number
 */
async function releaseNumber(organizationId, phoneNumberId) {
  const phoneRecord = await prisma.phoneNumber.findUnique({
    where: { id: phoneNumberId },
    select: { twilioSid: true, number: true, organizationId: true },
  });

  if (!phoneRecord) {
    throw new Error("Phone number not found");
  }

  if (phoneRecord.organizationId !== organizationId) {
    throw new Error("Phone number does not belong to this organization");
  }

  const client = await getClientForOrganization(organizationId);

  // Release from Twilio
  if (phoneRecord.twilioSid) {
    await client.incomingPhoneNumbers(phoneRecord.twilioSid).remove();
    console.log("🗑️ Phone number released from Twilio:", phoneRecord.number);
  }

  // Update database
  await prisma.phoneNumber.update({
    where: { id: phoneNumberId },
    data: { status: "released" },
  });

  // Clear from organization if it was the primary number
  await prisma.organization.updateMany({
    where: { id: organizationId, twilioNumber: phoneRecord.number },
    data: { twilioNumber: null },
  });

  return { success: true, number: phoneRecord.number };
}

// ============================================================================
// ACCESS TOKEN GENERATION
// ============================================================================

/**
 * Generate access token for softphone
 * Uses organization's API key for proper subaccount isolation
 */
async function generateAccessToken(organizationId, identity) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      twilioSubAccountSid: true,
      twilioApiKeySid: true,
      twilioApiKeySecret: true,
      twimlAppSid: true,
    },
  });

  // Determine which credentials to use
  let accountSid, apiKey, apiSecret, appSid;

  if (org?.twilioSubAccountSid && org?.twilioApiKeySid && org?.twilioApiKeySecret) {
    // Use organization's subaccount credentials
    accountSid = org.twilioSubAccountSid;
    apiKey = org.twilioApiKeySid;
    apiSecret = org.twilioApiKeySecret;
    appSid = org.twimlAppSid;
    console.log("🔐 Using org subaccount for token:", accountSid);
  } else {
    // Fallback to master account
    const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWIML_APP_SID } = process.env;
    accountSid = TWILIO_ACCOUNT_SID;
    apiKey = TWILIO_API_KEY;
    apiSecret = TWILIO_API_SECRET;
    appSid = org?.twimlAppSid || TWIML_APP_SID;
    console.log("⚠️ Using master account for token (org not fully provisioned)");
  }

  if (!accountSid || !apiKey || !apiSecret || !appSid) {
    throw new Error("Missing Twilio configuration for token generation");
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(accountSid, apiKey, apiSecret, {
    identity,
    ttl: 3600, // 1 hour
  });

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: appSid,
      incomingAllow: true,
    })
  );

  console.log("✅ Access token generated for identity:", identity);

  return {
    token: token.toJwt(),
    identity,
    accountSid,
    appSid,
  };
}

// ============================================================================
// LEGACY FUNCTIONS (for backwards compatibility)
// ============================================================================

/**
 * @deprecated Use provisionOrganization instead
 */
async function createSubaccount(organizationId, organizationName) {
  console.log("⚠️ createSubaccount is deprecated, use provisionOrganization");
  const result = await provisionOrganization(organizationId, organizationName);
  return result.subaccount;
}

/**
 * @deprecated Use provisionOrganization instead
 */
async function createTwimlApp(organizationId, organizationName, webhookBaseUrl) {
  console.log("⚠️ createTwimlApp is deprecated, use provisionOrganization");
  // This is now handled by provisionOrganization
  throw new Error("Use provisionOrganization instead");
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core
  getMasterClient,
  getClientForOrganization,

  // Full provisioning (THE MAIN ONES TO USE)
  provisionOrganization,
  deprovisionOrganization,
  getProvisioningStatus,

  // Phone numbers
  searchAvailableNumbers,
  purchaseNumber,
  releaseNumber,

  // Tokens
  generateAccessToken,

  // Legacy (deprecated)
  createSubaccount,
  createTwimlApp,
};
