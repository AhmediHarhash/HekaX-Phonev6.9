// ============================================================================
// HEKAX Phone - Billing Routes
// Phase 6.8: Add-On Purchases + Overage Settings
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const stripeService = require("../services/stripe.service");
const alertsService = require("../services/alerts.service");

const router = express.Router();

/**
 * GET /api/billing
 * Get billing overview for organization
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: {
        id: true,
        name: true,
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        trialEndsAt: true,
        billingPeriodStart: true,
        billingPeriodEnd: true,
        // Usage
        usedCallMinutes: true,
        usedAIMinutes: true,
        monthlyCallMinutes: true,
        monthlyAIMinutes: true,
        // Add-on pool
        addonCallMinutes: true,
        addonAIMinutes: true,
        usedAddonCallMinutes: true,
        usedAddonAIMinutes: true,
        // Overage
        overageEnabled: true,
        overageCapCents: true,
        overageUsedCents: true,
        // Limits
        maxUsers: true,
        maxPhoneNumbers: true,
        // Grace period
        aiGraceStartedAt: true,
        // Counts
        _count: {
          select: {
            users: true,
            phoneNumbers: true,
          },
        },
      },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Get plan details
    const planKey = org.plan || "STARTER";
    const planDetails = stripeService.getPlan(planKey);

    // Calculate usage percentages
    const callMinutesLimit = org.monthlyCallMinutes || planDetails.limits.callMinutes;
    const aiMinutesLimit = org.monthlyAIMinutes || planDetails.limits.aiMinutes;

    // Total pool = plan + add-ons
    const totalCallPool = callMinutesLimit + (org.addonCallMinutes - org.usedAddonCallMinutes);
    const totalAIPool = aiMinutesLimit + (org.addonAIMinutes - org.usedAddonAIMinutes);

    const usage = {
      callMinutes: {
        used: org.usedCallMinutes,
        limit: callMinutesLimit,
        percent: Math.round((org.usedCallMinutes / callMinutesLimit) * 100),
        remaining: Math.max(0, callMinutesLimit - org.usedCallMinutes),
        // Add-on pool
        addonTotal: org.addonCallMinutes,
        addonUsed: org.usedAddonCallMinutes,
        addonRemaining: Math.max(0, org.addonCallMinutes - org.usedAddonCallMinutes),
        // Total
        totalPool: totalCallPool,
        totalUsed: org.usedCallMinutes + org.usedAddonCallMinutes,
      },
      aiMinutes: {
        used: org.usedAIMinutes,
        limit: aiMinutesLimit,
        percent: Math.round((org.usedAIMinutes / aiMinutesLimit) * 100),
        remaining: Math.max(0, aiMinutesLimit - org.usedAIMinutes),
        graceStartedAt: org.aiGraceStartedAt,
        inGracePeriod: org.aiGraceStartedAt && new Date() < new Date(org.aiGraceStartedAt.getTime() + 48 * 60 * 60 * 1000),
        // Add-on pool
        addonTotal: org.addonAIMinutes,
        addonUsed: org.usedAddonAIMinutes,
        addonRemaining: Math.max(0, org.addonAIMinutes - org.usedAddonAIMinutes),
        // Total
        totalPool: totalAIPool,
        totalUsed: org.usedAIMinutes + org.usedAddonAIMinutes,
      },
      users: {
        current: org._count.users,
        limit: org.maxUsers || planDetails.limits.users,
      },
      phoneNumbers: {
        current: org._count.phoneNumbers,
        limit: org.maxPhoneNumbers || planDetails.limits.phoneNumbers,
      },
      overage: {
        enabled: org.overageEnabled,
        capCents: org.overageCapCents,
        usedCents: org.overageUsedCents,
        capDollars: org.overageCapCents / 100,
        usedDollars: org.overageUsedCents / 100,
        remainingDollars: Math.max(0, (org.overageCapCents - org.overageUsedCents) / 100),
      },
    };

    // Get subscription details from Stripe if exists
    let subscription = null;
    if (org.stripeSubscriptionId) {
      try {
        subscription = await stripeService.getSubscription(org.stripeSubscriptionId);
      } catch (e) {
        console.error("Failed to fetch subscription:", e.message);
      }
    }

    // Get active alerts
    const alerts = await alertsService.getActiveAlerts(req.organizationId);

    // Get available add-ons
    const addons = stripeService.getAddonsForPlan(planKey);

    res.json({
      plan: {
        id: org.plan,
        name: planDetails.name,
        price: planDetails.price / 100, // Convert cents to dollars
        interval: planDetails.interval,
        features: planDetails.features,
      },
      usage,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
          }
        : null,
      trial: org.plan === "TRIAL"
        ? {
            endsAt: org.trialEndsAt,
            daysLeft: org.trialEndsAt
              ? Math.max(0, Math.ceil((new Date(org.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)))
              : 0,
          }
        : null,
      alerts,
      addons: addons.map(addon => ({
        id: addon.id,
        name: addon.name,
        description: addon.description,
        price: addon.price / 100,
        callMinutes: addon.callMinutes,
        aiMinutes: addon.aiMinutes,
      })),
    });
  } catch (err) {
    console.error("❌ GET /api/billing error:", err);
    res.status(500).json({ error: "Failed to get billing info" });
  }
});

/**
 * GET /api/billing/status
 * Quick check if org can make purchases (has payment method)
 * Used by frontend to show "add payment method" modals
 */
