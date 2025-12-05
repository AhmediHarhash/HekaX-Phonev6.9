// ============================================================================
// HEKAX Phone - Twilio Webhook Validation Middleware
// Validates incoming Twilio requests using X-Twilio-Signature
// ============================================================================

const twilio = require("twilio");

/**
 * Validate Twilio webhook signature
 * Ensures requests are genuinely from Twilio
 */
function validateTwilioWebhook(req, res, next) {
  // Skip validation in development if explicitly disabled
  if (process.env.NODE_ENV === "development" && process.env.SKIP_TWILIO_VALIDATION === "true") {
    console.log("⚠️ Twilio validation skipped (dev mode)");
    return next();
  }

  const twilioSignature = req.headers["x-twilio-signature"];
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    console.error("❌ TWILIO_AUTH_TOKEN not configured");
    return res.status(500).send("Server configuration error");
  }

  if (!twilioSignature) {
    console.warn(`⚠️ Missing Twilio signature from ${req.ip}: ${req.method} ${req.path}`);
    return res.status(403).send("Forbidden: Missing signature");
  }

  // Build the full URL Twilio used (important for signature validation)
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const baseUrl = process.env.PUBLIC_BASE_URL || `${protocol}://${host}`;
  const url = `${baseUrl}${req.originalUrl}`;

  // Get the body params (Twilio sends form data)
  const params = req.body || {};

  // Validate the signature
  const isValid = twilio.validateRequest(authToken, twilioSignature, url, params);

  if (!isValid) {
    console.warn(`⚠️ Invalid Twilio signature from ${req.ip}: ${req.method} ${req.path}`);
    console.warn(`   URL used for validation: ${url}`);
    return res.status(403).send("Forbidden: Invalid signature");
  }

  // Valid request from Twilio
  next();
}

/**
 * Validate Twilio webhook with fallback URL check
 * Tries both with and without trailing slash, and with/without port
 */
function validateTwilioWebhookFlexible(req, res, next) {
  // Skip validation in development if explicitly disabled
  if (process.env.NODE_ENV === "development" && process.env.SKIP_TWILIO_VALIDATION === "true") {
    console.log("⚠️ Twilio validation skipped (dev mode)");
    return next();
  }

  const twilioSignature = req.headers["x-twilio-signature"];
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    console.error("❌ TWILIO_AUTH_TOKEN not configured");
    return res.status(500).send("Server configuration error");
  }

  if (!twilioSignature) {
    console.warn(`⚠️ Missing Twilio signature from ${req.ip}: ${req.method} ${req.path}`);
    return res.status(403).send("Forbidden: Missing signature");
  }

  // Build possible URLs
  const baseUrl = process.env.PUBLIC_BASE_URL || "https://phoneapi.hekax.com";
  const params = req.body || {};

  // Try multiple URL variations
  const urlVariations = [
    `${baseUrl}${req.originalUrl}`,
    `${baseUrl}${req.originalUrl}`.replace(/\/$/, ""), // Without trailing slash
    `${baseUrl}${req.path}`, // Without query string
  ];

  let isValid = false;
  for (const url of urlVariations) {
    if (twilio.validateRequest(authToken, twilioSignature, url, params)) {
      isValid = true;
      break;
    }
  }

  if (!isValid) {
    console.warn(`⚠️ Invalid Twilio signature from ${req.ip}: ${req.method} ${req.path}`);
    return res.status(403).send("Forbidden: Invalid signature");
  }

  next();
}

/**
 * Log Twilio webhook for debugging (without blocking)
 */
function logTwilioWebhook(req, res, next) {
  console.log(`📞 Twilio webhook: ${req.method} ${req.path}`);
  console.log(`   From: ${req.body?.From || "N/A"}`);
  console.log(`   To: ${req.body?.To || "N/A"}`);
  console.log(`   CallSid: ${req.body?.CallSid || "N/A"}`);
  next();
}

module.exports = {
  validateTwilioWebhook,
  validateTwilioWebhookFlexible,
  logTwilioWebhook,
};
