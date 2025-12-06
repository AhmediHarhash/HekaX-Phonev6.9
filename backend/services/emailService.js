/**
 * Email Service using AWS SES
 *
 * Environment Variables Required:
 * - AWS_REGION: AWS region (e.g., us-east-1)
 * - AWS_ACCESS_KEY_ID: AWS access key
 * - AWS_SECRET_ACCESS_KEY: AWS secret key
 * - SES_FROM_EMAIL: Verified sender email address
 */

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Initialize SES client
const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || "noreply@hekax.com";

/**
 * Send an email using AWS SES
 * @param {Object} options - Email options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text body (optional)
 * @param {string} [options.from] - From email (optional, uses default)
 * @param {string[]} [options.cc] - CC recipients (optional)
 * @param {string[]} [options.bcc] - BCC recipients (optional)
 * @param {string} [options.replyTo] - Reply-to email (optional)
 * @returns {Promise<Object>} - Send result with messageId
 */
async function sendEmail({ to, subject, html, text, from, cc, bcc, replyTo }) {
  const toAddresses = Array.isArray(to) ? to : [to];

  const params = {
    Source: from || FROM_EMAIL,
    Destination: {
      ToAddresses: toAddresses,
      ...(cc && { CcAddresses: Array.isArray(cc) ? cc : [cc] }),
      ...(bcc && { BccAddresses: Array.isArray(bcc) ? bcc : [bcc] }),
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
        ...(text && {
          Text: {
            Data: text,
            Charset: "UTF-8",
          },
        }),
      },
    },
    ...(replyTo && { ReplyToAddresses: [replyTo] }),
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await sesClient.send(command);

    console.log(`Email sent successfully to ${toAddresses.join(", ")}. MessageId: ${result.MessageId}`);

    return {
      success: true,
      messageId: result.MessageId,
      provider: "AWS SES",
    };
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  }
}

/**
 * Send verification email with code
 */
async function sendVerificationEmail({ to, name, code }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="margin-top: 0; color: #1a1a1a;">Verify Your Email</h2>
          <p>Hi ${name},</p>
          <p>Welcome to HEKAX Phone! Please use the following code to verify your email address:</p>
          <div style="text-align: center; margin: 32px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; background: #f3f4f6; padding: 16px 32px; border-radius: 8px; display: inline-block;">
              ${code}
            </span>
          </div>
          <p>This code expires in 24 hours.</p>
          <p style="color: #666; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
        <div style="text-align: center; color: #666; font-size: 12px; margin-top: 32px;">
          <p>HEKAX Phone - AI-Powered Business Phone System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Verify Your Email

Hi ${name},

Welcome to HEKAX Phone! Please use the following code to verify your email:

${code}

This code expires in 24 hours.

If you didn't create an account, you can safely ignore this email.
  `;

  return sendEmail({
    to,
    subject: "Verify Your Email - HEKAX Phone",
    html,
    text,
  });
}

/**
 * Send team invitation email
 */
async function sendTeamInviteEmail({ to, inviterName, organizationName, role, inviteLink }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Team Invitation</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="margin-top: 0; color: #1a1a1a;">Team Invitation</h2>
          <p>${inviterName} has invited you to join <strong>${organizationName}</strong> on HEKAX Phone as a <strong>${role}</strong>.</p>
          <p style="margin: 32px 0;">
            <a href="${inviteLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Accept Invitation</a>
          </p>
          <p>This invitation expires in 7 days.</p>
          <p style="color: #666; font-size: 14px;">If you don't recognize this invitation, you can safely ignore this email.</p>
        </div>
        <div style="text-align: center; color: #666; font-size: 12px; margin-top: 32px;">
          <p>HEKAX Phone - AI-Powered Business Phone System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Team Invitation

${inviterName} has invited you to join ${organizationName} on HEKAX Phone as a ${role}.

Click the link below to accept:
${inviteLink}

This invitation expires in 7 days.

If you don't recognize this invitation, you can safely ignore this email.
  `;

  return sendEmail({
    to,
    subject: `You've been invited to join ${organizationName} on HEKAX Phone`,
    html,
    text,
  });
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail({ to, name, resetLink }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="margin-top: 0; color: #1a1a1a;">Reset Your Password</h2>
          <p>Hi ${name},</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <p style="margin: 32px 0;">
            <a href="${resetLink}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Reset Password</a>
          </p>
          <p>This link expires in 1 hour.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
        </div>
        <div style="text-align: center; color: #666; font-size: 12px; margin-top: 32px;">
          <p>HEKAX Phone - AI-Powered Business Phone System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Reset Your Password

Hi ${name},

We received a request to reset your password. Click the link below:
${resetLink}

This link expires in 1 hour.

If you didn't request this, please ignore this email.
  `;

  return sendEmail({
    to,
    subject: "Reset Your Password - HEKAX Phone",
    html,
    text,
  });
}

/**
 * Check if email service is configured
 */
function isConfigured() {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.SES_FROM_EMAIL
  );
}

/**
 * Get service status
 */
function getStatus() {
  return {
    provider: "AWS SES",
    configured: isConfigured(),
    region: process.env.AWS_REGION || "us-east-1",
    fromEmail: process.env.SES_FROM_EMAIL || "not set",
  };
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendTeamInviteEmail,
  sendPasswordResetEmail,
  isConfigured,
  getStatus,
};
