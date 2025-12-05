// ============================================================================
// HEKAX Phone - Spam Call Filter Service
// Filters known spam/robocall numbers
// ============================================================================

// Known spam prefixes and patterns for US numbers
const SPAM_PATTERNS = {
  // Toll-free numbers often used for robocalls
  tollFreeSpam: /^\+1(800|888|877|866|855|844|833)/,

  // Known spam area codes (high spam volume)
  highSpamAreaCodes: [
    "202", // Washington DC - IRS scams
    "347", // New York - frequent scam calls
    "404", // Atlanta
    "213", // Los Angeles
    "312", // Chicago
    "469", // Dallas - tech support scams
    "832", // Houston
    "929", // New York
  ],

  // Patterns that indicate spoofed numbers
  suspiciousPatterns: [
    /^\+1(\d)\1{9}$/, // All same digits like +11111111111
    /^\+1123456789\d$/, // Sequential numbers
    /^\+10{10}$/, // All zeros
  ],
};

// Known spam number database (add to this list)
const KNOWN_SPAM_NUMBERS = new Set([
  // Add specific known spam numbers here
  // "+18001234567",
]);

// Twilio Lookup API for spam detection (if enabled)
class SpamFilterService {
  constructor() {
    this.enabled = process.env.SPAM_FILTER_ENABLED !== "false";
    this.blockTollFree = process.env.BLOCK_TOLL_FREE === "true";
    this.twilioClient = null;
    this.useTwilioLookup = process.env.TWILIO_LOOKUP_ENABLED === "true";

    if (this.useTwilioLookup) {
      const twilio = require("twilio");
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }
  }

  /**
   * Check if a phone number is likely spam
   * @param {string} phoneNumber - E.164 format phone number
   * @returns {Promise<{isSpam: boolean, reason: string|null, confidence: number}>}
   */
  async checkNumber(phoneNumber) {
    if (!this.enabled) {
      return { isSpam: false, reason: null, confidence: 0 };
    }

    // 1. Check known spam database
    if (KNOWN_SPAM_NUMBERS.has(phoneNumber)) {
      return {
        isSpam: true,
        reason: "known_spam_number",
        confidence: 1.0,
      };
    }

    // 2. Check suspicious patterns
    for (const pattern of SPAM_PATTERNS.suspiciousPatterns) {
      if (pattern.test(phoneNumber)) {
        return {
          isSpam: true,
          reason: "suspicious_pattern",
          confidence: 0.9,
        };
      }
    }

    // 3. Check toll-free (optional blocking)
    if (this.blockTollFree && SPAM_PATTERNS.tollFreeSpam.test(phoneNumber)) {
      return {
        isSpam: true,
        reason: "toll_free_blocked",
        confidence: 0.7,
      };
    }

    // 4. Check high-spam area codes (flag but don't block)
    const areaCode = phoneNumber.replace(/^\+1/, "").substring(0, 3);
    const isHighSpamArea = SPAM_PATTERNS.highSpamAreaCodes.includes(areaCode);

    // 5. Use Twilio Lookup API for carrier info (if enabled)
    if (this.useTwilioLookup && this.twilioClient) {
      try {
        const lookup = await this.twilioClient.lookups.v2
          .phoneNumbers(phoneNumber)
          .fetch({ fields: "line_type_intelligence" });

        // VoIP numbers are higher spam risk
        if (lookup.lineTypeIntelligence?.type === "voip") {
          return {
            isSpam: false, // Don't block, but flag
            reason: "voip_number",
            confidence: 0.5,
            metadata: {
              lineType: lookup.lineTypeIntelligence.type,
              carrier: lookup.lineTypeIntelligence.carrier_name,
            },
          };
        }
      } catch (error) {
        console.warn("⚠️ Twilio Lookup failed:", error.message);
      }
    }

    return {
      isSpam: false,
      reason: isHighSpamArea ? "high_spam_area" : null,
      confidence: isHighSpamArea ? 0.3 : 0,
    };
  }

  /**
   * Add a number to the spam list
   * @param {string} phoneNumber
   */
  addToSpamList(phoneNumber) {
    KNOWN_SPAM_NUMBERS.add(phoneNumber);
    console.log(`🚫 Added ${phoneNumber} to spam list`);
  }

  /**
   * Remove a number from the spam list
   * @param {string} phoneNumber
   */
  removeFromSpamList(phoneNumber) {
    KNOWN_SPAM_NUMBERS.delete(phoneNumber);
    console.log(`✅ Removed ${phoneNumber} from spam list`);
  }

  /**
   * Get spam list size
   */
  getSpamListSize() {
    return KNOWN_SPAM_NUMBERS.size;
  }
}

// Singleton instance
const spamFilter = new SpamFilterService();

module.exports = { spamFilter, SpamFilterService };
