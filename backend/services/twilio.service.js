// ============================================================================
// HEKAX Phone - Twilio Service
// Handles subaccounts, phone numbers, and credentials per organization
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
 * Create a Twilio subaccount for a new organization
 */
async function createSubaccount(organizationId, organizationName) {
  const masterClient = getMasterClient();
  
  try {
    // Create subaccount with friendly name
    const subaccount = await masterClient.api.accounts.create({
      friendlyName: `HEKAX - ${organizationName}`,
    });

    console.log("✅ Twilio subaccount created:", subaccount.sid);

    // Update organization with subaccount SID
    await prisma.organization.update({
      where: { id: organizationId },
      data: { 
        twilioSubAccountSid: subaccount.sid,
        twilioSubAccountToken: subaccount.authToken,
      },
    });

    return {
      sid: subaccount.sid,
      authToken: subaccount.authToken,
      friendlyName: subaccount.friendlyName,
    };
  } catch (error) {
    console.error("❌ Failed to create Twilio subaccount:", error);
    throw error;
  }
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

/**
 * Search available phone numbers for an organization
 * Smart capability search: Voice+SMS required, fallback for MMS/Fax
 */
async function searchAvailableNumbers(organizationId, options = {}) {
  const { areaCode, country = "US", type = "local", limit = 10 } = options;
  
  const client = await getClientForOrganization(organizationId);
  
  // Try different capability combinations (most features first, then fallback)
  const capabilityCombinations = [
    { voiceEnabled: true, smsEnabled: true, mmsEnabled: true, faxEnabled: true },  // All 4
    { voiceEnabled: true, smsEnabled: true, mmsEnabled: true },                     // No fax
    { voiceEnabled: true, smsEnabled: true },                                       // Voice + SMS only
  ];

  let numbers = [];
  let usedCaps = null;

  for (const caps of capabilityCombinations) {
    try {
      const searchParams = {
        ...caps,
        limit,
      };

      if (areaCode) {
        searchParams.areaCode = areaCode;
      }

      if (type === "tollfree") {
        numbers = await client.availablePhoneNumbers(country).tollFree.list(searchParams);
      } else {
        numbers = await client.availablePhoneNumbers(country).local.list(searchParams);
      }

      if (numbers.length > 0) {
        usedCaps = caps;
        break; // Found numbers, stop searching
      }
    } catch (err) {
      console.log(`⚠️ Search with caps ${JSON.stringify(caps)} failed:`, err.message);
      // Continue to next capability combo
    }
  }

  // Log which capabilities were used
  if (usedCaps) {
    const features = [];
    if (usedCaps.voiceEnabled) features.push("Voice");
    if (usedCaps.smsEnabled) features.push("SMS");
    if (usedCaps.mmsEnabled) features.push("MMS");
    if (usedCaps.faxEnabled) features.push("Fax");
    console.log(`📞 Found ${numbers.length} numbers with: ${features.join(", ")}`);
  }

  return {
    numbers: numbers.map((n) => ({
      number: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality,
      region: n.region,
      postalCode: n.postalCode,
      capabilities: n.capabilities,
    })),
    capabilitiesUsed: usedCaps,
    message: usedCaps && !usedCaps.faxEnabled 
      ? "Some features unavailable in this area" 
      : null,
  };
}

/**
 * Purchase a phone number for an organization
 */
async function purchaseNumber(organizationId, phoneNumber, webhookBaseUrl) {
  const client = await getClientForOrganization(organizationId);
  
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl: `${webhookBaseUrl}/twilio/voice/incoming`,
    voiceMethod: "POST",
    statusCallback: `${webhookBaseUrl}/twilio/call/status`,
    statusCallbackMethod: "POST",
  });

  console.log("✅ Phone number purchased:", purchased.phoneNumber);

  return {
    sid: purchased.sid,
    phoneNumber: purchased.phoneNumber,
    friendlyName: purchased.friendlyName,
    capabilities: purchased.capabilities,
  };
}

/**
 * Release a phone number
 */
async function releaseNumber(organizationId, twilioSid) {
  const client = await getClientForOrganization(organizationId);
  
  await client.incomingPhoneNumbers(twilioSid).remove();
  console.log("🗑️ Phone number released:", twilioSid);
}

/**
 * Generate access token for softphone (per organization)
 */
async function generateAccessToken(organizationId, identity) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { 
      twilioSubAccountSid: true,
      twimlAppSid: true,
    },
  });

  const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWIML_APP_SID } = process.env;
  
  // IMPORTANT: API Keys are tied to the account that created them.
  // Always use MASTER account SID with master API Key for token generation.
  // The TwiML App SID determines which app handles the calls.
  const accountSid = TWILIO_ACCOUNT_SID;
  const appSid = org?.twimlAppSid || TWIML_APP_SID;

  if (!accountSid || !TWILIO_API_KEY || !TWILIO_API_SECRET || !appSid) {
    throw new Error("Missing Twilio configuration for token generation");
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  // Token is created with master account credentials
  const token = new AccessToken(accountSid, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity,
    ttl: 3600,
  });

  // Grant points to org's TwiML App (which lives in their subaccount)
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: appSid,
      incomingAllow: true,
    })
  );

  console.log("✅ Token generated for org:", organizationId, "using app:", appSid);

  return {
    token: token.toJwt(),
    identity,
  };
}

/**
 * Create TwiML App for an organization's subaccount
 */
async function createTwimlApp(organizationId, organizationName, webhookBaseUrl) {
  const client = await getClientForOrganization(organizationId);
  
  const app = await client.applications.create({
    friendlyName: `${organizationName} Voice App`,
    voiceUrl: `${webhookBaseUrl}/twilio/voice/outbound`,
    voiceMethod: "POST",
  });

  // Save TwiML App SID to organization
  await prisma.organization.update({
    where: { id: organizationId },
    data: { twimlAppSid: app.sid },
  });

  console.log("✅ TwiML App created:", app.sid);

  return app;
}

module.exports = {
  getMasterClient,
  createSubaccount,
  getClientForOrganization,
  searchAvailableNumbers,
  purchaseNumber,
  releaseNumber,
  generateAccessToken,
  createTwimlApp,
};