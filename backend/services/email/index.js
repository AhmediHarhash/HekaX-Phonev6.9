// ============================================================================
// HEKAX Phone - Email Service
// Professional transactional email with multiple provider support
// Priority: Resend > SendGrid > AWS SES
// ============================================================================

const crypto = require("crypto");

// Try to load email providers in order of preference
let resend = null;
let sendgrid = null;
let sesClient = null;
let activeProvider = null;

try {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = require("resend");
    resend = new Resend(process.env.RESEND_API_KEY);
    activeProvider = "Resend";
    console.log("✅ Email service: Resend configured");
  } else if (process.env.SENDGRID_API_KEY) {
    sendgrid = require("@sendgrid/mail");
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
    activeProvider = "SendGrid";
    console.log("✅ Email service: SendGrid configured");
  } else if (process.env.AWS_SES_REGION || process.env.AWS_ACCESS_KEY_ID) {
    // AWS SES - works with IAM roles (EC2/Lambda) or explicit credentials
    const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
    const sesConfig = {
      region: process.env.AWS_SES_REGION || process.env.AWS_REGION || "us-east-1",
    };
    // Only add credentials if explicitly provided (otherwise uses IAM role)
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      sesConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }
    sesClient = new SESClient(sesConfig);
    activeProvider = "AWS SES";
    console.log("✅ Email service: AWS SES configured (region:", sesConfig.region + ")");
  }
} catch (err) {
  console.warn("⚠️ Email service not configured:", err.message);
}

// ============================================================================
// EMAIL CONFIGURATION
// ============================================================================
const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || "HEKAX Phone <noreply@hekaxphone.com>",
  replyTo: process.env.EMAIL_REPLY_TO || "support@hekaxphone.com",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  companyName: "HEKAX Phone",
  supportEmail: "support@hekaxphone.com",
  logoUrl: "https://hekaxphone.com/logo.png",
};

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

/**
 * Generate base email template with header/footer
 */
