# Billing and Subscription System

**Stripe Integration and Usage Metering Documentation**

Version 2.0 | Last Updated: December 2024

---

## Overview

HEKAX Phone uses Stripe for subscription management, payment processing, and usage-based metering. The system supports tiered plans with monthly/annual billing and add-on minute packs.

---

## Subscription Plans

### Plan Tiers

| Plan | Monthly | Annual | Target |
|------|---------|--------|--------|
| STARTER | $29 | $290 | Solo entrepreneurs |
| BUSINESS_PRO | $79 | $790 | Small teams |
| SCALE | $199 | $1990 | Growing businesses |
| ENTERPRISE | Custom | Custom | Large organizations |

### Plan Features

```
STARTER ($29/month)
├── 500 call minutes
├── 100 AI minutes
├── 1 phone number
├── 2 team members
├── Basic call handling
├── Lead capture
└── Email support

BUSINESS_PRO ($79/month)
├── 2,000 call minutes
├── 500 AI minutes
├── 3 phone numbers
├── 5 team members
├── AI receptionist with barge-in
├── CRM integrations
├── Calendar integrations
├── Call recording
└── Priority support

SCALE ($199/month)
├── 5,000 call minutes
├── 2,000 AI minutes
├── 10 phone numbers
├── Unlimited team members
├── All BUSINESS_PRO features
├── Custom AI training
├── API access
├── Webhook integrations
└── Dedicated support

ENTERPRISE (Custom)
├── Unlimited minutes
├── Unlimited numbers
├── Unlimited team
├── All SCALE features
├── SLA guarantee
├── Custom integrations
├── Dedicated account manager
└── On-premise option
```

---

## Stripe Integration Architecture

```
                    Billing Architecture

    Frontend                  Backend                    Stripe
       |                         |                         |
       |  1. Select plan         |                         |
       |------------------------>|                         |
       |                         |                         |
       |                         |  2. Create checkout     |
       |                         |------------------------>|
       |                         |                         |
       |                         |  3. Session URL         |
       |                         |<------------------------|
       |                         |                         |
       |  4. Redirect to Stripe  |                         |
       |-------------------------------------------------->|
       |                         |                         |
       |                         |                    5. Customer
       |                         |                       pays
       |                         |                         |
       |                         |  6. Webhook:            |
       |                         |  checkout.session       |
       |                         |  .completed             |
       |                         |<------------------------|
       |                         |                         |
       |                         |  7. Create subscription |
       |                         |  in database            |
       |                         |                         |
       |  8. Redirect success    |                         |
       |<--------------------------------------------------|
```

---

## Stripe Configuration

### Environment Variables

```
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

### Price Configuration

Prices are configured in Stripe Dashboard with lookup keys:

| Lookup Key | Plan | Interval |
|------------|------|----------|
| starter_monthly | STARTER | month |
| starter_annual | STARTER | year |
| business_pro_monthly | BUSINESS_PRO | month |
| business_pro_annual | BUSINESS_PRO | year |
| scale_monthly | SCALE | month |
| scale_annual | SCALE | year |

### Product Structure

```
Products in Stripe:
├── HEKAX Phone - Starter
│   ├── Price: starter_monthly ($29/month)
│   └── Price: starter_annual ($290/year)
├── HEKAX Phone - Business Pro
│   ├── Price: business_pro_monthly ($79/month)
│   └── Price: business_pro_annual ($790/year)
├── HEKAX Phone - Scale
│   ├── Price: scale_monthly ($199/month)
│   └── Price: scale_annual ($1990/year)
└── Add-on Packs
    ├── 500 Minutes Pack ($49)
    ├── 1000 Minutes Pack ($89)
    └── 2500 Minutes Pack ($199)
