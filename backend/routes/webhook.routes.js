// ============================================================================
// HEKAX Phone - Stripe Webhook Routes
// Phase 6.8: Add-On Purchases + Plan Management
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const stripeService = require("../services/stripe.service");
const alertsService = require("../services/alerts.service");
const twilioService = require("../services/twilio.service");

const router = express.Router();

// Plan limits configuration
const PLAN_LIMITS = {
  STARTER: {
    monthlyCallMinutes: 1000,
    monthlyAIMinutes: 300,
    maxUsers: 2,
    maxPhoneNumbers: 1,
    overageEnabled: false,
    overageCapCents: 2500,
  },
  BUSINESS_PRO: {
    monthlyCallMinutes: 4000,
    monthlyAIMinutes: 2000,
    maxUsers: 10,
    maxPhoneNumbers: 5,
    overageEnabled: true,
    overageCapCents: 15000,
  },
  SCALE: {
    monthlyCallMinutes: 8000,
    monthlyAIMinutes: 4000,
    maxUsers: 20,
    maxPhoneNumbers: 5,
    overageEnabled: true,
    overageCapCents: 25000,
  },
};

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events
 */
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("❌ STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).send("Webhook secret not configured");
  }

  let event;

  try {
    event = stripeService.constructWebhookEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("📨 Stripe webhook:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object);
        break;

      case "payment_intent.succeeded":
        // One-time payments (add-ons) - handled in checkout.session.completed
        console.log("💰 Payment intent succeeded:", event.data.object.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

/**
 * Handle checkout.session.completed
 * Handles both subscriptions and one-time add-on purchases
 */
async function handleCheckoutCompleted(session) {
  console.log("✅ Checkout completed:", session.id, "Mode:", session.mode);

  const organizationId = session.metadata?.organizationId;
  const customerId = session.customer;

  if (!organizationId) {
    console.error("No organizationId in checkout session metadata");
    return;
  }

  // SECURITY: Verify the organization exists and validate ownership
  // For new customers: org must exist with matching ID
  // For existing customers: org must own this Stripe customer
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, stripeCustomerId: true },
  });

  if (!org) {
    console.error("🚫 SECURITY: Organization not found for checkout:", organizationId);
    return;
  }

  // If org already has a different Stripe customer, reject
  if (org.stripeCustomerId && org.stripeCustomerId !== customerId) {
    console.error("🚫 SECURITY: Stripe customer mismatch for org:", organizationId);
    console.error(`   Expected: ${org.stripeCustomerId}, Got: ${customerId}`);
    return;
  }

  // Handle one-time payments (add-ons)
  if (session.mode === "payment") {
    await handleAddonPurchase(session);
    return;
  }

  // Handle subscription checkout
  const subscriptionId = session.subscription;

  // Determine plan from price ID
  const plan = determinePlanFromSession(session);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.STARTER;

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      plan: plan,
      status: "ACTIVE",
      // Set plan limits
      monthlyCallMinutes: limits.monthlyCallMinutes,
      monthlyAIMinutes: limits.monthlyAIMinutes,
      maxUsers: limits.maxUsers,
      maxPhoneNumbers: limits.maxPhoneNumbers,
      overageEnabled: limits.overageEnabled,
      overageCapCents: limits.overageCapCents,
      // Reset usage for new billing period
      usedCallMinutes: 0,
      usedAIMinutes: 0,
      overageUsedCents: 0,
      // Clear trial
      trialEndsAt: null,
      // Clear any grace period
      aiGraceStartedAt: null,
    },
  });

  // Dismiss trial alerts
  await alertsService.dismissAlertsByType(organizationId, alertsService.ALERT_TYPES.TRIAL_ENDING);
  await alertsService.dismissAlertsByType(organizationId, alertsService.ALERT_TYPES.TRIAL_ENDED);

  console.log(`✅ Organization upgraded to ${plan}:`, organizationId);

  // Purchase pending phone number if one was selected during trial/onboarding
  await purchasePendingPhoneNumber(organizationId);
}

/**
 * Purchase the pending phone number selected during trial
 */
