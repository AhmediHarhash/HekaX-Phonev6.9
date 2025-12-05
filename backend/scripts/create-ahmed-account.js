// ============================================================================
// Create Ahmed Ibrahim Account - SCALE Plan with Twilio Integration
// ============================================================================

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Creating Ahmed Ibrahim account with SCALE plan...\n");

  // Get Twilio credentials from environment
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWIML_APP_SID = process.env.TWIML_APP_SID;
  const TWILIO_NUMBER = process.env.TWILIO_NUMBER || "+16204669796";

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error("❌ Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in environment");
    process.exit(1);
  }

  // Hash password
  const passwordHash = await bcrypt.hash("Cosomac100", 10);

  // Calculate dates
  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + 365); // 365 days from now

  const billingPeriodStart = new Date(now);
  const billingPeriodEnd = new Date(now);
  billingPeriodEnd.setDate(billingPeriodEnd.getDate() + 365);

  const usageResetAt = new Date(now);
  usageResetAt.setMonth(usageResetAt.getMonth() + 1);

  // Create organization first
  const organization = await prisma.organization.create({
    data: {
      name: "Hekax",
      slug: "hekax",
      status: "ACTIVE",
      onboardingCompleted: true,
      industry: "Ai Solutions Agency",

      // Twilio - connected to main account (from env)
      twilioNumber: TWILIO_NUMBER,
      twilioAccountSid: TWILIO_ACCOUNT_SID,
      twilioAuthToken: TWILIO_AUTH_TOKEN,
      twimlAppSid: TWIML_APP_SID,

      // AI Settings
      aiEnabled: true,
      voiceProvider: "openai",
      voiceId: "nova",
      personality: "professional",
      language: "en-US",
      maxCallDuration: 1800, // 30 minutes
      maxTurns: 50,
      aiModel: "gpt-4o",
      aiTemperature: 0.7,

      // Timezone
      timezone: "America/New_York",

      // SCALE Plan settings
      plan: "SCALE",
      billingCycle: "monthly",
      trialEndsAt: trialEndsAt,
      billingPeriodStart: billingPeriodStart,
      billingPeriodEnd: billingPeriodEnd,

      // SCALE limits (maxed out)
      monthlyCallMinutes: 8000,
      monthlyAIMinutes: 4000,
      maxUsers: 20,
      maxPhoneNumbers: 5,

      // Usage tracking
      usedCallMinutes: 0,
      usedAIMinutes: 0,
      usageResetAt: usageResetAt,

      // Overage settings (SCALE plan)
      overageEnabled: true,
      overageCapCents: 25000, // $250 cap

      // Data retention (SCALE tier - extended)
      retentionCallDays: 180,
      retentionTranscriptDays: 180,
      retentionRecordingDays: 180,
      retentionLeadDays: 730, // 2 years
      retentionAuditDays: 730,
      retentionEnabled: true,

      // Enterprise features enabled
      byoKeysEnabled: true,
    },
  });

  console.log("✅ Organization created:", organization.id);
  console.log("   Name:", organization.name);
  console.log("   Slug:", organization.slug);
  console.log("   Plan:", organization.plan);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: "xilesto@gmail.com",
      passwordHash: passwordHash,
      name: "Ahmed Ibrahim",
      status: "ACTIVE",
      timezone: "America/New_York",
      language: "en",
      emailNotifications: true,
      organizationId: organization.id,
      currentOrgId: organization.id,
      twilioIdentity: `user_${Date.now()}`,
    },
  });

  console.log("\n✅ User created:", user.id);
  console.log("   Email:", user.email);
  console.log("   Name:", user.name);

  // Create user-organization membership with OWNER role
  const membership = await prisma.userOrganization.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      role: "OWNER",
      isPrimary: true,
      acceptedAt: now,
    },
  });

  console.log("\n✅ Membership created with OWNER role");

  // Add phone number to organization
  const phoneNumber = await prisma.phoneNumber.create({
    data: {
      number: TWILIO_NUMBER,
      friendlyName: "Main Line",
      organizationId: organization.id,
      routeToAI: true,
      status: "active",
      capabilities: {
        voice: true,
        sms: true,
        mms: false,
      },
    },
  });

  console.log("\n✅ Phone number added:", phoneNumber.number);

  console.log("\n" + "=".repeat(60));
  console.log("🎉 ACCOUNT SETUP COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📋 Account Details:");
  console.log("   Email: xilesto@gmail.com");
  console.log("   Password: Cosomac100");
  console.log("   Organization: Hekax");
  console.log("   Plan: SCALE (Enterprise tier)");
  console.log("   Phone:", TWILIO_NUMBER);
  console.log("   Trial Ends: " + trialEndsAt.toDateString() + " (365 days)");
  console.log("\n📦 SCALE Plan Limits:");
  console.log("   • 8,000 call minutes/month");
  console.log("   • 4,000 AI minutes/month");
  console.log("   • 20 team members");
  console.log("   • 5 phone numbers");
  console.log("   • 180-day recording retention");
  console.log("   • 5 concurrent calls");
  console.log("\n🔓 Enterprise Features Enabled:");
  console.log("   • BYO API Keys");
  console.log("   • API Access");
  console.log("   • White-label");
  console.log("   • Custom Domain");
  console.log("   • Data Export");
  console.log("   • Multi-Org Support");
  console.log("\n🔗 Twilio Connected:");
  console.log("   • Using credentials from environment");
  console.log("   • Phone:", TWILIO_NUMBER);
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
