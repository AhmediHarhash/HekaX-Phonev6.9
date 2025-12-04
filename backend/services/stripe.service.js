// ============================================================================
// HEKAX Phone - Stripe Service
// Phase 6.1: Billing & Credits
// ============================================================================

const Stripe = require("stripe");

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2023-10-16",
});

// Plan configurations
const PLANS = {
  STARTER: {
    id: "starter",
    name: "Starter",
    price: 9900, // $99.00 in cents
    interval: "month",
    stripePriceId: process.env.STRIPE_PRICE_STARTER || null,
    limits: {
      callMinutes: 1000,
      aiMinutes: 300,
      users: 2,
      phoneNumbers: 1,
      recordingRetentionDays: 30,
      concurrentCalls: 1,
    },
    overage: {
      enabled: false, // Disabled by default for Starter
      overageCap: 2500, // $25 cap
      callMinuteRate: 0.03, // $0.03 per minute
      aiMinuteRate: 0.08, // $0.08 per AI minute
    },
    features: {
      multiOrg: false,
      apiAccess: false,
      byoKeys: false,
      dataExport: false,
      prioritySupport: false,
      whiteLabel: false,
      customDomain: false,
      analytics: "basic",
    },
  },
  BUSINESS_PRO: {
    id: "business_pro",
    name: "Business Pro",
    price: 49900, // $499.00 in cents
    interval: "month",
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS_PRO || null,
    limits: {
      callMinutes: 4000,
      aiMinutes: 2000,
      users: 10,
      phoneNumbers: 5,
      recordingRetentionDays: 90,
      concurrentCalls: 3,
    },
    overage: {
      enabled: true, // Enabled by default for Pro
      overageCap: 15000, // $150 cap
      callMinuteRate: 0.03, // $0.03 per minute
      aiMinuteRate: 0.08, // $0.08 per AI minute
    },
    features: {
      multiOrg: true,
      apiAccess: true,
      byoKeys: false,
      dataExport: true,
      prioritySupport: true,
      whiteLabel: false,
      customDomain: false,
      analytics: "full",
    },
  },
  SCALE: {
    id: "scale",
    name: "Scale",
    price: 79900, // $799.00 in cents
    interval: "month",
    stripePriceId: process.env.STRIPE_PRICE_SCALE || null,
    limits: {
      callMinutes: 8000,
      aiMinutes: 4000,
      users: 20,
      phoneNumbers: 5,
      recordingRetentionDays: 180,
      concurrentCalls: 5,
    },
    overage: {
      enabled: true, // Enabled by default
      overageCap: 25000, // $250 cap
      callMinuteRate: 0.03, // $0.03 per minute
      aiMinuteRate: 0.06, // $0.06 per AI minute (discounted)
    },
    features: {
      multiOrg: true,
      apiAccess: true,
      byoKeys: true,
      dataExport: true,
      prioritySupport: true,
      whiteLabel: true,
      customDomain: true,
      analytics: "full",
    },
  },
  // Legacy trial plan (for existing trial users)
  TRIAL: {
    id: "trial",
    name: "Trial",
    price: 0,
    interval: null,
    trialDays: 7,
    limits: {
      callMinutes: 200,
      aiMinutes: 100,
      users: 2,
      phoneNumbers: 1,
      recordingRetentionDays: 7,
      concurrentCalls: 1,
    },
    overage: {
      enabled: false,
      overageCap: 0,
      callMinuteRate: 0,
      aiMinuteRate: 0,
    },
    features: {
      multiOrg: false,
      apiAccess: false,
      byoKeys: false,
      dataExport: false,
      prioritySupport: false,
      whiteLabel: false,
      customDomain: false,
      analytics: "basic",
    },
  },
};