function baseTemplate(content, preheader = "") {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>HEKAX Phone</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f4f7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .preheader {
      display: none !important;
      visibility: hidden;
      mso-hide: all;
      font-size: 1px;
      line-height: 1px;
      max-height: 0;
      max-width: 0;
      opacity: 0;
      overflow: hidden;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .email-wrapper {
      background-color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      padding: 32px 40px;
      text-align: center;
    }
    .header img {
      height: 40px;
      width: auto;
    }
    .header h1 {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      margin: 16px 0 0;
    }
    .content {
      padding: 40px;
    }
    .content h2 {
      color: #1f2937;
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 16px;
    }
    .content p {
      color: #4b5563;
      font-size: 16px;
      line-height: 1.6;
      margin: 0 0 16px;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 16px 0;
    }
    .button:hover {
      opacity: 0.9;
    }
    .code-box {
      background-color: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px 24px;
      text-align: center;
      margin: 24px 0;
    }
    .code {
      font-family: 'Courier New', monospace;
      font-size: 32px;
      font-weight: 700;
      color: #3b82f6;
      letter-spacing: 4px;
    }
    .feature-list {
      list-style: none;
      padding: 0;
      margin: 24px 0;
    }
    .feature-list li {
      padding: 12px 0;
      padding-left: 32px;
      position: relative;
      color: #4b5563;
      font-size: 15px;
      border-bottom: 1px solid #f3f4f6;
    }
    .feature-list li:last-child {
      border-bottom: none;
    }
    .feature-list li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #10b981;
      font-weight: bold;
    }
    .footer {
      background-color: #f9fafb;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      color: #9ca3af;
      font-size: 13px;
      margin: 4px 0;
    }
    .footer a {
      color: #6b7280;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
    .social-links {
      margin: 16px 0;
    }
    .social-links a {
      display: inline-block;
      margin: 0 8px;
    }
    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 24px 0;
    }
    .highlight-box {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .small-text {
      font-size: 13px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <span class="preheader">${preheader}</span>
  <div class="container">
    <div class="email-wrapper">
      <div class="header">
        <h1>HEKAX Phone</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p><strong>HEKAX Phone</strong></p>
        <p>AI-Powered Business Phone System</p>
        <div class="divider"></div>
        <p>
          <a href="${EMAIL_CONFIG.frontendUrl}/help">Help Center</a> •
          <a href="${EMAIL_CONFIG.frontendUrl}/privacy">Privacy</a> •
          <a href="${EMAIL_CONFIG.frontendUrl}/terms">Terms</a>
        </p>
        <p class="small-text" style="margin-top: 16px;">
          © ${new Date().getFullYear()} HEKAX Phone. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

const templates = {
  /**
   * Email Verification Template
   */
  verification: ({ name, verificationUrl, verificationCode }) => ({
    subject: "Verify your HEKAX Phone email",
    html: baseTemplate(`
      <h2>Welcome, ${name}! 👋</h2>
      <p>Thanks for signing up for HEKAX Phone. To complete your registration, please verify your email address.</p>

      <div style="text-align: center;">
        <a href="${verificationUrl}" class="button">Verify Email Address</a>
      </div>

      <p class="small-text" style="text-align: center;">Button not working? Copy and paste this link into your browser:</p>
      <p class="small-text" style="text-align: center; word-break: break-all;">${verificationUrl}</p>

      <div class="divider"></div>

      <p>Or enter this verification code:</p>
      <div class="code-box">
        <span class="code">${verificationCode}</span>
      </div>

      <p class="small-text">This verification link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    `, "Verify your email to get started with HEKAX Phone"),
    text: `
Welcome, ${name}!

Thanks for signing up for HEKAX Phone. To complete your registration, please verify your email address.

Click here to verify: ${verificationUrl}

Or enter this code: ${verificationCode}

This verification link expires in 24 hours.

If you didn't create an account, you can safely ignore this email.

- The HEKAX Phone Team
    `.trim(),
  }),

  /**
   * Welcome Email (after verification)
   */
  welcome: ({ name, orgName, loginUrl }) => ({
    subject: `Welcome to HEKAX Phone, ${name}! 🎉`,
    html: baseTemplate(`
      <h2>You're all set, ${name}! 🚀</h2>
      <p>Your account has been verified and your organization <strong>${orgName}</strong> is ready to go.</p>

      <div class="highlight-box">
        <p style="margin: 0; font-weight: 600; color: #1f2937;">Your 7-day free trial has started!</p>
        <p style="margin: 8px 0 0; font-size: 14px;">Explore all features with 200 call minutes and 100 AI minutes included.</p>
      </div>

      <h2>Get Started in 3 Steps</h2>
      <ul class="feature-list">
        <li><strong>Choose your phone number</strong> - Pick a local or toll-free number for your business</li>
        <li><strong>Customize your AI receptionist</strong> - Set your greeting, voice, and business info</li>
        <li><strong>Start receiving calls</strong> - Your AI handles calls 24/7 while you focus on business</li>
      </ul>

      <div style="text-align: center;">
        <a href="${loginUrl}" class="button">Go to Dashboard</a>
      </div>

      <div class="divider"></div>

      <h2>What HEKAX Phone Can Do For You</h2>
      <ul class="feature-list">
        <li><strong>AI Receptionist</strong> - Never miss a call, even after hours</li>
        <li><strong>Lead Capture</strong> - Automatically collect caller info and reason for calling</li>
        <li><strong>Appointment Booking</strong> - Let AI schedule meetings directly to your calendar</li>
        <li><strong>Call Transfers</strong> - Seamlessly transfer to you or your team when needed</li>
        <li><strong>CRM Integration</strong> - Sync leads to HubSpot, Salesforce, Zoho, or Pipedrive</li>
        <li><strong>Real-time Transcripts</strong> - Get full transcripts of every call</li>
      </ul>

      <div class="highlight-box" style="text-align: center;">
        <p style="margin: 0; font-size: 14px;">Need help getting started?</p>
        <p style="margin: 8px 0 0;">
          <a href="${EMAIL_CONFIG.frontendUrl}/help" style="color: #3b82f6; font-weight: 600;">Visit our Help Center</a> or
          <a href="mailto:${EMAIL_CONFIG.supportEmail}" style="color: #3b82f6; font-weight: 600;">Contact Support</a>
        </p>
      </div>
    `, "Your HEKAX Phone account is ready. Start receiving AI-powered calls today!"),
    text: `
Welcome to HEKAX Phone, ${name}! 🎉

Your account has been verified and your organization "${orgName}" is ready to go.

Your 7-day free trial has started with 200 call minutes and 100 AI minutes included.

GET STARTED IN 3 STEPS:
1. Choose your phone number - Pick a local or toll-free number
2. Customize your AI receptionist - Set your greeting, voice, and business info
3. Start receiving calls - Your AI handles calls 24/7

Go to your dashboard: ${loginUrl}

WHAT HEKAX PHONE CAN DO FOR YOU:
• AI Receptionist - Never miss a call
• Lead Capture - Automatically collect caller info
• Appointment Booking - AI schedules meetings
• Call Transfers - Transfer to your team when needed
• CRM Integration - Sync leads to your CRM
• Real-time Transcripts - Full call transcripts

Need help? Visit ${EMAIL_CONFIG.frontendUrl}/help or email ${EMAIL_CONFIG.supportEmail}

- The HEKAX Phone Team
    `.trim(),
  }),

  /**
   * Password Reset Email
   */
  passwordReset: ({ name, resetUrl, resetCode }) => ({
    subject: "Reset your HEKAX Phone password",
    html: baseTemplate(`
      <h2>Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset the password for your HEKAX Phone account. Click the button below to choose a new password.</p>

      <div style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </div>

      <p class="small-text" style="text-align: center;">Button not working? Copy and paste this link into your browser:</p>
      <p class="small-text" style="text-align: center; word-break: break-all;">${resetUrl}</p>

      <div class="divider"></div>

      <p class="small-text">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email - your password will remain unchanged.</p>

      <p class="small-text">For security, this request was received from IP address [IP] at [TIME].</p>
    `, "Reset your HEKAX Phone password"),
    text: `
Password Reset Request

Hi ${name},

We received a request to reset the password for your HEKAX Phone account.

Click here to reset your password: ${resetUrl}

This link expires in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

- The HEKAX Phone Team
    `.trim(),
  }),

  /**
   * Team Invitation Email
   */
  teamInvite: ({ inviterName, orgName, inviteUrl, role }) => ({
    subject: `${inviterName} invited you to join ${orgName} on HEKAX Phone`,
    html: baseTemplate(`
      <h2>You've been invited! 🎉</h2>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on HEKAX Phone as a <strong>${role}</strong>.</p>

      <div class="highlight-box">
        <p style="margin: 0; font-size: 14px;">HEKAX Phone is an AI-powered business phone system that never misses a call.</p>
      </div>

      <div style="text-align: center;">
        <a href="${inviteUrl}" class="button">Accept Invitation</a>
      </div>

      <p class="small-text" style="text-align: center;">This invitation expires in 7 days.</p>
    `, `${inviterName} invited you to join ${orgName}`),
    text: `
You've been invited!

${inviterName} has invited you to join ${orgName} on HEKAX Phone as a ${role}.

HEKAX Phone is an AI-powered business phone system that never misses a call.

Accept your invitation: ${inviteUrl}

This invitation expires in 7 days.

- The HEKAX Phone Team
    `.trim(),
  }),

  /**
   * Trial Ending Soon
   */
  trialEnding: ({ name, orgName, daysRemaining, upgradeUrl }) => ({
    subject: `Your HEKAX Phone trial ends in ${daysRemaining} days`,
    html: baseTemplate(`
      <h2>Your trial is ending soon</h2>
      <p>Hi ${name},</p>
      <p>Your free trial for <strong>${orgName}</strong> ends in <strong>${daysRemaining} days</strong>.</p>

      <div class="highlight-box">
        <p style="margin: 0; font-weight: 600; color: #1f2937;">Don't lose your AI receptionist!</p>
        <p style="margin: 8px 0 0; font-size: 14px;">Upgrade now to keep your phone number and all your leads.</p>
      </div>

      <div style="text-align: center;">
        <a href="${upgradeUrl}" class="button">Upgrade Now</a>
      </div>

      <h2>What You'll Get</h2>
      <ul class="feature-list">
        <li>Keep your phone number</li>
        <li>Unlimited AI receptionist availability</li>
        <li>All leads and call history preserved</li>
        <li>Priority support</li>
      </ul>

      <p class="small-text">Questions? Reply to this email or contact ${EMAIL_CONFIG.supportEmail}</p>
    `, `Only ${daysRemaining} days left in your trial`),
    text: `
Your trial is ending soon

Hi ${name},

Your free trial for ${orgName} ends in ${daysRemaining} days.

Don't lose your AI receptionist! Upgrade now to keep your phone number and all your leads.

Upgrade now: ${upgradeUrl}

Questions? Contact ${EMAIL_CONFIG.supportEmail}

- The HEKAX Phone Team
    `.trim(),
  }),
};

// ============================================================================
// EMAIL SERVICE CLASS
// ============================================================================

class EmailService {
  constructor() {
    this.isConfigured = !!(resend || sendgrid || sesClient);
    this.provider = activeProvider;
  }

  /**
   * Generate a verification token
   */
  generateVerificationToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Generate a 6-digit verification code
   */
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Get current provider info
   */
  getProviderInfo() {
    return {
      configured: this.isConfigured,
      provider: this.provider || "None",
    };
  }

  /**
   * Send an email
   */
  async send({ to, subject, html, text, replyTo }) {
    if (!this.isConfigured) {
      console.warn("⚠️ Email not configured, skipping:", subject);
      console.log("📧 Would send to:", to);
      console.log("📧 Subject:", subject);
      return { success: false, error: "Email service not configured" };
    }

    try {
      const emailData = {
        from: EMAIL_CONFIG.from,
        to,
        subject,
        html,
        text,
        reply_to: replyTo || EMAIL_CONFIG.replyTo,
      };

      if (resend) {
        // Use Resend
        const result = await resend.emails.send(emailData);
        console.log("✅ Email sent via Resend:", to, "|", subject);
        return { success: true, id: result.id, provider: "Resend" };
      } else if (sendgrid) {
        // Use SendGrid
        await sendgrid.send({
          to,
          from: EMAIL_CONFIG.from,
          replyTo: replyTo || EMAIL_CONFIG.replyTo,
          subject,
          html,
          text,
        });
        console.log("✅ Email sent via SendGrid:", to, "|", subject);
        return { success: true, provider: "SendGrid" };
      } else if (sesClient) {
        // Use AWS SES
        const { SendEmailCommand } = require("@aws-sdk/client-ses");

        // Parse "Name <email>" format
        const parseEmail = (emailStr) => {
          const match = emailStr.match(/^(.+)\s*<(.+)>$/);
          if (match) {
            return { name: match[1].trim(), email: match[2].trim() };
          }
          return { name: null, email: emailStr };
        };

        const fromParsed = parseEmail(EMAIL_CONFIG.from);

        const command = new SendEmailCommand({
          Source: EMAIL_CONFIG.from,
          Destination: {
            ToAddresses: Array.isArray(to) ? to : [to],
          },
          Message: {
            Subject: {
              Data: subject,
              Charset: "UTF-8",
            },
            Body: {
              Html: {
                Data: html,
                Charset: "UTF-8",
              },
              Text: {
                Data: text || subject,
                Charset: "UTF-8",
              },
            },
          },
          ReplyToAddresses: [replyTo || EMAIL_CONFIG.replyTo],
        });

        const result = await sesClient.send(command);
        console.log("✅ Email sent via AWS SES:", to, "|", subject, "| MessageId:", result.MessageId);
        return { success: true, id: result.MessageId, provider: "AWS SES" };
      }

      return { success: false, error: "No email provider available" };
    } catch (error) {
      console.error("❌ Email send error:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(user, verificationToken, verificationCode) {
    const verificationUrl = `${EMAIL_CONFIG.frontendUrl}/verify-email?token=${verificationToken}`;
    const template = templates.verification({
      name: user.name,
      verificationUrl,
      verificationCode,
    });

    return this.send({
      to: user.email,
      ...template,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(user, organization) {
    const loginUrl = `${EMAIL_CONFIG.frontendUrl}/login`;
    const template = templates.welcome({
      name: user.name,
      orgName: organization.name,
      loginUrl,
    });

    return this.send({
      to: user.email,
      ...template,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${EMAIL_CONFIG.frontendUrl}/reset-password?token=${resetToken}`;
    const template = templates.passwordReset({
      name: user.name,
      resetUrl,
      resetCode: resetToken.slice(0, 6).toUpperCase(),
    });

    return this.send({
      to: user.email,
      ...template,
    });
  }

  /**
   * Send team invitation email
   */
  async sendTeamInviteEmail({ inviterName, orgName, email, inviteToken, role }) {
    const inviteUrl = `${EMAIL_CONFIG.frontendUrl}/accept-invite?token=${inviteToken}`;
    const template = templates.teamInvite({
      inviterName,
      orgName,
      inviteUrl,
      role,
    });

    return this.send({
      to: email,
      ...template,
    });
  }

  /**
   * Send trial ending email
   */
  async sendTrialEndingEmail(user, organization, daysRemaining) {
    const upgradeUrl = `${EMAIL_CONFIG.frontendUrl}/billing`;
    const template = templates.trialEnding({
      name: user.name,
      orgName: organization.name,
      daysRemaining,
      upgradeUrl,
    });

    return this.send({
      to: user.email,
      ...template,
    });
  }
}

module.exports = {
  EmailService,
  emailService: new EmailService(),
  templates,
  EMAIL_CONFIG,
};
