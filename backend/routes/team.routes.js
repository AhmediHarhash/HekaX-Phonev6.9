// ============================================================================
// HEKAX Phone - Team Routes
// ============================================================================

const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { authMiddleware, requireRole } = require("../middleware/auth.middleware");
const { emailService } = require("../services/email");

const router = express.Router();

/**
 * GET /api/team
 * Get all team members
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Get team via memberships
    const memberships = await prisma.userOrganization.findMany({
      where: { organizationId: req.organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            phone: true,
            avatar: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Flatten for frontend
    const members = memberships.map(m => ({
      id: m.user.id,
      membershipId: m.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      status: m.user.status,
      phone: m.user.phone,
      avatar: m.user.avatar,
      lastLoginAt: m.user.lastLoginAt,
      createdAt: m.user.createdAt,
    }));

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

    // Create user and membership in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: "", // Set when they accept
          name,
          status: "INVITED",
          organizationId: req.organizationId,
          passwordResetToken: inviteToken,
          passwordResetExpires: inviteExpires,
        },
      });

      // Create membership with role (inviteToken is stored on User, not membership)
      const membership = await tx.userOrganization.create({
        data: {
          userId: user.id,
          organizationId: req.organizationId,
          role: role,
          invitedBy: req.user.id,
        },
      });

      return { user, membership };
    });

    const inviteLink = `${process.env.FRONTEND_URL || 'https://phone.hekax.com'}/accept-invite?token=${inviteToken}`;

    // Get organization name for email
    const organization = await prisma.organization.findUnique({
      where: { id: req.organizationId },
      select: { name: true },
    });

    // Send invitation email
    const emailResult = await emailService.sendTeamInviteEmail({
      inviterName: req.user.name,
      orgName: organization?.name || 'Your Team',
      email: normalizedEmail,
      inviteToken,
      role: role,
    });

    if (emailResult.success) {
      console.log("📧 Invite email sent to:", normalizedEmail);
    } else {
      console.warn("⚠️ Invite email failed:", emailResult.error);
    }

    res.status(201).json({
      message: emailResult.success ? "Invitation sent" : "Invitation created (email not sent)",
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.membership.role,
        status: result.user.status,
      },
      emailSent: emailResult.success,
    });
  } catch (err) {
    console.error("❌ POST /api/team/invite error:", err);
    res.status(500).json({ error: "Failed to send invite" });
  }
});

/**
 * PATCH /api/team/:id
 * Update team member
 * SECURITY: Uses membership table to properly scope to organization
 */
router.patch("/:id", authMiddleware, requireRole("OWNER", "ADMIN"), async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status } = req.body;

    // SECURITY: Find membership in THIS organization (not legacy organizationId)
    const membership = await prisma.userOrganization.findFirst({
      where: {
        userId: id,
        organizationId: req.organizationId,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, status: true },
        },
      },
    });

    if (!membership) {
      return res.status(404).json({ error: "User not found in this organization" });
    }

    // Prevent changing own role
    if (id === req.user.id && role && role !== membership.role) {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    // Prevent demoting owner
    if (membership.role === "OWNER" && role && role !== "OWNER") {
      return res.status(400).json({ error: "Cannot demote organization owner" });
    }

    // Validate role
    const validRoles = ["OWNER", "ADMIN", "MANAGER", "AGENT", "VIEWER"];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Update the MEMBERSHIP role (not user's global role)
    const updatedMembership = await prisma.userOrganization.update({
      where: { id: membership.id },
      data: {
        ...(role && { role }),
      },
    });

    // Update user status separately if provided
    if (status) {
      await prisma.user.update({
        where: { id },
        data: { status },
      });
    }

    // Fetch updated user data
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, status: true },
    });

    res.json({
      ...updatedUser,
      role: updatedMembership.role,
    });
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