// Add-on packs (V1 - Simplified to 3 SKUs)
const ADDONS = {
  CALL_BOOST_1000: {
    id: "call_boost_1000",
    name: "Call Boost 1,000",
    description: "+1,000 call minutes",
    price: 3000, // $30
    callMinutes: 1000,
    aiMinutes: 0,
    stripePriceId: process.env.STRIPE_PRICE_ADDON_CALL_1000 || null,
  },
  AI_BOOST_500: {
    id: "ai_boost_500",
    name: "AI Boost 500",
    description: "+500 AI minutes",
    price: 4000, // $40
    callMinutes: 0,
    aiMinutes: 500,
    stripePriceId: process.env.STRIPE_PRICE_ADDON_AI_500 || null,
  },
  GROWTH_BUNDLE: {
    id: "growth_bundle",
    name: "Growth Bundle",
    description: "+1,000 call minutes & +500 AI minutes",
    price: 5900, // $59
    callMinutes: 1000,
    aiMinutes: 500,
    stripePriceId: process.env.STRIPE_PRICE_ADDON_BUNDLE || null,
  },
  // ==========================================================================
  // FUTURE ADD-ONS (uncomment when needed based on usage patterns)
  // ==========================================================================
  // CALL_BOOST_500: {
  //   id: "call_boost_500",
  //   name: "Call Boost 500",
  //   price: 2000, // $20
  //   callMinutes: 500,
  //   aiMinutes: 0,
  //   stripePriceId: process.env.STRIPE_PRICE_ADDON_CALL_500 || null,
  // },
  // CALL_BOOST_2000: {
  //   id: "call_boost_2000",
  //   name: "Call Boost 2,000",
  //   price: 5000, // $50
  //   callMinutes: 2000,
  //   aiMinutes: 0,
  //   stripePriceId: process.env.STRIPE_PRICE_ADDON_CALL_2000 || null,
  // },
  // AI_BOOST_200: {
  //   id: "ai_boost_200",
  //   name: "AI Boost 200",
  //   price: 2500, // $25
  //   callMinutes: 0,
  //   aiMinutes: 200,
  //   stripePriceId: process.env.STRIPE_PRICE_ADDON_AI_200 || null,
  // },
  // AI_BOOST_1000: {
  //   id: "ai_boost_1000",
  //   name: "AI Boost 1,000",
  //   price: 7000, // $70
  //   callMinutes: 0,
  //   aiMinutes: 1000,
  //   stripePriceId: process.env.STRIPE_PRICE_ADDON_AI_1000 || null,
  // },
};

// Alert thresholds
const ALERT_THRESHOLDS = [80, 90, 100];

/**
 * Create a Stripe customer for an organization
 */
async function createCustomer(organization, email) {
  try {
    const customer = await stripe.customers.create({
      email,
      name: organization.name,
      metadata: {
        organizationId: organization.id,
        organizationSlug: organization.slug,
      },
    });

    console.log("✅ Stripe customer created:", customer.id);
    return customer;
  } catch (error) {
    console.error("❌ Stripe createCustomer error:", error.message);
    throw error;
  }
}

/**
 * Create a subscription for an organization
 */
async function createSubscription(customerId, priceId, trialDays = 0) {
  try {
    const subscriptionData = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
    };

    if (trialDays > 0) {
      subscriptionData.trial_period_days = trialDays;
    }

    const subscription = await stripe.subscriptions.create(subscriptionData);

    console.log("✅ Stripe subscription created:", subscription.id);
    return subscription;
  } catch (error) {
    console.error("❌ Stripe createSubscription error:", error.message);
    throw error;
  }
}

/**
 * Create a checkout session for subscription
 */
async function createCheckoutSession(organizationId, customerId, priceId, successUrl, cancelUrl) {
  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          organizationId,
        },
      },
      metadata: {
        organizationId,
      },
    });

    console.log("✅ Checkout session created:", session.id);
    return session;
  } catch (error) {
    console.error("❌ Stripe createCheckoutSession error:", error.message);
    throw error;
  }
}

/**
 * Create a billing portal session
 */
async function createBillingPortalSession(customerId, returnUrl) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session;
  } catch (error) {
    console.error("❌ Stripe createBillingPortalSession error:", error.message);
    throw error;
  }
}