```

---

## Checkout Flow

### Creating Checkout Session

```javascript
router.post('/create-checkout', authMiddleware, async (req, res) => {
  const { priceId, interval } = req.body;

  // Get or create Stripe customer
  let stripeCustomerId = req.org.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: req.user.email,
      name: req.org.name,
      metadata: {
        organizationId: req.organizationId,
      },
    });
    stripeCustomerId = customer.id;

    await prisma.organization.update({
      where: { id: req.organizationId },
      data: { stripeCustomerId },
    });
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    success_url: `${FRONTEND_URL}/billing?success=true`,
    cancel_url: `${FRONTEND_URL}/billing?canceled=true`,
    metadata: {
      organizationId: req.organizationId,
    },
    subscription_data: {
      metadata: {
        organizationId: req.organizationId,
      },
    },
  });

  res.json({ url: session.url });
});
```

---

## Webhook Handling

### Webhook Endpoint

```javascript
router.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
    }

    res.json({ received: true });
  }
);
```

### Event Handlers

```javascript
async function handleCheckoutComplete(session) {
  const orgId = session.metadata.organizationId;
  const subscription = await stripe.subscriptions.retrieve(
    session.subscription
  );

  const priceId = subscription.items.data[0].price.id;
  const price = await stripe.prices.retrieve(priceId);
  const plan = price.lookup_key?.split('_')[0]?.toUpperCase() || 'STARTER';

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      plan,
      status: 'ACTIVE',
      stripeSubscriptionId: subscription.id,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  // Reset usage counters for new billing period
  await resetUsageCounters(orgId);
}

async function handleSubscriptionCanceled(subscription) {
  const org = await prisma.organization.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (org) {
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        plan: 'CANCELLED',
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });
  }
}

async function handlePaymentFailed(invoice) {
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: invoice.customer },
  });

  if (org) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { status: 'PAST_DUE' },
    });

    // Send notification email
    await sendPaymentFailedEmail(org);
  }
}
```

---

## Usage Metering

### Tracked Metrics

| Metric | Unit | Calculation |
|--------|------|-------------|
| Call Minutes | Minutes | ceil(call duration / 60) |
| AI Minutes | Minutes | ceil(AI handling time / 60) |
| Phone Numbers | Count | Active numbers |
| Team Members | Count | Active users |

### Usage Recording

```javascript
async function recordCallUsage(call) {
  const durationMinutes = Math.ceil(call.duration / 60);

  // Update organization usage
  await prisma.organization.update({
    where: { id: call.organizationId },
    data: {
      callMinutesUsed: { increment: durationMinutes },
      ...(call.aiHandled && {
        aiMinutesUsed: { increment: durationMinutes },
      }),
    },
  });

  // Check if over limit
  const org = await prisma.organization.findUnique({
    where: { id: call.organizationId },
  });

  const limits = PLAN_LIMITS[org.plan];

  if (org.callMinutesUsed >= limits.callMinutes) {
    await sendUsageLimitEmail(org, 'callMinutes');
  }
}
```

### Plan Limits

```javascript
const PLAN_LIMITS = {
  TRIAL: {
    callMinutes: 200,
    aiMinutes: 100,
    phoneNumbers: 1,
    teamMembers: 2,
  },
  STARTER: {
    callMinutes: 500,
    aiMinutes: 100,
    phoneNumbers: 1,
    teamMembers: 2,
  },
  BUSINESS_PRO: {
    callMinutes: 2000,
    aiMinutes: 500,
    phoneNumbers: 3,
    teamMembers: 5,
  },
  SCALE: {
    callMinutes: 5000,
    aiMinutes: 2000,
    phoneNumbers: 10,
    teamMembers: null,  // Unlimited
  },
  ENTERPRISE: {
    callMinutes: null,  // Unlimited
    aiMinutes: null,    // Unlimited
    phoneNumbers: null, // Unlimited
    teamMembers: null,  // Unlimited
  },
};
```

### Usage API

```javascript
router.get('/usage', authMiddleware, async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.organizationId },
    include: {
      _count: {
        select: {
          users: true,
          phoneNumbers: true,
        },
      },
    },
  });

  const limits = PLAN_LIMITS[org.plan];

  res.json({
    plan: org.plan,
    callMinutes: {
      used: org.callMinutesUsed,
      limit: limits.callMinutes,
      percent: limits.callMinutes
        ? Math.round((org.callMinutesUsed / limits.callMinutes) * 100)
        : 0,
    },
    aiMinutes: {
      used: org.aiMinutesUsed,
      limit: limits.aiMinutes,
      percent: limits.aiMinutes
        ? Math.round((org.aiMinutesUsed / limits.aiMinutes) * 100)
        : 0,
    },
    users: {
      current: org._count.users,
      limit: limits.teamMembers,
    },
    phoneNumbers: {
      current: org._count.phoneNumbers,
      limit: limits.phoneNumbers,
    },
    resetsAt: org.currentPeriodEnd,
  });
});
```

---

## Add-on Packs

### One-time Minute Purchases

```javascript
router.post('/purchase-addon', authMiddleware, async (req, res) => {
  const { addonId } = req.body;

  const ADDONS = {
    minutes_500: { minutes: 500, price: 4900 },   // $49
    minutes_1000: { minutes: 1000, price: 8900 }, // $89
    minutes_2500: { minutes: 2500, price: 19900 }, // $199
  };

  const addon = ADDONS[addonId];
  if (!addon) {
    return res.status(400).json({ error: 'Invalid addon' });
  }

  // Create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: addon.price,
    currency: 'usd',
    customer: req.org.stripeCustomerId,
    metadata: {
      organizationId: req.organizationId,
      addonId,
      minutes: addon.minutes,
    },
  });

  res.json({
    clientSecret: paymentIntent.client_secret,
  });
});
```

### Crediting Minutes

```javascript
async function handleAddonPurchase(paymentIntent) {
  const { organizationId, minutes } = paymentIntent.metadata;

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      addonMinutes: { increment: parseInt(minutes) },
    },
  });

  // Record purchase
  await prisma.addonPurchase.create({
    data: {
      organizationId,
      type: 'MINUTES',
      quantity: parseInt(minutes),
      amount: paymentIntent.amount,
      stripePaymentIntentId: paymentIntent.id,
    },
  });
}
```

---

## Billing Portal

### Customer Portal Access

```javascript
router.post('/create-portal-session', authMiddleware, async (req, res) => {
  if (!req.org.stripeCustomerId) {
    return res.status(400).json({ error: 'No billing account' });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: req.org.stripeCustomerId,
    return_url: `${FRONTEND_URL}/billing`,
  });

  res.json({ url: session.url });
});
```

### Portal Capabilities

- View invoices and payment history
- Update payment method
- Cancel subscription
- Change plan (upgrade/downgrade)
- Update billing email

---

## Subscription Lifecycle

### State Machine

```
                    Subscription States

    +-------+     payment      +---------+
    | TRIAL |----------------->|  ACTIVE |
    +-------+                  +----+----+
                                    |
                         +----------+-----------+
                         |                      |
                    payment               cancel request
                    failed                      |
                         |                      v
                    +----v----+          +------+------+
                    |PAST_DUE |          | CANCELLING  |
                    +----+----+          +------+------+
                         |                      |
              +----------+----------+     period ends
              |                     |           |
         payment              grace period      v
         recovered            expires     +-----+-----+
              |                     |     | CANCELLED |
              v                     v     +-----------+
         +---------+         +----------+
         | ACTIVE  |         |SUSPENDED |
         +---------+         +----------+