router.get("/status", authMiddleware, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        trialEndsAt: true,
      },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    let hasPaymentMethod = false;
    let paymentMethodLast4 = null;
    let paymentMethodBrand = null;

    // Check Stripe for payment methods
    if (org.stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
        const paymentMethods = await stripe.paymentMethods.list({
          customer: org.stripeCustomerId,
          type: "card",
          limit: 1,
        });

        if (paymentMethods.data.length > 0) {
          hasPaymentMethod = true;
          paymentMethodLast4 = paymentMethods.data[0].card.last4;
          paymentMethodBrand = paymentMethods.data[0].card.brand;
        }
      } catch (e) {
        console.error("Failed to check payment methods:", e.message);
      }
    }

    const isTrial = org.plan === "TRIAL";
    const canPurchase = !isTrial && hasPaymentMethod;

    res.json({
      plan: org.plan,
      isTrial,
      hasSubscription: !!org.stripeSubscriptionId,
      hasPaymentMethod,
      paymentMethod: hasPaymentMethod ? {
        last4: paymentMethodLast4,
        brand: paymentMethodBrand,
      } : null,
      canPurchase,
      trialEndsAt: org.trialEndsAt,
      // Messages for UI
      requiresUpgrade: isTrial,
      requiresPaymentMethod: !isTrial && !hasPaymentMethod,
    });
  } catch (err) {
    console.error("❌ GET /api/billing/status error:", err);
    res.status(500).json({ error: "Failed to get billing status" });
  }
});

/**
 * POST /api/billing/checkout
 * Create Stripe checkout session for subscription
 */
