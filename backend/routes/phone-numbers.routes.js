// ============================================================================
// HEKAX Phone - Phone Numbers Routes
// Phase 5: Multi-tenant SaaS Infrastructure
// ============================================================================

const express = require("express");
const twilio = require("twilio");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { checkPhoneNumberLimit } = require("../middleware/usage.middleware");
const { createAuditLog, AUDITABLE_ACTIONS } = require("../middleware/audit.middleware");

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
 */
router.get("/available", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { areaCode, country = "US", type = "local" } = req.query;

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return res.status(500).json({ error: "Twilio not configured" });
    }

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    let numbers = [];
    
    if (country === "US") {
      // USA: Filter for voice, SMS, MMS, fax and no address requirements
      const searchParams = {
        voiceEnabled: true,
        smsEnabled: true,
        mmsEnabled: true,
        faxEnabled: true,
        excludeAllAddressRequired: true,
        excludeLocalAddressRequired: true,
        excludeForeignAddressRequired: true,
      };

      if (areaCode) {
        searchParams.areaCode = areaCode;
      }

      if (type === "tollfree") {
        numbers = await client.availablePhoneNumbers("US").tollFree.list({
          ...searchParams,
          limit: 10,
        });
      } else {
        numbers = await client.availablePhoneNumbers("US").local.list({
          ...searchParams,
          limit: 10,
        });
      }
    } else if (country === "GB") {
      // UK: Only voice and fax available
      const searchParams = {
        voiceEnabled: true,
        faxEnabled: true,
        excludeAllAddressRequired: true,
        excludeLocalAddressRequired: true,
        excludeForeignAddressRequired: true,
      };

      // UK area codes are different - can search by contains
      if (areaCode) {
        searchParams.contains = areaCode;
      }

      numbers = await client.availablePhoneNumbers("GB").local.list({
        ...searchParams,
        limit: 10,
      });
    } else {
      // Other countries - basic search
      const searchParams = {
        voiceEnabled: true,
      };

      if (areaCode) {
        searchParams.areaCode = areaCode;
      }

      numbers = await client.availablePhoneNumbers(country).local.list({
        ...searchParams,
        limit: 10,
      });
    }

    res.json(
      numbers.map((n) => ({
        number: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region,
        postalCode: n.postalCode,
        capabilities: n.capabilities,
      }))
    );
  } catch (err) {
    console.error("❌ GET /api/phone-numbers/available error:", err);
    res.status(500).json({ error: err.message || "Failed to search phone numbers" });
  }
});

/**
 * POST /api/phone-numbers
 * Purchase and add a new phone number
 */
router.post("/", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { number, friendlyName } = req.body;

    if (!number) {
      return res.status(400).json({ error: "Phone number required" });
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

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, PUBLIC_BASE_URL } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return res.status(500).json({ error: "Twilio not configured" });
    }

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    // Purchase the number
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: number,
      voiceUrl: `${PUBLIC_BASE_URL}/twilio/voice/incoming`,
      voiceMethod: "POST",
      statusCallback: `${PUBLIC_BASE_URL}/twilio/call/status`,
      statusCallbackMethod: "POST",
    });

    // Save to database
    const phoneNumber = await prisma.phoneNumber.create({
      data: {
        number: purchasedNumber.phoneNumber,
        friendlyName: friendlyName || purchasedNumber.friendlyName,
        twilioSid: purchasedNumber.sid,
        capabilities: purchasedNumber.capabilities,
        organizationId: req.organizationId,
        routeToAI: true,
      },
    });

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

    console.log("✅ Phone number added:", phoneNumber.number);

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

    // Release from Twilio
    if (phoneNumber.twilioSid) {
      try {
        const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        await client.incomingPhoneNumbers(phoneNumber.twilioSid).remove();
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
