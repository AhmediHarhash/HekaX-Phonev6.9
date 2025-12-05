// ============================================================================
// HEKAX Phone - Base CRM Provider
// Abstract class for all CRM integrations
// ============================================================================

class BaseCRMProvider {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
    this.instanceUrl = null;
    this.apiKey = null;
    this.organizationId = null;
    this.integrationId = null;
    this.settings = {};
    this.prisma = null;
    this.initialized = false;
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  async initialize(config) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.expiresAt = config.expiresAt;
    this.instanceUrl = config.instanceUrl;
    this.apiKey = config.apiKey;
    this.webhookUrl = config.webhookUrl;
    this.organizationId = config.organizationId;
    this.integrationId = config.integrationId;
    this.settings = config.settings || {};
    this.prisma = config.prisma;
    this.initialized = true;

    // Check if token needs refresh
    if (this.refreshToken && this.isTokenExpired()) {
      await this.refreshAccessToken();
    }
  }

  // ===========================================================================
  // TOKEN MANAGEMENT
  // ===========================================================================
  isTokenExpired() {
    if (!this.expiresAt) return false;
    const now = new Date();
    const expiry = new Date(this.expiresAt);
    // Refresh if expires in less than 5 minutes
    return now.getTime() > expiry.getTime() - 5 * 60 * 1000;
  }

  async refreshAccessToken() {
    throw new Error("refreshAccessToken must be implemented by subclass");
  }

  async saveTokens(accessToken, refreshToken, expiresAt) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiresAt = expiresAt;

    await this.prisma.crmIntegration.update({
      where: { id: this.integrationId },
      data: {
        accessToken,
        refreshToken,
        tokenExpiresAt: expiresAt,
      },
    });
  }

  // ===========================================================================
  // ABSTRACT METHODS - CONTACTS
  // ===========================================================================

  /**
   * Create or update a contact in the CRM
   */
  async createOrUpdateContact(contact) {
    throw new Error("createOrUpdateContact must be implemented by subclass");
  }

  /**
   * Find a contact by phone number
   */
  async findContactByPhone(phone) {
    throw new Error("findContactByPhone must be implemented by subclass");
  }

  /**
   * Find a contact by email
   */
  async findContactByEmail(email) {
    throw new Error("findContactByEmail must be implemented by subclass");
  }

  /**
   * Update an existing contact
   */
  async updateContact(contactId, updates) {
    throw new Error("updateContact must be implemented by subclass");
  }

  // ===========================================================================
  // ABSTRACT METHODS - ACTIVITIES
  // ===========================================================================

  /**
   * Create a call activity/engagement
   */
  async createCallActivity(callData) {
    throw new Error("createCallActivity must be implemented by subclass");
  }

  /**
   * Create a meeting/appointment
   */
  async createMeeting(meetingData) {
    throw new Error("createMeeting must be implemented by subclass");
  }

  /**
   * Create a note on a contact
   */
  async createNote(contactId, noteContent) {
    throw new Error("createNote must be implemented by subclass");
  }

  // ===========================================================================
  // ABSTRACT METHODS - DEALS/OPPORTUNITIES
  // ===========================================================================

  /**
   * Create a deal/opportunity
   */
  async createDeal(dealData) {
    throw new Error("createDeal must be implemented by subclass");
  }

  // ===========================================================================
  // OAUTH METHODS (Static)
  // ===========================================================================

  /**
   * Get OAuth authorization URL
   */
  static getAuthUrl(redirectUri, state) {
    throw new Error("getAuthUrl must be implemented by subclass");
  }

  /**
   * Exchange authorization code for tokens
   */
  static async exchangeCode(code, redirectUri) {
    throw new Error("exchangeCode must be implemented by subclass");
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Normalize phone number for comparison
   */
  normalizePhone(phone) {
    if (!phone) return null;
    // Remove all non-digits
    return phone.replace(/\D/g, "");
  }

  /**
   * Format phone for CRM (E.164)
   */
  formatPhoneE164(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      return `+${digits}`;
    }
    return phone;
  }
}

module.exports = BaseCRMProvider;
