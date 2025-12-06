// ============================================================================
// HEKAX Phone - Test Setup
// ============================================================================

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.NODE_ENV = 'test';

// Increase default timeout for async operations
jest.setTimeout(10000);

// Global test utilities
global.testUtils = {
  // Create a mock user for testing
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@hekax.com',
    name: 'Test User',
    role: 'ADMIN',
    organizationId: 'test-org-id',
    ...overrides,
  }),

  // Create a mock organization for testing
  createMockOrg: (overrides = {}) => ({
    id: 'test-org-id',
    name: 'Test Organization',
    plan: 'STARTER',
    onboardingCompleted: true,
    ...overrides,
  }),

  // Create mock JWT token
  createMockToken: (userId = 'test-user-id') => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { userId, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },
};

// Suppress console logs during tests (optional)
if (process.env.SUPPRESS_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
}

// Clean up after all tests
afterAll(async () => {
  // Clean up cache service
  const { cache } = require('../lib/cache');
  cache.destroy();
});
