// ============================================================================
// HEKAX Phone - User Organizations Routes
// Phase 6.3: Multi-Org Support
// ============================================================================

const express = require("express");
const prisma = require("../lib/prisma");
const { authMiddleware } = require("../middleware/auth.middleware");
const { createAuditLog, AUDITABLE_ACTIONS } = require("../middleware/audit.middleware");

const router = express.Router();

/**
 * GET /api/user/organizations
 * Get all organizations the current user belongs to
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const memberships = await prisma.userOrganization.findMany({
      where: { userId: req.user.id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            plan: true,
            status: true,
            onboardingCompleted: true,
          },
        },
      },
      orderBy: [
        { isPrimary: "desc" },
        { createdAt: "asc" },
      ],
    });

    const organizations = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      logoUrl: m.organization.logoUrl,
      plan: m.organization.plan,
      status: m.organization.status,
      onboardingCompleted: m.organization.onboardingCompleted,
      role: m.role,
      isPrimary: m.isPrimary,
      joinedAt: m.acceptedAt || m.invitedAt,
    }));

    // Get current active org
    const currentOrgId = req.user.currentOrgId || req.organizationId;

    res.json({
      organizations,
      currentOrgId,
    });
  } catch (err) {
    console.error("❌ GET /api/user/organizations error:", err);
    res.status(500).json({ error: "Failed to get organizations" });
  }
});

/**
 * POST /api/user/organizations/switch
 * Switch to a different organization
 */
router.post("/switch", authMiddleware, async (req, res) => {
  try {
    const { organizationId } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    // Verify user has membership in this org
    const membership = await prisma.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId,
        },
      },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      return res.status(403).json({ error: "You are not a member of this organization" });
    }

    // Update user's current org
    await prisma.user.update({
      where: { id: req.user.id },
      data: { currentOrgId: organizationId },
    });

    // Return the org details for the frontend to update
    res.json({
      message: "Switched organization",
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        plan: membership.organization.plan,
        logoUrl: membership.organization.logoUrl,
        onboardingCompleted: membership.organization.onboardingCompleted,
      },
      role: membership.role,
    });
  } catch (err) {
    console.error("❌ POST /api/user/organizations/switch error:", err);
    res.status(500).json({ error: "Failed to switch organization" });
  }
});

/**
 * POST /api/user/organizations
 * Create a new organization (for agency owners)
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, industry = "general" } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Organization name required" });
    }

    // Create slug from name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Check if slug exists, add number if needed
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create org and membership in transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name,
          slug,
          industry,
          greeting: `Thank you for calling ${name}. How may I help you?`,
          onboardingCompleted: false,
        },
      });

      const membership = await tx.userOrganization.create({
        data: {
          userId: req.user.id,
          organizationId: org.id,
          role: "OWNER",
          isPrimary: false,
          acceptedAt: new Date(),
        },
      });

      return { org, membership };
    });

    // Audit log
    await createAuditLog({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "organization.create",
      entityType: "organization",
      entityId: result.org.id,
      newValues: { name, slug },
      organizationId: result.org.id,
    });

    console.log("✅ New organization created:", result.org.name, "by", req.user.email);

    res.status(201).json({
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
        plan: result.org.plan,
        onboardingCompleted: result.org.onboardingCompleted,
      },
      role: result.membership.role,
    });
  } catch (err) {
    console.error("❌ POST /api/user/organizations error:", err);
    res.status(500).json({ error: "Failed to create organization" });
  }
});

/**
 * DELETE /api/user/organizations/:id/leave
 * Leave an organization
 */
router.delete("/:id/leave", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const membership = await prisma.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: id,
        },
      },
      include: {
        organization: {
          include: {
            _count: { select: { memberships: true } },
          },
        },
      },
    });

    if (!membership) {
      return res.status(404).json({ error: "Membership not found" });
    }

    // Can't leave if you're the only owner
    if (membership.role === "OWNER") {
      const otherOwners = await prisma.userOrganization.count({
        where: {
          organizationId: id,
          role: "OWNER",
          userId: { not: req.user.id },
        },
      });

      if (otherOwners === 0) {
        return res.status(400).json({ 
          error: "Cannot leave - you're the only owner. Transfer ownership first." 
        });
      }
    }

    // Delete membership
    await prisma.userOrganization.delete({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: id,
        },
      },
    });

    // If this was their current org, switch to another
    if (req.user.currentOrgId === id) {
      const nextOrg = await prisma.userOrganization.findFirst({
        where: { userId: req.user.id },
        orderBy: { isPrimary: "desc" },
      });

      await prisma.user.update({
        where: { id: req.user.id },
        data: { currentOrgId: nextOrg?.organizationId || null },
      });
    }

    res.json({ message: "Left organization" });
  } catch (err) {
    console.error("❌ DELETE /api/user/organizations/:id/leave error:", err);
    res.status(500).json({ error: "Failed to leave organization" });
  }
});

/**
 * PATCH /api/user/organizations/:id/primary
 * Set an organization as primary
 */
router.patch("/:id/primary", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify membership
    const membership = await prisma.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: id,
        },
      },
    });

    if (!membership) {
      return res.status(404).json({ error: "Membership not found" });
    }

    // Update all memberships in transaction
    await prisma.$transaction([
      // Unset all as primary
      prisma.userOrganization.updateMany({
        where: { userId: req.user.id },
        data: { isPrimary: false },
      }),
      // Set this one as primary
      prisma.userOrganization.update({
        where: {
          userId_organizationId: {
            userId: req.user.id,
            organizationId: id,
          },
        },
        data: { isPrimary: true },
      }),
    ]);

    res.json({ message: "Primary organization updated" });
  } catch (err) {
    console.error("❌ PATCH /api/user/organizations/:id/primary error:", err);
    res.status(500).json({ error: "Failed to update primary organization" });
  }
});

module.exports = router;
