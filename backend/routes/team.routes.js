// ============================================================================
// HEKAX Phone - Team Routes
// ============================================================================

const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

/**
 * GET /api/team
 * Get all team members
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const members = await prisma.user.findMany({
      where: { organizationId: req.organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        phone: true,
        avatar: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(members);
  } catch (err) {
    console.error("❌ GET /api/team error:", err);
    res.status(500).json({ error: "Failed to load team" });
  }
});

/**
 * POST /api/team/invite
 * Invite a new team member
 */
router.post("/invite", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { email, name, role = "AGENT" } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "Email and name required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email exists
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Validate role
    const validRoles = ["AGENT", "MANAGER", "ADMIN"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Create invite token
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create user with invited status
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: "", // Set when they accept
        name,
        role,
        status: "INVITED",
        organizationId: req.organizationId,
        passwordResetToken: inviteToken,
        passwordResetExpires: inviteExpires,
      },
    });

    const inviteLink = `${process.env.FRONTEND_URL || 'https://phone.hekax.com'}/accept-invite?token=${inviteToken}`;

    console.log("📧 Invite created for:", normalizedEmail);

    res.status(201).json({
      message: "Invitation sent",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
      // In production, send via email instead
      inviteLink,
    });
  } catch (err) {
    console.error("❌ POST /api/team/invite error:", err);
    res.status(500).json({ error: "Failed to send invite" });
  }
});

/**
 * PATCH /api/team/:id
 * Update team member
 */
router.patch("/:id", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status } = req.body;

    // Verify user belongs to same org
    const user = await prisma.user.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent changing own role
    if (user.id === req.user.id && role && role !== user.role) {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    // Prevent demoting owner
    if (user.role === "OWNER" && role && role !== "OWNER") {
      return res.status(400).json({ error: "Cannot demote organization owner" });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(role && { role }),
        ...(status && { status }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("❌ PATCH /api/team/:id error:", err);
    res.status(500).json({ error: "Failed to update team member" });
  }
});

/**
 * DELETE /api/team/:id
 * Remove team member
 */
router.delete("/:id", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user belongs to same org
    const user = await prisma.user.findFirst({
      where: {
        id,
        organizationId: req.organizationId,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent deleting yourself
    if (user.id === req.user.id) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    // Prevent deleting owner
    if (user.role === "OWNER") {
      return res.status(400).json({ error: "Cannot delete organization owner" });
    }

    await prisma.user.delete({ where: { id } });

    res.json({ message: "User removed" });
  } catch (err) {
    console.error("❌ DELETE /api/team/:id error:", err);
    res.status(500).json({ error: "Failed to remove team member" });
  }
});

module.exports = router;