/**
 * Get subscription details
 */
async function getSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    console.error("❌ Stripe getSubscription error:", error.message);
    throw error;
  }
}

/**
 * Cancel subscription
 */
async function cancelSubscription(subscriptionId, immediately = false) {
  try {
    if (immediately) {
      const subscription = await stripe.subscriptions.cancel(subscriptionId);
      return subscription;
    } else {
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      return subscription;
    }
  } catch (error) {
    console.error("❌ Stripe cancelSubscription error:", error.message);
    throw error;
  }
}

/**
 * Resume a cancelled subscription
 */
async function resumeSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    return subscription;
  } catch (error) {
    console.error("❌ Stripe resumeSubscription error:", error.message);
    throw error;
  }
}

/**
 * Create a usage record for metered billing (overage)
 */
async function createUsageRecord(subscriptionItemId, quantity, timestamp = null) {
  try {
    const usageRecord = await stripe.subscriptionItems.createUsageRecord(
      subscriptionItemId,
      {
        quantity,
        timestamp: timestamp || Math.floor(Date.now() / 1000),
        action: "increment",
      }
    );
    return usageRecord;
  } catch (error) {
    console.error("❌ Stripe createUsageRecord error:", error.message);
    throw error;
  }
}

/**
 * Get customer's payment methods
 */
async function getPaymentMethods(customerId) {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    return paymentMethods.data;
  } catch (error) {
    console.error("❌ Stripe getPaymentMethods error:", error.message);
    throw error;
  }
}

/**
 * Get customer's invoices
 */
async function getInvoices(customerId, limit = 10) {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit,
    });
    return invoices.data;
  } catch (error) {
    console.error("❌ Stripe getInvoices error:", error.message);
    throw error;
  }
}

/**
 * Create a one-time charge for add-on (e.g., AI minutes pack)
 */
async function createOneTimeCharge(customerId, amount, description, metadata = {}) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      customer: customerId,
      description,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
    return paymentIntent;
  } catch (error) {
    console.error("❌ Stripe createOneTimeCharge error:", error.message);
    throw error;
  }
}

/**
 * Construct webhook event from payload
 */
function constructWebhookEvent(payload, signature, webhookSecret) {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    return event;
  } catch (error) {
    console.error("❌ Stripe webhook signature verification failed:", error.message);
    throw error;
  }
}

/**
 * Calculate usage percentage and check if alert needed
 */
function checkUsageAlerts(used, limit) {
  if (!limit) return { percent: 0, alerts: [] };
  
  const percent = Math.round((used / limit) * 100);
  const alerts = ALERT_THRESHOLDS.filter(threshold => percent >= threshold);
  
  return { percent, alerts };
}

/**
 * Get plan by ID
 */
function getPlan(planId) {
  return PLANS[planId] || PLANS.STARTER;
}

/**
 * Get all plans
 */
function getAllPlans() {
  return PLANS;
}

/**
 * Get addon by ID
 */
function getAddon(addonId) {
  return ADDONS[addonId] || null;
}

/**
 * Get all addons
 */
function getAllAddons() {
  return ADDONS;
}

/**
 * Get available addons (V1: all addons available to all plans)
 */
function getAddonsForPlan(planId) {
  // V1: All add-ons available to all plans
  // Future: Can restrict based on planId if needed
  return Object.values(ADDONS);
}

module.exports = {
  stripe,
  PLANS,
  ADDONS,
  ALERT_THRESHOLDS,
  createCustomer,
  createSubscription,
  createCheckoutSession,
  createBillingPortalSession,
  getSubscription,
  cancelSubscription,
  resumeSubscription,
  createUsageRecord,
  getPaymentMethods,
  getInvoices,
  createOneTimeCharge,
  constructWebhookEvent,
  checkUsageAlerts,
  getPlan,
  getAllPlans,
  getAddon,
  getAllAddons,
  getAddonsForPlan,
};
