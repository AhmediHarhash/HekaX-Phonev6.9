# Email Service

**Multi-Provider Transactional Email System**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone uses a multi-provider email service for transactional emails including user invitations, verification codes, password resets, and system notifications. The service supports automatic provider fallback for maximum deliverability.

---

## Provider Stack

| Provider | Priority | Cost | Best For |
|----------|----------|------|----------|
| Resend | 1 (Primary) | $20/10K emails | Developer experience, modern API |
| SendGrid | 2 (Backup) | $15/40K emails | High volume, analytics |
| AWS SES | 3 (Fallback) | $0.10/1K emails | Enterprise scale, cost efficiency |

---

## Architecture

```
                    Email Service Architecture

    Application                 Email Service                   Providers
        |                            |                              |
        |   sendEmail()              |                              |
        |--------------------------->|                              |
        |                            |                              |
        |                            |   Check Active Provider      |
        |                            |                              |
        |                            |   Try Primary (Resend)       |
        |                            |----------------------------->|
        |                            |                              |
        |                            |   (If fails)                 |
        |                            |                              |
        |                            |   Try Backup (SendGrid)      |
        |                            |----------------------------->|
        |                            |                              |
        |                            |   (If fails)                 |
        |                            |                              |
        |                            |   Try Fallback (AWS SES)     |
        |                            |----------------------------->|
        |                            |                              |
        |   Success/Failure          |                              |
        |<---------------------------|                              |
```

---

## Provider Configuration

### Environment Variables

```bash
# Resend (Primary)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# SendGrid (Backup)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx

# AWS SES (Fallback)
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Common
EMAIL_FROM_ADDRESS=noreply@hekax.com
EMAIL_FROM_NAME=HEKAX Phone
```

### Provider Priority

```javascript
// Provider initialization order
const initializeProviders = () => {
  // Priority 1: Resend
  if (process.env.RESEND_API_KEY) {
    return { provider: 'Resend', client: new Resend(process.env.RESEND_API_KEY) };
  }

  // Priority 2: SendGrid
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return { provider: 'SendGrid', client: sgMail };
  }

  // Priority 3: AWS SES
  if (process.env.AWS_SES_REGION || process.env.AWS_ACCESS_KEY_ID) {
    const sesClient = new SESClient({
      region: process.env.AWS_SES_REGION || 'us-east-1',
      credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      } : undefined,
    });
    return { provider: 'AWS SES', client: sesClient };
  }

  // Fallback: Console logging (development)
  return { provider: 'Console', client: null };
};
```

---

## Email Types

### System Emails

| Email Type | Trigger | Priority |
|------------|---------|----------|
| Verification Code | User signup | High |
| Password Reset | Forgot password request | High |
| Team Invitation | Admin invites user | High |
| Welcome Email | After verification | Medium |
| Usage Alert | 80%/90%/100% usage | Medium |
| Payment Failed | Subscription payment fails | High |
| Plan Changed | Subscription update | Low |

### Transactional Email Templates

```
Email Templates
├── Authentication
│   ├── verification-code.html
│   ├── password-reset.html
│   └── welcome.html
│
├── Team
│   ├── team-invite.html
│   └── role-changed.html
│
├── Billing
│   ├── payment-failed.html
│   ├── payment-successful.html
│   ├── plan-upgraded.html
│   └── plan-downgraded.html
│
├── Usage
│   ├── usage-warning-80.html
│   ├── usage-warning-90.html
│   └── usage-limit-reached.html
│
└── Notifications
    ├── new-lead.html
    ├── missed-call.html
    └── daily-summary.html
```

---

## Implementation

### Core Email Service

```javascript
// Email service interface
const emailService = {
  // Current active provider
  activeProvider: null,

  // Initialize on startup
  initialize() {
    const { provider, client } = initializeProviders();
    this.activeProvider = provider;
    this.client = client;
    console.log(`Email service initialized with: ${provider}`);
  },

  // Send email
  async send({ to, subject, html, text, from }) {
    const sender = from || {
      email: process.env.EMAIL_FROM_ADDRESS || 'noreply@hekax.com',
      name: process.env.EMAIL_FROM_NAME || 'HEKAX Phone',
    };

    try {
      switch (this.activeProvider) {
        case 'Resend':
          return await this.sendViaResend({ to, subject, html, text, sender });
        case 'SendGrid':
          return await this.sendViaSendGrid({ to, subject, html, text, sender });
        case 'AWS SES':
          return await this.sendViaSES({ to, subject, html, text, sender });
        default:
          console.log('Email (console):', { to, subject });
          return { success: true, provider: 'Console' };
      }
    } catch (error) {
      console.error(`Email send failed via ${this.activeProvider}:`, error);
      throw error;
    }
  },

  // Get provider info
  getProviderInfo() {
    return {
      provider: this.activeProvider,
      configured: this.activeProvider !== 'Console',
    };
  },
};
```

