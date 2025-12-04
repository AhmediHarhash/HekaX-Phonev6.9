// ============================================================================
// HEKAX Phone - Phone Numbers Routes
// Phase 5: Multi-tenant SaaS Infrastructure
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { checkPhoneNumberLimit } = require("../middleware/usage.middleware");
const { createAuditLog, AUDITABLE_ACTIONS } = require("../middleware/audit.middleware");
const twilioService = require("../services/twilio.service");

const router = express.Router();

/**
 * GET /api/phone-numbers
 * List all phone numbers for organization
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { createdAt: "desc" },
    });

    res.json(phoneNumbers);
  } catch (err) {
    console.error("❌ GET /api/phone-numbers error:", err);
    res.status(500).json({ error: "Failed to load phone numbers" });
  }
});

/**
 * GET /api/phone-numbers/available
 * Search for available phone numbers to purchase
 * Returns numbers with smart capability fallback
 */
router.get("/available", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { areaCode, country = "US", type = "local" } = req.query;

    // Only allow US for now
    if (country !== "US") {
      return res.status(400).json({ 
        error: "Only US numbers are available at this time",
        code: "COUNTRY_NOT_SUPPORTED",
      });
    }

    const result = await twilioService.searchAvailableNumbers(req.organizationId, {
      areaCode,
      country,
      type,
      limit: 10,
    });

    res.json({
      numbers: result.numbers,
      capabilities: result.capabilitiesUsed,
      message: result.message,
    });
  } catch (err) {
    console.error("❌ GET /api/phone-numbers/available error:", err);
    res.status(500).json({ error: err.message || "Failed to search phone numbers" });
  }
});

/**
 * POST /api/phone-numbers
 * Purchase and add a new phone number
 * REQUIRES: Billing verification (Stripe payment method on file)
 */
router.post("/", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { number, friendlyName } = req.body;

    if (!number) {
      return res.status(400).json({ error: "Phone number required" });
    }

    // Get organization to check billing status
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    // SECURITY: Require billing verification before purchasing numbers
    // Trial users cannot buy real numbers (demo mode only)
    if (org.plan === "TRIAL") {
      return res.status(403).json({
        error: "Trial accounts cannot purchase phone numbers",
        code: "TRIAL_RESTRICTED",
        message: "Upgrade to a paid plan to purchase phone numbers.",
      });
    }

    // Require Stripe payment method on file
    if (!org.stripeCustomerId) {
      return res.status(402).json({
        error: "Payment method required",
        code: "BILLING_REQUIRED",
        message: "Please add a payment method to purchase phone numbers.",
      });
    }

    // Verify customer has a valid payment method in Stripe
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const paymentMethods = await stripe.paymentMethods.list({
      customer: org.stripeCustomerId,
      type: "card",
      limit: 1,
    });

    if (paymentMethods.data.length === 0) {
      return res.status(402).json({
        error: "No payment method on file",
        code: "PAYMENT_METHOD_REQUIRED",
        message: "Please add a credit card to purchase phone numbers.",
      });
    }

    // Check limit
    const limitCheck = await checkPhoneNumberLimit(req.organizationId);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: limitCheck.error,
        code: "LIMIT_EXCEEDED",
        current: limitCheck.current,
        limit: limitCheck.limit,
      });
    }

    const webhookBaseUrl = process.env.PUBLIC_BASE_URL || "https://phoneapi.hekax.com";
    
    // Purchase using org's subaccount
    const purchased = await twilioService.purchaseNumber(
      req.organizationId,
      number,
      webhookBaseUrl
    );

    // Save to database
    const phoneNumber = await prisma.phoneNumber.create({
      data: {
        number: purchased.phoneNumber,
        friendlyName: friendlyName || purchased.friendlyName,
        twilioSid: purchased.sid,
        capabilities: purchased.capabilities,
        organizationId: req.organizationId,
        routeToAI: true,
      },
    });

    // Update organization's primary number if this is the first
    const existingNumbers = await prisma.phoneNumber.count({
      where: { organizationId: req.organizationId },
    });
    
    if (existingNumbers === 1) {
      await prisma.organization.update({
        where: { id: req.organizationId },
        data: { twilioNumber: purchased.phoneNumber },
      });
    }

    // Audit log
    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: AUDITABLE_ACTIONS.PHONE_ADD,
      entityType: "phone_number",
      entityId: phoneNumber.id,
      newValues: { number: phoneNumber.number },
      organizationId: req.organizationId,
      ipAddress: req.ip,
    });

    console.log("✅ Phone number added:", phoneNumber.number, "for org:", req.organizationId);

    res.status(201).json(phoneNumber);
  } catch (err) {
    console.error("❌ POST /api/phone-numbers error:", err);
    res.status(500).json({ error: err.message || "Failed to add phone number" });
  }
});

/**
 * GET /api/phone-numbers/:id
 * Get single phone number details
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    res.json(phoneNumber);
  } catch (err) {
    console.error("❌ GET /api/phone-numbers/:id error:", err);
    res.status(500).json({ error: "Failed to load phone number" });
  }
});

/**
 * PATCH /api/phone-numbers/:id
 * Update phone number settings
 */
router.patch("/:id", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;
    const { friendlyName, routeToAI, routeToUser, greeting, voiceId } = req.body;

    // Verify ownership
    const existing = await prisma.phoneNumber.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    const updated = await prisma.phoneNumber.update({
      where: { id },
      data: {
        ...(friendlyName !== undefined && { friendlyName }),
        ...(routeToAI !== undefined && { routeToAI }),
        ...(routeToUser !== undefined && { routeToUser }),
        ...(greeting !== undefined && { greeting }),
        ...(voiceId !== undefined && { voiceId }),
      },
    });

    // Audit log
    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: AUDITABLE_ACTIONS.PHONE_UPDATE,
      entityType: "phone_number",
      entityId: id,
      oldValues: existing,
      newValues: req.body,
      organizationId: req.organizationId,
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (err) {
    console.error("❌ PATCH /api/phone-numbers/:id error:", err);
    res.status(500).json({ error: "Failed to update phone number" });
  }
});

/**
 * DELETE /api/phone-numbers/:id
 * Release a phone number
 */
router.delete("/:id", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;

    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: "Phone number not found" });
    }

    // Release from Twilio using org's subaccount
    if (phoneNumber.twilioSid) {
      try {
        await twilioService.releaseNumber(req.organizationId, phoneNumber.twilioSid);
      } catch (twilioErr) {
        console.error("⚠️ Twilio release error:", twilioErr.message);
        // Continue with DB deletion even if Twilio fails
      }
    }

    // Delete from database
    await prisma.phoneNumber.delete({ where: { id } });

    // Audit log
    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: AUDITABLE_ACTIONS.PHONE_REMOVE,
      entityType: "phone_number",
      entityId: id,
      oldValues: { number: phoneNumber.number },
      organizationId: req.organizationId,
      ipAddress: req.ip,
    });

    console.log("🗑️ Phone number released:", phoneNumber.number);

    res.json({ message: "Phone number released" });
  } catch (err) {
    console.error("❌ DELETE /api/phone-numbers/:id error:", err);
    res.status(500).json({ error: "Failed to release phone number" });
  }
});

module.exports = router;