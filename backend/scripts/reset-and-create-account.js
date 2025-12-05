// ============================================================================
// Reset Database and Create Fresh Account
// Run with: node scripts/reset-and-create-account.js
// ============================================================================

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  Clearing all data...\n");

  // Delete in correct order (respect foreign keys)
  const deletions = [
    { name: "DataExportRequest", fn: () => prisma.dataExportRequest.deleteMany() },
    { name: "CleanupLog", fn: () => prisma.cleanupLog.deleteMany() },
    { name: "AddOnPurchase", fn: () => prisma.addOnPurchase.deleteMany() },
    { name: "ApiKey", fn: () => prisma.apiKey.deleteMany() },
    { name: "UsageAlert", fn: () => prisma.usageAlert.deleteMany() },
    { name: "Invoice", fn: () => prisma.invoice.deleteMany() },
    { name: "AuditLog", fn: () => prisma.auditLog.deleteMany() },
    { name: "UsageLog", fn: () => prisma.usageLog.deleteMany() },
    { name: "Lead", fn: () => prisma.lead.deleteMany() },
    { name: "Transcript", fn: () => prisma.transcript.deleteMany() },
    { name: "CallLog", fn: () => prisma.callLog.deleteMany() },
    { name: "PhoneNumber", fn: () => prisma.phoneNumber.deleteMany() },
    { name: "UserOrganization", fn: () => prisma.userOrganization.deleteMany() },
    { name: "User", fn: () => prisma.user.deleteMany() },
    { name: "Organization", fn: () => prisma.organization.deleteMany() },
  ];

  for (const { name, fn } of deletions) {
    const result = await fn();
    console.log(`  ✓ Deleted ${result.count} ${name} records`);
  }

  console.log("\n✅ All data cleared!\n");

  // ============================================================================
  // CREATE NEW ACCOUNT
  // ============================================================================

  // Account details - CHANGE THESE
  const ACCOUNT = {
    // User
    name: "Ahmed Ibrahim",
    email: "ahmed.harhash@hekax.com",
    password: "Cosomac100,",

    // Organization
    orgName: "Hekax",
    orgSlug: "hekax", // This becomes the client identity: hekax-web

    // Phone
    twilioNumber: "+16204669796",

    // AI Settings
    greeting: "Thank you for calling Hekax. How may I help you today?",
    voiceId: "nova",

    // Plan
    plan: "SCALE",
  };

  console.log("📝 Creating new account...\n");

  // Hash password
  const passwordHash = await bcrypt.hash(ACCOUNT.password, 12);

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: ACCOUNT.orgName,
      slug: ACCOUNT.orgSlug,
      status: "ACTIVE",
      onboardingCompleted: true,
      twilioNumber: ACCOUNT.twilioNumber,
      twilioProvisioned: true,
      aiEnabled: true,
      voiceId: ACCOUNT.voiceId,
      greeting: ACCOUNT.greeting,
      plan: ACCOUNT.plan,
      monthlyCallMinutes: 5000,  // SCALE plan limits
      monthlyAIMinutes: 2000,
      maxUsers: 20,
      maxPhoneNumbers: 10,
    },
  });

  console.log(`  ✓ Organization created: ${org.name} (${org.id})`);
  console.log(`    Slug: ${org.slug}`);
  console.log(`    Client Identity: ${org.slug}-web`);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: ACCOUNT.email,
      passwordHash,
      name: ACCOUNT.name,
      status: "ACTIVE",
      organizationId: org.id,
      currentOrgId: org.id,
    },
  });

  console.log(`  ✓ User created: ${user.name} (${user.email})`);

  // Create membership
  await prisma.userOrganization.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: "OWNER",
      isPrimary: true,
      acceptedAt: new Date(),
    },
  });

  console.log(`  ✓ Membership created: OWNER role`);

  // Create phone number record
  await prisma.phoneNumber.create({
    data: {
      number: ACCOUNT.twilioNumber,
      friendlyName: "Main Line",
      routeToAI: true,
      status: "active",
      organizationId: org.id,
    },
  });

  console.log(`  ✓ Phone number registered: ${ACCOUNT.twilioNumber}`);

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log("\n" + "=".repeat(60));
  console.log("✅ ACCOUNT CREATED SUCCESSFULLY!");
  console.log("=".repeat(60));
  console.log(`
📧 Email:    ${ACCOUNT.email}
🔑 Password: ${ACCOUNT.password}

🏢 Organization: ${ACCOUNT.orgName}
📱 Phone:        ${ACCOUNT.twilioNumber}

🎯 Twilio Client Identity: ${org.slug}-web

📋 Update in Twilio Console:
   TwiML Bin should use: <Client>${org.slug}-web</Client>
`);
  console.log("=".repeat(60));
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