### Provider-Specific Implementations

```javascript
// Resend implementation
async sendViaResend({ to, subject, html, text, sender }) {
  const result = await this.client.emails.send({
    from: `${sender.name} <${sender.email}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  });

  return { success: true, messageId: result.id, provider: 'Resend' };
}

// SendGrid implementation
async sendViaSendGrid({ to, subject, html, text, sender }) {
  await this.client.send({
    to: Array.isArray(to) ? to : [to],
    from: { email: sender.email, name: sender.name },
    subject,
    html,
    text,
  });

  return { success: true, provider: 'SendGrid' };
}

// AWS SES implementation
async sendViaSES({ to, subject, html, text, sender }) {
  const command = new SendEmailCommand({
    Source: `${sender.name} <${sender.email}>`,
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to],
    },
    Message: {
      Subject: { Data: subject },
      Body: {
        Html: { Data: html },
        Text: { Data: text },
      },
    },
  });

  const result = await this.client.send(command);

  return { success: true, messageId: result.MessageId, provider: 'AWS SES' };
}
```

---

## Email Templates

### Template Structure

```html
<!-- Base template structure -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{subject}}</title>
  <style>
    /* Inline CSS for email client compatibility */
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .button {
      display: inline-block;
      background: #3b82f6;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 500;
    }
    .footer {
      text-align: center;
      color: #666;
      font-size: 12px;
      margin-top: 32px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      {{content}}
    </div>
    <div class="footer">
      <p>HEKAX Phone - AI-Powered Business Phone System</p>
      <p>This is an automated message. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
```

### Email Content Examples

#### Verification Code

```javascript
const verificationEmail = (code, userName) => ({
  subject: 'Verify Your Email - HEKAX Phone',
  html: `
    <h2>Verify Your Email</h2>
    <p>Hi ${userName},</p>
    <p>Welcome to HEKAX Phone! Please use the following code to verify your email address:</p>
    <div style="text-align: center; margin: 32px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px;
                   background: #f3f4f6; padding: 16px 32px; border-radius: 8px;">
        ${code}
      </span>
    </div>
    <p>This code expires in 24 hours.</p>
    <p>If you didn't create an account, you can safely ignore this email.</p>
  `,
  text: `
    Verify Your Email

    Hi ${userName},

    Welcome to HEKAX Phone! Please use the following code to verify your email:

    ${code}

    This code expires in 24 hours.

    If you didn't create an account, you can safely ignore this email.
  `,
});
```

#### Team Invitation

```javascript
const teamInviteEmail = (inviterName, orgName, inviteLink, role) => ({
  subject: `You've been invited to join ${orgName} on HEKAX Phone`,
  html: `
    <h2>Team Invitation</h2>
    <p>${inviterName} has invited you to join <strong>${orgName}</strong> on HEKAX Phone as a <strong>${role}</strong>.</p>
    <p style="margin: 32px 0;">
      <a href="${inviteLink}" class="button">Accept Invitation</a>
    </p>
    <p>This invitation expires in 7 days.</p>
    <p style="color: #666; font-size: 14px;">
      If you don't recognize this invitation, you can safely ignore this email.
    </p>
  `,
  text: `
    Team Invitation

    ${inviterName} has invited you to join ${orgName} on HEKAX Phone as a ${role}.

    Click the link below to accept:
    ${inviteLink}

    This invitation expires in 7 days.
  `,
});
```

#### Password Reset

```javascript
const passwordResetEmail = (resetLink, userName) => ({
  subject: 'Reset Your Password - HEKAX Phone',
  html: `
    <h2>Reset Your Password</h2>
    <p>Hi ${userName},</p>
    <p>We received a request to reset your password. Click the button below to create a new password:</p>
    <p style="margin: 32px 0;">
      <a href="${resetLink}" class="button">Reset Password</a>
    </p>
    <p>This link expires in 1 hour.</p>
    <p style="color: #666; font-size: 14px;">
      If you didn't request a password reset, please ignore this email or contact support if you have concerns.
    </p>
  `,
  text: `
    Reset Your Password

    Hi ${userName},

    We received a request to reset your password. Click the link below:
    ${resetLink}

    This link expires in 1 hour.

    If you didn't request this, please ignore this email.
  `,
});
```

---

## Usage Examples

### Sending Verification Email

```javascript
const { sendVerificationEmail } = require('./services/email');

// During signup
await sendVerificationEmail({
  to: user.email,
  name: user.name,
  code: verificationCode,
});
```

### Sending Team Invite

```javascript
const { sendTeamInvite } = require('./services/email');

// When admin invites team member
await sendTeamInvite({
  to: inviteeEmail,
  inviterName: admin.name,
  organizationName: org.name,
  role: 'AGENT',
  inviteToken: token,
});
```

### Sending Usage Alert

```javascript
const { sendUsageAlert } = require('./services/email');

// When usage reaches threshold
await sendUsageAlert({
  to: owner.email,
  organizationName: org.name,
  usageType: 'AI Minutes',
  usedAmount: 450,
  limitAmount: 500,
  percentage: 90,
});
```

---

## Provider Comparison

### Resend

| Feature | Details |
|---------|---------|
| Pricing | $20/month for 10,000 emails |
| API | Modern REST API, React Email support |
| Analytics | Basic delivery stats |
| Best For | Developer teams, modern stacks |
| Setup | 5 minutes |

### SendGrid

| Feature | Details |
|---------|---------|
| Pricing | $15/month for 40,000 emails |
| API | REST API, SMTP relay |
| Analytics | Detailed engagement metrics |
| Best For | High volume, marketing integration |
| Setup | 15 minutes |

### AWS SES

| Feature | Details |
|---------|---------|
| Pricing | $0.10 per 1,000 emails |
| API | AWS SDK |
| Analytics | CloudWatch metrics |
| Best For | Enterprise scale, cost efficiency |
| Setup | 30 minutes (with sandbox exit) |

---

## AWS SES Setup

### 1. Verify Domain

```bash
# Add DNS records for domain verification
# TXT record: _amazonses.yourdomain.com
# DKIM records (3 CNAME records)
```

### 2. Request Production Access

```
AWS Console > SES > Account Dashboard > Request production access
- Provide use case description
- Expected volume
- Complaint handling procedures
```

### 3. Configure Sending Identity

```javascript
// Verify email identity programmatically
const command = new VerifyEmailIdentityCommand({
  EmailAddress: 'noreply@yourdomain.com',
});
await sesClient.send(command);
```

### 4. Set Up Bounce/Complaint Handling

```javascript
// SNS topic for bounce notifications
const createTopic = new CreateTopicCommand({
  Name: 'ses-bounces',
});
const topicArn = await snsClient.send(createTopic);

// Subscribe to bounce notifications
await sesClient.send(new SetIdentityNotificationTopicCommand({
  Identity: 'yourdomain.com',
  NotificationType: 'Bounce',
  SnsTopic: topicArn,
}));
```

---

## Deliverability Best Practices

### 1. Authentication

```
Required DNS Records:
├── SPF: v=spf1 include:amazonses.com include:sendgrid.net -all
├── DKIM: Configured per provider
├── DMARC: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com
└── Return-Path: Aligned with From domain
```

### 2. Content Guidelines

- Avoid spam trigger words
- Maintain text/HTML ratio
- Include unsubscribe links (for marketing)
- Use consistent From address
- Personalize content

### 3. List Hygiene

```javascript
// Handle bounces
async function handleBounce(email, bounceType) {
  if (bounceType === 'Permanent') {
    // Mark email as invalid
    await prisma.user.update({
      where: { email },
      data: { emailBounced: true },
    });
  }
}

// Handle complaints
async function handleComplaint(email) {
  // Suppress email
  await prisma.emailSuppression.create({
    data: { email, reason: 'COMPLAINT' },
  });
}
```

---

## Monitoring and Logging

### Email Logs

```javascript
// Log all email sends
async function logEmailSend(params, result) {
  await prisma.emailLog.create({
    data: {
      to: params.to,
      subject: params.subject,
      provider: result.provider,
      messageId: result.messageId,
      status: result.success ? 'SENT' : 'FAILED',
      error: result.error,
      sentAt: new Date(),
    },
  });
}
```

### Metrics to Track

| Metric | Target | Action if Below |
|--------|--------|-----------------|
| Delivery Rate | > 98% | Check bounce rates |
| Open Rate | > 20% | Improve subject lines |
| Bounce Rate | < 2% | Clean email list |
| Complaint Rate | < 0.1% | Review content, frequency |

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Emails not arriving | Spam folder | Check SPF/DKIM/DMARC |
| Rate limiting | Too many requests | Implement queuing |
| Sandbox mode (SES) | New account | Request production access |
| Invalid sender | Unverified domain | Verify domain in provider |

### Debug Mode

```javascript
// Enable email debugging
if (process.env.EMAIL_DEBUG === 'true') {
  console.log('Email Debug:', {
    to,
    subject,
    provider: emailService.activeProvider,
    html: html.substring(0, 200) + '...',
  });
}
```

---

*This document is updated when email configuration changes.*