```

### Grace Period Handling

```javascript
// Check for past due subscriptions daily
async function checkPastDueSubscriptions() {
  const gracePeriodDays = 7;

  const pastDueOrgs = await prisma.organization.findMany({
    where: {
      status: 'PAST_DUE',
      statusChangedAt: {
        lt: new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000),
      },
    },
  });

  for (const org of pastDueOrgs) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { status: 'SUSPENDED' },
    });

    // Cancel Stripe subscription
    if (org.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(org.stripeSubscriptionId);
    }

    // Notify user
    await sendSuspensionEmail(org);
  }
}
```

---

## Invoicing

### Invoice Events

| Event | Action |
|-------|--------|
| `invoice.created` | Log upcoming charge |
| `invoice.paid` | Update status, reset usage |
| `invoice.payment_failed` | Mark past due, notify |
| `invoice.upcoming` | Send reminder email |

### Invoice History API

```javascript
router.get('/invoices', authMiddleware, async (req, res) => {
  if (!req.org.stripeCustomerId) {
    return res.json({ invoices: [] });
  }

  const invoices = await stripe.invoices.list({
    customer: req.org.stripeCustomerId,
    limit: 12,
  });

  res.json({
    invoices: invoices.data.map(inv => ({
      id: inv.id,
      number: inv.number,
      amount: inv.amount_paid / 100,
      status: inv.status,
      date: new Date(inv.created * 1000),
      pdfUrl: inv.invoice_pdf,
    })),
  });
});
```

---

## Testing

### Test Mode

Use Stripe test keys for development:

```
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
```

### Test Cards

| Card Number | Result |
|-------------|--------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Decline |
| 4000 0000 0000 3220 | 3D Secure |

### Webhook Testing

```bash
# Use Stripe CLI for local testing
stripe listen --forward-to localhost:3000/webhooks/stripe
```

---

## Security Considerations

1. **Never store card details**: Use Stripe Checkout or Elements
2. **Verify webhook signatures**: Always validate stripe-signature header
3. **Idempotency**: Handle duplicate webhook events gracefully
4. **PCI Compliance**: Stripe handles all card data

---

*This document is updated when billing features change.*
