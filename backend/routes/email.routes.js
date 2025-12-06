/**
 * Email Routes - Test endpoints for email service
 * SECURITY: Protected with auth and strict rate limiting
 */

const express = require("express");
const router = express.Router();
const emailService = require("../services/emailService");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const rateLimit = require("express-rate-limit");

// Strict rate limiter for email testing (5 per hour per user)
// Since this endpoint requires authentication, we key by user ID
const emailTestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Too many test emails. Limit: 5 per hour." },
  standardHeaders: true,
  legacyHeaders: false,
  // Key by user ID (authMiddleware runs before this)
  keyGenerator: (req) => `user:${req.user?.id || "anonymous"}`,
  // Skip IPv6 validation since we're using user ID, not IP
  validate: { xForwardedForHeader: false, trustProxy: false, default: false },
});

/**
 * GET /api/email/status
 * Check email service status
 */
router.get("/status", (req, res) => {
  const status = emailService.getStatus();
  res.json(status);
});

/**
 * POST /api/test-email
 * Send a test email
 *
 * Body:
 * - to: recipient email (required)
 * - subject: email subject (optional, default: "Test Email")
 * - message: custom message (optional)
 */
router.post("/test-email", authMiddleware, requireRole("OWNER", "ADMIN"), emailTestLimiter, async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Recipient email (to) is required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Check if service is configured
    if (!emailService.isConfigured()) {
      return res.status(503).json({
        error: "Email service not configured",
        details: "Missing AWS credentials or SES_FROM_EMAIL",
        status: emailService.getStatus(),
      });
    }

    const customMessage = message || "This is a test email from HEKAX Phone.";
    const emailSubject = subject || "Test Email from HEKAX Phone";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${emailSubject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto;">
          <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="margin-top: 0; color: #1a1a1a;">Test Email</h2>
            <p>${customMessage}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #666; font-size: 14px;">
              <strong>Sent at:</strong> ${new Date().toISOString()}<br>
              <strong>Provider:</strong> AWS SES<br>
              <strong>Region:</strong> ${process.env.AWS_REGION || "us-east-1"}
            </p>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px; margin-top: 32px;">
            <p>HEKAX Phone - AI-Powered Business Phone System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Test Email

${customMessage}

---
Sent at: ${new Date().toISOString()}
Provider: AWS SES
Region: ${process.env.AWS_REGION || "us-east-1"}

HEKAX Phone - AI-Powered Business Phone System
    `;

    const result = await emailService.sendEmail({
      to,
      subject: emailSubject,
      html,
      text,
    });

    res.json({
      success: true,
      message: `Test email sent to ${to}`,
      messageId: result.messageId,
      provider: result.provider,
    });
  } catch (error) {
    console.error("Test email error:", error);

    // Handle specific AWS SES errors
    if (error.name === "MessageRejected") {
      return res.status(400).json({
        error: "Email rejected by SES",
        details: error.message,
      });
    }

    if (error.name === "MailFromDomainNotVerifiedException") {
      return res.status(400).json({
        error: "Sender email domain not verified in SES",
        details: "Verify your domain in AWS SES console",
      });
    }

    if (error.name === "ConfigurationSetDoesNotExistException") {
      return res.status(400).json({
        error: "SES configuration set not found",
        details: error.message,
      });
    }

    res.status(500).json({
      error: "Failed to send test email",
      details: error.message,
    });
  }
});

module.exports = router;