async function purchasePendingPhoneNumber(organizationId) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { pendingPhoneNumber: true, _count: { select: { phoneNumbers: true } }, maxPhoneNumbers: true },
    });

    if (!org?.pendingPhoneNumber) {
      console.log("No pending phone number to purchase for org:", organizationId);
      return;
    }

    // Check if they still have phone number capacity
    if (org._count.phoneNumbers >= (org.maxPhoneNumbers || 1)) {
      console.log("Org has reached phone number limit, skipping pending number purchase");
      // Clear the pending number since we can't purchase it
      await prisma.organization.update({
        where: { id: organizationId },
        data: { pendingPhoneNumber: null },
      });
      return;
    }

    console.log(`📞 Purchasing pending phone number ${org.pendingPhoneNumber} for org:`, organizationId);

    const webhookBaseUrl = process.env.PUBLIC_BASE_URL || "https://phoneapi.hekax.com";

    // Purchase using org's subaccount via Twilio service
    const purchased = await twilioService.purchaseNumber(
      organizationId,
      org.pendingPhoneNumber,
      webhookBaseUrl
    );

    // Save to database
    const phoneNumber = await prisma.phoneNumber.create({
      data: {
        number: purchased.phoneNumber,
        friendlyName: purchased.friendlyName,
        twilioSid: purchased.sid,
        capabilities: purchased.capabilities,
        organizationId,
        routeToAI: true,
      },
    });

    // Set as primary number if this is the first
    const existingNumbers = await prisma.phoneNumber.count({
      where: { organizationId },
    });

    if (existingNumbers === 1) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          twilioNumber: purchased.phoneNumber,
          pendingPhoneNumber: null,
        },
      });
    } else {
      // Clear the pending number
      await prisma.organization.update({
        where: { id: organizationId },
        data: { pendingPhoneNumber: null },
      });
    }

    console.log(`✅ Pending phone number ${org.pendingPhoneNumber} purchased for org:`, organizationId);
  } catch (err) {
    console.error("❌ Failed to purchase pending phone number:", err.message);
    // Clear the pending number on failure so it doesn't keep trying
    try {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { pendingPhoneNumber: null },
      });
    } catch (e) {
      // Ignore
    }
    // Don't throw - this shouldn't block subscription activation
  }
}

/**
 * Handle add-on purchase from checkout session
 */
async function handleAddonPurchase(session) {
  const organizationId = session.metadata?.organizationId;
  const addonId = session.metadata?.addonId;
  const addonName = session.metadata?.addonName || "Add-on";
  const callMinutes = parseInt(session.metadata?.callMinutes || "0", 10);
  const aiMinutes = parseInt(session.metadata?.aiMinutes || "0", 10);

  if (!organizationId || !addonId) {
    console.error("Missing metadata for add-on purchase");
    return;
  }

  // SECURITY: Verify organization owns this Stripe customer
  const org = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      stripeCustomerId: session.customer,
    },
  });

  if (!org) {
    console.error("🚫 SECURITY: Add-on purchase customer mismatch for org:", organizationId);
    return;
  }

  // Determine add-on type
  let type = "BUNDLE";
  if (callMinutes > 0 && aiMinutes === 0) type = "CALL_MINUTES";
  else if (aiMinutes > 0 && callMinutes === 0) type = "AI_MINUTES";

  // Create add-on purchase record
  await prisma.addOnPurchase.create({
    data: {
      organizationId,
      type,
      productId: addonId,
      productName: addonName,
      callMinutes,
      aiMinutes,
      usedCallMinutes: 0,
      usedAiMinutes: 0,
      priceCents: session.amount_total || 0,
      stripePaymentId: session.payment_intent,
      status: "ACTIVE",
    },
  });

  // Update organization's add-on pool
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      addonCallMinutes: { increment: callMinutes },
      addonAIMinutes: { increment: aiMinutes },
    },
  });

  // Dismiss usage alerts if they now have minutes
  if (callMinutes > 0) {
    await alertsService.dismissAlertsByType(organizationId, "usage_warning_call_100");
  }
  if (aiMinutes > 0) {
    await alertsService.dismissAlertsByType(organizationId, "usage_warning_ai_100");
  }

  console.log(`✅ Add-on purchased for org ${organizationId}: +${callMinutes} call mins, +${aiMinutes} AI mins`);
}

/**
 * Determine plan from checkout session
 */
function determinePlanFromSession(session) {
  // Check subscription data or line items
  const priceId = session.subscription?.items?.data?.[0]?.price?.id || 
                  session.line_items?.data?.[0]?.price?.id;
  
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "STARTER";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS_PRO) return "BUSINESS_PRO";
  if (priceId === process.env.STRIPE_PRICE_SCALE) return "SCALE";
  
  // Default based on amount (fallback)
  const amount = session.amount_total || 0;
  if (amount >= 79900) return "SCALE";
  if (amount >= 49900) return "BUSINESS_PRO";
  return "STARTER";
}

/**
 * Handle customer.subscription.created
 */
async function handleSubscriptionCreated(subscription) {
  console.log("✅ Subscription created:", subscription.id);

  // Find org by customer ID
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: subscription.customer },
  });

  if (!org) {
    console.error("No organization found for customer:", subscription.customer);
    return;
  }

  // Determine plan from subscription
  const priceId = subscription.items?.data?.[0]?.price?.id;
  let plan = "STARTER";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS_PRO) plan = "BUSINESS_PRO";
  else if (priceId === process.env.STRIPE_PRICE_SCALE) plan = "SCALE";

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      stripeSubscriptionId: subscription.id,
      plan,
      status: subscription.status === "trialing" ? "TRIAL" : "ACTIVE",
      billingPeriodStart: new Date(subscription.current_period_start * 1000),
      billingPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
}