router.post("/checkout", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { planId } = req.body; // Optional: specific plan to checkout
    
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Create or get Stripe customer
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(org, req.user.email);
      customerId = customer.id;

      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Determine which plan price to use
    let priceId;
    if (planId) {
      const plan = stripeService.getPlan(planId.toUpperCase());
      priceId = plan?.stripePriceId;
    } else {
      priceId = process.env.STRIPE_PRICE_BUSINESS_PRO;
    }
    
    if (!priceId) {
      return res.status(500).json({ error: "Stripe price not configured" });
    }

    const baseUrl = process.env.FRONTEND_URL || "https://phone.hekax.com";
    const session = await stripeService.createCheckoutSession(
      org.id,
      customerId,
      priceId,
      `${baseUrl}/billing?success=true`,
      `${baseUrl}/billing?cancelled=true`
    );

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("❌ POST /api/billing/checkout error:", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

/**
 * POST /api/billing/addon/checkout
 * Create Stripe checkout session for add-on purchase
 */
router.post("/addon/checkout", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { addonId } = req.body;
    
    if (!addonId) {
      return res.status(400).json({ error: "Add-on ID required" });
    }

    const addon = stripeService.getAddon(addonId.toUpperCase());
    if (!addon) {
      return res.status(404).json({ error: "Add-on not found" });
    }

    if (!addon.stripePriceId) {
      return res.status(500).json({ error: "Add-on price not configured in Stripe" });
    }

    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Create or get Stripe customer
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(org, req.user.email);
      customerId = customer.id;

      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const baseUrl = process.env.FRONTEND_URL || "https://phone.hekax.com";
    
    // Create checkout session for one-time payment
    const session = await stripeService.stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: addon.stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/billing?addon_success=true&addon=${addonId}`,
      cancel_url: `${baseUrl}/billing?addon_cancelled=true`,
      metadata: {
        organizationId: org.id,
        addonId: addonId.toUpperCase(),
        addonName: addon.name,
        callMinutes: addon.callMinutes.toString(),
        aiMinutes: addon.aiMinutes.toString(),
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("❌ POST /api/billing/addon/checkout error:", err);
    res.status(500).json({ error: "Failed to create add-on checkout session" });
  }
});

/**
 * GET /api/billing/addons
 * Get add-on purchase history
 */
router.get("/addons", authMiddleware, async (req, res) => {
  try {
    const purchases = await prisma.addOnPurchase.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { purchasedAt: "desc" },
      take: 20,
    });

    res.json({
      purchases: purchases.map(p => ({
        id: p.id,
        productId: p.productId,
        productName: p.productName,
        type: p.type,
        callMinutes: p.callMinutes,
        aiMinutes: p.aiMinutes,
        usedCallMinutes: p.usedCallMinutes,
        usedAiMinutes: p.usedAiMinutes,
        remainingCallMinutes: Math.max(0, p.callMinutes - p.usedCallMinutes),
        remainingAiMinutes: Math.max(0, p.aiMinutes - p.usedAiMinutes),
        price: p.priceCents / 100,
        status: p.status,
        purchasedAt: p.purchasedAt,
      })),
    });
  } catch (err) {
    console.error("❌ GET /api/billing/addons error:", err);
    res.status(500).json({ error: "Failed to get add-on history" });
  }
});

/**
 * PUT /api/billing/overage
 * Update overage settings
 */
router.put("/overage", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { enabled, capDollars } = req.body;

    const updateData = {};
    
    if (typeof enabled === "boolean") {
      updateData.overageEnabled = enabled;
    }
    
    if (typeof capDollars === "number" && capDollars >= 0) {
      // Convert dollars to cents, max $500
      updateData.overageCapCents = Math.min(capDollars * 100, 50000);
    }

    const org = await prisma.organization.update({
      where: { id: req.organizationId },
      data: updateData,
      select: {
        overageEnabled: true,
        overageCapCents: true,
        overageUsedCents: true,
      },
    });

    res.json({
      overage: {
        enabled: org.overageEnabled,
        capDollars: org.overageCapCents / 100,
        usedDollars: org.overageUsedCents / 100,
      },
    });
  } catch (err) {
    console.error("❌ PUT /api/billing/overage error:", err);
    res.status(500).json({ error: "Failed to update overage settings" });
  }
});

/**
 * POST /api/billing/portal
 * Create Stripe billing portal session
 */
router.post("/portal", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { stripeCustomerId: true },
    });

    if (!org?.stripeCustomerId) {
      return res.status(400).json({ error: "No billing account found" });
    }

    const baseUrl = process.env.FRONTEND_URL || "https://phone.hekax.com";
    const session = await stripeService.createBillingPortalSession(
      org.stripeCustomerId,
      `${baseUrl}/billing`
    );

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ POST /api/billing/portal error:", err);
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

/**
 * GET /api/billing/invoices
 * Get invoice history
 */
router.get("/invoices", authMiddleware, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { stripeCustomerId: true },
    });

    if (!org?.stripeCustomerId) {
      return res.json({ invoices: [] });
    }

    const invoices = await stripeService.getInvoices(org.stripeCustomerId, 20);

    res.json({
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount: inv.amount_due / 100,
        currency: inv.currency.toUpperCase(),
        created: new Date(inv.created * 1000),
        dueDate: inv.due_date ? new Date(inv.due_date * 1000) : null,
        paidAt: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000)
          : null,
        pdfUrl: inv.invoice_pdf,
        hostedUrl: inv.hosted_invoice_url,
      })),
    });
  } catch (err) {
    console.error("❌ GET /api/billing/invoices error:", err);
    res.status(500).json({ error: "Failed to get invoices" });
  }
});

/**
 * GET /api/billing/payment-methods
 * Get saved payment methods
 */
router.get("/payment-methods", authMiddleware, async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { stripeCustomerId: true },
    });

    if (!org?.stripeCustomerId) {
      return res.json({ paymentMethods: [] });
    }

    const methods = await stripeService.getPaymentMethods(org.stripeCustomerId);

    res.json({
      paymentMethods: methods.map((pm) => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
        isDefault: pm.id === pm.customer?.invoice_settings?.default_payment_method,
      })),
    });
  } catch (err) {
    console.error("❌ GET /api/billing/payment-methods error:", err);
    res.status(500).json({ error: "Failed to get payment methods" });
  }
});

/**
 * POST /api/billing/cancel
 * Cancel subscription at period end
 */
router.post("/cancel", authMiddleware, requireRole("OWNER"), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { stripeSubscriptionId: true },
    });

    if (!org?.stripeSubscriptionId) {
      return res.status(400).json({ error: "No active subscription" });
    }

    await stripeService.cancelSubscription(org.stripeSubscriptionId, false);

    // Create alert
    const subscription = await stripeService.getSubscription(org.stripeSubscriptionId);
    await alertsService.createAlert(req.organizationId, alertsService.ALERT_TYPES.SUBSCRIPTION_CANCELLED, {
      date: new Date(subscription.current_period_end * 1000).toLocaleDateString(),
    });

    res.json({ message: "Subscription will be cancelled at period end" });
  } catch (err) {
    console.error("❌ POST /api/billing/cancel error:", err);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

/**
 * POST /api/billing/resume
 * Resume a cancelled subscription
 */
router.post("/resume", authMiddleware, requireRole("OWNER"), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { stripeSubscriptionId: true },
    });

    if (!org?.stripeSubscriptionId) {
      return res.status(400).json({ error: "No subscription to resume" });
    }

    await stripeService.resumeSubscription(org.stripeSubscriptionId);

    // Dismiss cancellation alert
    await alertsService.dismissAlertsByType(req.organizationId, alertsService.ALERT_TYPES.SUBSCRIPTION_CANCELLED);

    res.json({ message: "Subscription resumed" });
  } catch (err) {
    console.error("❌ POST /api/billing/resume error:", err);
    res.status(500).json({ error: "Failed to resume subscription" });
  }
});

/**
 * POST /api/billing/alerts/:id/dismiss
 * Dismiss an alert
 */
router.post("/alerts/:id/dismiss", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await alertsService.dismissAlert(id, req.organizationId);
    res.json({ message: "Alert dismissed" });
  } catch (err) {
    console.error("❌ POST /api/billing/alerts/:id/dismiss error:", err);
    res.status(500).json({ error: "Failed to dismiss alert" });
  }
});

module.exports = router;