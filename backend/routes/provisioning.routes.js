// ============================================================================
// HEKAX Phone - Provisioning Routes
// Auto-provision Twilio resources for organizations
// ============================================================================

const express = require("express");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const twilioService = require("../services/twilio.service");

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/provisioning/status
 * Get current provisioning status for the organization
 */
router.get("/status", async (req, res) => {
  try {
    const status = await twilioService.getProvisioningStatus(req.organizationId);
    res.json(status);
  } catch (err) {
    console.error("❌ Provisioning status error:", err);
    res.status(500).json({ error: "Failed to get provisioning status" });
  }
});

/**
 * POST /api/provisioning/provision
 * Trigger full Twilio provisioning for the organization
 * Creates: Subaccount, TwiML App, API Keys
 * Requires OWNER or ADMIN role
 */
router.post("/provision", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  try {
    // Check if already provisioned
    const currentStatus = await twilioService.getProvisioningStatus(req.organizationId);

    if (currentStatus.provisioned) {
      return res.status(400).json({
        error: "Organization already provisioned",
        status: currentStatus,
      });
    }

    // Get organization name for the subaccount
    const prisma = require("../lib/prisma");
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { name: true },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    console.log("🚀 Starting provisioning for:", org.name);

    // Provision everything
    const result = await twilioService.provisionOrganization(
      req.organizationId,
      org.name
    );

    res.json({
      success: true,
      message: "Organization fully provisioned",
      provisioning: result,
    });

  } catch (err) {
    console.error("❌ Provisioning error:", err);
    res.status(500).json({
      error: "Provisioning failed",
      message: err.message,
    });
  }
});

/**
 * DELETE /api/provisioning/deprovision
 * Remove Twilio resources (close subaccount)
 * WARNING: This will release all phone numbers!
 * Requires OWNER role
 */
router.delete("/deprovision", requireRole(["OWNER"]), async (req, res) => {
  try {
    const { confirm } = req.body;

    if (confirm !== "DEPROVISION") {
      return res.status(400).json({
        error: "Confirmation required",
        message: "Send { confirm: 'DEPROVISION' } to confirm",
      });
    }

    const result = await twilioService.deprovisionOrganization(req.organizationId);

    res.json({
      success: true,
      message: "Organization deprovisioned",
      result,
    });

  } catch (err) {
    console.error("❌ Deprovisioning error:", err);
    res.status(500).json({
      error: "Deprovisioning failed",
      message: err.message,
    });
  }
});

// ============================================================================
// PHONE NUMBER MANAGEMENT
// ============================================================================

/**
 * GET /api/provisioning/phone-numbers/search
 * Search available phone numbers to purchase
 */
router.get("/phone-numbers/search", async (req, res) => {
  try {
    const { areaCode, country, type, contains, limit } = req.query;

    const result = await twilioService.searchAvailableNumbers(req.organizationId, {
      areaCode,
      country: country || "US",
      type: type || "local",
      contains,
      limit: parseInt(limit) || 10,
    });

    res.json(result);

  } catch (err) {
    console.error("❌ Phone search error:", err);
    res.status(500).json({
      error: "Failed to search phone numbers",
      message: err.message,
    });
  }
});

/**
 * POST /api/provisioning/phone-numbers/purchase
 * Purchase a phone number
 * Requires OWNER or ADMIN role
 */
router.post("/phone-numbers/purchase", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number required" });
    }

    // Check provisioning status first
    const status = await twilioService.getProvisioningStatus(req.organizationId);

    if (!status.provisioned) {
      return res.status(400).json({
        error: "Organization not provisioned",
        message: "Please provision the organization first before purchasing numbers",
      });
    }

    const result = await twilioService.purchaseNumber(req.organizationId, phoneNumber);

    res.json({
      success: true,
      message: "Phone number purchased and configured",
      phoneNumber: result,
    });

  } catch (err) {
    console.error("❌ Phone purchase error:", err);
    res.status(500).json({
      error: "Failed to purchase phone number",
      message: err.message,
    });
  }
});

/**
 * DELETE /api/provisioning/phone-numbers/:id
 * Release a phone number
 * Requires OWNER role
 */
router.delete("/phone-numbers/:id", requireRole(["OWNER"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { confirm } = req.body;

    if (confirm !== "RELEASE") {
      return res.status(400).json({
        error: "Confirmation required",
        message: "Send { confirm: 'RELEASE' } to confirm",
      });
    }

    const result = await twilioService.releaseNumber(req.organizationId, id);

    res.json({
      success: true,
      message: "Phone number released",
      result,
    });

  } catch (err) {
    console.error("❌ Phone release error:", err);
    res.status(500).json({
      error: "Failed to release phone number",
      message: err.message,
    });
  }
});

module.exports = router;
