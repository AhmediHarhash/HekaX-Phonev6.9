// ============================================================================
// HEKAX Phone - Base Calendar Provider
// Abstract class for all calendar integrations
// ============================================================================

class BaseCalendarProvider {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
    this.calendarId = null;
    this.organizationId = null;
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
    this.calendarId = config.calendarId;
    this.organizationId = config.organizationId;
    this.prisma = config.prisma;
    this.initialized = true;

    // Check if token needs refresh
    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }
  }

  // ===========================================================================
  // TOKEN MANAGEMENT
  // ===========================================================================
  isTokenExpired() {
    if (!this.expiresAt) return true;
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

    // Update in database
    await this.prisma.calendarIntegration.updateMany({
      where: { organizationId: this.organizationId },
      data: {
        accessToken,
        refreshToken,
        tokenExpiresAt: expiresAt,
      },
    });
  }

  // ===========================================================================
  // ABSTRACT METHODS (Must be implemented by subclasses)
  // ===========================================================================

  /**
   * Get available time slots for a given date
   * @param {Date} date - The date to check
   * @param {number} duration - Appointment duration in minutes
   * @returns {Promise<{available: boolean, slots: Array<{start: Date, end: Date}>}>}
   */
  async getAvailableSlots(date, duration) {
    throw new Error("getAvailableSlots must be implemented by subclass");
  }

  /**
   * Create a calendar event
   * @param {Object} event - Event details
   * @returns {Promise<{eventId: string, eventLink: string, confirmedTime: Date}>}
   */
  async createEvent(event) {
    throw new Error("createEvent must be implemented by subclass");
  }

  /**
   * Update a calendar event
   * @param {string} eventId - The event ID to update
   * @param {Object} updates - Fields to update
   * @returns {Promise<{eventId: string, eventLink: string, confirmedTime: Date}>}
   */
  async updateEvent(eventId, updates) {
    throw new Error("updateEvent must be implemented by subclass");
  }

  /**
   * Delete a calendar event
   * @param {string} eventId - The event ID to delete
   * @param {string} reason - Cancellation reason
   * @returns {Promise<void>}
   */
  async deleteEvent(eventId, reason) {
    throw new Error("deleteEvent must be implemented by subclass");
  }

  /**
   * Get events in a date range
   * @param {Date} startDate - Start of range
   * @param {Date} endDate - End of range
   * @returns {Promise<Array<Object>>}
   */
  async getEvents(startDate, endDate) {
    throw new Error("getEvents must be implemented by subclass");
  }

  /**
   * Get OAuth authorization URL
   * @param {string} redirectUri - OAuth redirect URI
   * @param {string} state - State parameter for security
   * @returns {string}
   */
  static getAuthUrl(redirectUri, state) {
    throw new Error("getAuthUrl must be implemented by subclass");
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code
   * @param {string} redirectUri - OAuth redirect URI
   * @returns {Promise<{accessToken: string, refreshToken: string, expiresAt: Date}>}
   */
  static async exchangeCode(code, redirectUri) {
    throw new Error("exchangeCode must be implemented by subclass");
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Get business hours for availability calculation
   * Default: 9 AM - 5 PM, Monday - Friday
   */
  getBusinessHours() {
    return {
      start: 9, // 9 AM
      end: 17, // 5 PM
      days: [1, 2, 3, 4, 5], // Monday - Friday
      timezone: "America/New_York",
    };
  }

  /**
   * Generate time slots for a given date
   */
  generateTimeSlots(date, duration, busySlots = []) {
    const businessHours = this.getBusinessHours();
    const slots = [];

    // Check if this is a business day
    const dayOfWeek = date.getDay();
    if (!businessHours.days.includes(dayOfWeek)) {
      return slots;
    }

    // Generate slots every 30 minutes
    const slotInterval = 30;
    let currentTime = new Date(date);
    currentTime.setHours(businessHours.start, 0, 0, 0);

    const endTime = new Date(date);
    endTime.setHours(businessHours.end, 0, 0, 0);

    while (currentTime < endTime) {
      const slotEnd = new Date(currentTime.getTime() + duration * 60000);

      // Check if slot conflicts with any busy time
      const isAvailable = !busySlots.some((busy) => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return currentTime < busyEnd && slotEnd > busyStart;
      });

      if (isAvailable && slotEnd <= endTime) {
        slots.push({
          start: new Date(currentTime),
          end: slotEnd,
          formatted: this.formatTimeSlot(currentTime, slotEnd),
        });
      }

      currentTime.setMinutes(currentTime.getMinutes() + slotInterval);
    }

    return slots;
  }

  formatTimeSlot(start, end) {
    const options = { hour: "numeric", minute: "2-digit", hour12: true };
    const startStr = start.toLocaleTimeString("en-US", options);
    const endStr = end.toLocaleTimeString("en-US", options);
    return `${startStr} - ${endStr}`;
  }
}

module.exports = BaseCalendarProvider;