/**
 * Handle customer.subscription.updated
 */
async function handleSubscriptionUpdated(subscription) {
  console.log("📝 Subscription updated:", subscription.id, "Status:", subscription.status);

  const org = await prisma.organization.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!org) {
    console.error("No organization found for subscription:", subscription.id);
    return;
  }

  let status = "ACTIVE";
  if (subscription.status === "trialing") status = "TRIAL";
  else if (subscription.status === "past_due") status = "ACTIVE"; // Still active but payment issue
  else if (subscription.status === "canceled" || subscription.status === "unpaid") status = "SUSPENDED";

  // Check if plan changed
  const priceId = subscription.items?.data?.[0]?.price?.id;
  let plan = org.plan;
  let limits = null;
  
  if (priceId === process.env.STRIPE_PRICE_STARTER && org.plan !== "STARTER") {
    plan = "STARTER";
    limits = PLAN_LIMITS.STARTER;
  } else if (priceId === process.env.STRIPE_PRICE_BUSINESS_PRO && org.plan !== "BUSINESS_PRO") {
    plan = "BUSINESS_PRO";
    limits = PLAN_LIMITS.BUSINESS_PRO;
  } else if (priceId === process.env.STRIPE_PRICE_SCALE && org.plan !== "SCALE") {
    plan = "SCALE";
    limits = PLAN_LIMITS.SCALE;
  }

  const updateData = {
    status,
    plan,
    billingPeriodStart: new Date(subscription.current_period_start * 1000),
    billingPeriodEnd: new Date(subscription.current_period_end * 1000),
  };

  // Update limits if plan changed
  if (limits) {
    updateData.monthlyCallMinutes = limits.monthlyCallMinutes;
    updateData.monthlyAIMinutes = limits.monthlyAIMinutes;
    updateData.maxUsers = limits.maxUsers;
    updateData.maxPhoneNumbers = limits.maxPhoneNumbers;
    updateData.overageEnabled = limits.overageEnabled;
    updateData.overageCapCents = limits.overageCapCents;
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: updateData,
  });

  // Reset usage at start of new billing period
  if (subscription.status === "active") {
    const periodStart = new Date(subscription.current_period_start * 1000);
    const lastReset = org.usageResetAt;

    if (!lastReset || periodStart > lastReset) {
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          usedCallMinutes: 0,
          usedAIMinutes: 0,
          overageUsedCents: 0,
          usageResetAt: periodStart,
          aiGraceStartedAt: null,
          // Note: We don't reset add-on pools - they persist across billing periods
        },
      });
      console.log("📊 Usage reset for new billing period:", org.id);
    }
  }
}

/**
 * Handle customer.subscription.deleted
 */
async function handleSubscriptionDeleted(subscription) {
  console.log("🗑️ Subscription deleted:", subscription.id);

  const org = await prisma.organization.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!org) return;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      status: "CANCELLED",
      stripeSubscriptionId: null,
    },
  });

  console.log("❌ Organization subscription cancelled:", org.id);
}

/**
 * Handle invoice.paid
 */
async function handleInvoicePaid(invoice) {
  console.log("💰 Invoice paid:", invoice.id, "Amount:", invoice.amount_paid / 100);

  // Create invoice record
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: invoice.customer },
  });

  if (!org) return;

  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: "paid",
      paidAt: new Date(),
      periodStart: new Date(invoice.period_start * 1000),
      periodEnd: new Date(invoice.period_end * 1000),
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url,
    },
  });

  // Dismiss payment failed alerts
  await alertsService.dismissAlertsByType(org.id, alertsService.ALERT_TYPES.PAYMENT_FAILED);
}

/**
 * Handle invoice.payment_failed
 */
async function handleInvoicePaymentFailed(invoice) {
  console.log("❌ Invoice payment failed:", invoice.id);

  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: invoice.customer },
  });

  if (!org) return;

  await alertsService.createAlert(org.id, alertsService.ALERT_TYPES.PAYMENT_FAILED);

  // Update org status
  await prisma.organization.update({
    where: { id: org.id },
    data: { status: "ACTIVE" }, // Keep active but payment issue
  });
}

/**
 * Handle customer.subscription.trial_will_end
 */
async function handleTrialWillEnd(subscription) {
  console.log("⏰ Trial will end:", subscription.id);

  const org = await prisma.organization.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!org) return;

  await alertsService.createAlert(org.id, alertsService.ALERT_TYPES.TRIAL_ENDING, {
    days: 3,
  });
}

module.exports = router;
