// ============================================================================
// HEKAX Phone - Security Middleware
// Comprehensive security layer for enterprise-grade protection
// ============================================================================

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

// ============================================================================
// ENVIRONMENT VALIDATION
// Fail fast if critical secrets are missing
// ============================================================================

function validateSecurityEnvironment() {
  const required = [
    "JWT_SECRET",
    "ENCRYPTION_KEY",
    "DATABASE_URL",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ CRITICAL: Missing required security environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\n⚠️  Server cannot start without these variables.");
    console.error("   Please check your .env file.\n");
    process.exit(1);
  }

  // Validate JWT_SECRET strength (minimum 32 characters)
  if (process.env.JWT_SECRET.length < 32) {
    console.error("❌ CRITICAL: JWT_SECRET must be at least 32 characters");
    process.exit(1);
  }

  // Check for default/weak secrets
  const weakSecrets = [
    "hekax-super-secret-change-in-prod",
    "hekax-default-key-change-in-prod!",
    "secret",
    "password",
    "123456",
  ];

  if (weakSecrets.some((weak) => process.env.JWT_SECRET.includes(weak))) {
    console.error("❌ CRITICAL: JWT_SECRET appears to be a default/weak value");
    process.exit(1);
  }

  if (weakSecrets.some((weak) => process.env.ENCRYPTION_KEY.includes(weak))) {
    console.error("❌ CRITICAL: ENCRYPTION_KEY appears to be a default/weak value");
    process.exit(1);
  }

  console.log("✅ Security environment validated");
}

// ============================================================================
// SECURITY HEADERS (Helmet)
// ============================================================================

const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'",
        "https://api.stripe.com",
        "https://api.openai.com",
        "https://api.twilio.com",
        "wss://*.twilio.com",
        process.env.PUBLIC_BASE_URL || "https://phoneapi.hekax.com",
      ],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
    },
  },
  // Prevent clickjacking
  frameguard: { action: "deny" },
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // Strict Transport Security (HTTPS only)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // Prevent MIME type sniffing
  noSniff: true,
  // XSS Protection
  xssFilter: true,
  // Referrer Policy
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

// ============================================================================
// RATE LIMITING
// ============================================================================

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.resetTime > 0) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Create a custom rate limiter with better tracking
 */
function createRateLimiter(options) {
  const {
    windowMs = 60 * 1000, // 1 minute default
    max = 100,
    keyGenerator = (req) => req.ip,
    handler = null,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return (req, res, next) => {
    const key = `ratelimit:${options.name || "default"}:${keyGenerator(req)}`;
    const now = Date.now();

    let data = rateLimitStore.get(key);

    if (!data || now > data.resetTime) {
      data = {
        count: 0,
        resetTime: now + windowMs,
        blocked: false,
      };
    }

    data.count++;
    rateLimitStore.set(key, data);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - data.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(data.resetTime / 1000));

    if (data.count > max) {
      const retryAfter = Math.ceil((data.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfter);

      if (handler) {
        return handler(req, res, next);
      }

      return res.status(429).json({
        error: "Too many requests",
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    // Track success/failure for conditional skipping
    const originalEnd = res.end;
    res.end = function (...args) {
      if (skipSuccessfulRequests && res.statusCode < 400) {
        data.count--;
        rateLimitStore.set(key, data);
      }
      if (skipFailedRequests && res.statusCode >= 400) {
        data.count--;
        rateLimitStore.set(key, data);
      }
      return originalEnd.apply(this, args);
    };

    next();
  };
}

// Authentication rate limiter (stricter)
const authLimiter = createRateLimiter({
  name: "auth",
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  keyGenerator: (req) => {
    // Rate limit by IP + email combination for login
    const email = req.body?.email?.toLowerCase() || "";
    return `${req.ip}:${email}`;
  },
  handler: (req, res) => {
    console.log(`⚠️ Rate limit exceeded for auth: ${req.ip}`);
    return res.status(429).json({
      error: "Too many authentication attempts",
      message: "Please wait 15 minutes before trying again.",
      retryAfter: 900,
    });
  },
});

// Registration rate limiter
const registerLimiter = createRateLimiter({
  name: "register",
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    console.log(`⚠️ Rate limit exceeded for registration: ${req.ip}`);
    return res.status(429).json({
      error: "Too many registration attempts",
      message: "Please wait before creating another account.",
      retryAfter: 3600,
    });
  },
});

// API rate limiter (general)
const apiLimiter = createRateLimiter({
  name: "api",
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Webhook rate limiter (more permissive for Twilio)
const webhookLimiter = createRateLimiter({
  name: "webhook",
  windowMs: 60 * 1000,
  max: 500, // Higher limit for webhooks
  keyGenerator: (req) => req.ip,
});

// Password reset rate limiter
const passwordResetLimiter = createRateLimiter({
  name: "password-reset",
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  keyGenerator: (req) => req.body?.email?.toLowerCase() || req.ip,
});

// ============================================================================
// ACCOUNT LOCKOUT
// ============================================================================

const lockoutStore = new Map();

/**
 * Check if account is locked
 */
function isAccountLocked(email) {
  const key = `lockout:${email.toLowerCase()}`;
  const data = lockoutStore.get(key);

  if (!data) return false;

  // Check if lockout has expired
  if (Date.now() > data.lockedUntil) {
    lockoutStore.delete(key);
    return false;
  }

  return true;
}

/**
 * Get remaining lockout time in seconds
 */
function getLockoutRemaining(email) {
  const key = `lockout:${email.toLowerCase()}`;
  const data = lockoutStore.get(key);

  if (!data) return 0;

  const remaining = Math.ceil((data.lockedUntil - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Record a failed login attempt
 * Returns true if account is now locked
 */
function recordFailedLogin(email) {
  const key = `lockout:${email.toLowerCase()}`;
  const now = Date.now();

  let data = lockoutStore.get(key);

  if (!data || now > data.resetTime) {
    data = {
      attempts: 0,
      resetTime: now + 15 * 60 * 1000, // Reset after 15 minutes of no attempts
      lockedUntil: 0,
    };
  }

  data.attempts++;

  // Lock after 5 failed attempts
  if (data.attempts >= 5) {
    data.lockedUntil = now + 15 * 60 * 1000; // Lock for 15 minutes
    console.log(`🔒 Account locked: ${email} (${data.attempts} failed attempts)`);
  }

  lockoutStore.set(key, data);

  return data.attempts >= 5;
}

/**
 * Clear failed attempts on successful login
 */
function clearFailedLogins(email) {
  const key = `lockout:${email.toLowerCase()}`;
  lockoutStore.delete(key);
}

/**
 * Account lockout middleware
 */
function checkAccountLockout(req, res, next) {
  const email = req.body?.email;

  if (!email) {
    return next();
  }

  if (isAccountLocked(email)) {
    const remaining = getLockoutRemaining(email);
    return res.status(423).json({
      error: "Account temporarily locked",
      message: `Too many failed login attempts. Try again in ${Math.ceil(remaining / 60)} minutes.`,
      retryAfter: remaining,
    });
  }

  next();
}

// ============================================================================
// REQUEST SANITIZATION
// ============================================================================

/**
 * Sanitize string input to prevent XSS
 */
function sanitizeString(str) {
  if (typeof str !== "string") return str;

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Deep sanitize object
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return sanitizeString(obj);
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }
  return sanitized;
}

/**
 * Request body sanitization middleware
 */
function sanitizeRequest(req, res, next) {
  // Sanitize body (but not for raw webhook payloads)
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    // Don't sanitize password fields
    const { password, passwordHash, ...rest } = req.body;
    req.body = {
      ...sanitizeObject(rest),
      ...(password !== undefined && { password }),
      ...(passwordHash !== undefined && { passwordHash }),
    };
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
}

// ============================================================================
// REQUEST LOGGING
// ============================================================================

/**
 * Security-focused request logging
 */
function securityLogger(req, res, next) {
  const startTime = Date.now();

  // Log request (excluding sensitive data)
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get("user-agent")?.substring(0, 100),
    userId: req.user?.id || null,
    orgId: req.organizationId || null,
  };

  // Log response on finish
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? "warn" : "info";

    // Log security-relevant events
    if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
      console.log(`🔐 Security event: ${res.statusCode} ${req.method} ${req.path} [${duration}ms] IP: ${logData.ip}`);
    }
  });

  next();
}

// ============================================================================
// SUSPICIOUS ACTIVITY DETECTION
// ============================================================================

const suspiciousPatterns = [
  /(\.\.|\/\/)/,           // Path traversal
  /<script/i,              // XSS attempt
  /javascript:/i,          // XSS attempt
  /on\w+\s*=/i,            // Event handler injection
  /union.*select/i,        // SQL injection
  /;\s*drop\s+table/i,     // SQL injection
  /'\s*or\s+'1'\s*=\s*'1/i, // SQL injection
];

/**
 * Detect suspicious request patterns
 */
function detectSuspiciousActivity(req, res, next) {
  const checkValue = (value) => {
    if (typeof value !== "string") return false;
    return suspiciousPatterns.some((pattern) => pattern.test(value));
  };

  const checkObject = (obj) => {
    if (!obj || typeof obj !== "object") return false;
    return Object.values(obj).some((value) => {
      if (typeof value === "string") return checkValue(value);
      if (typeof value === "object") return checkObject(value);
      return false;
    });
  };

  // Check URL, query, and body
  if (checkValue(req.url) || checkObject(req.query) || checkObject(req.body)) {
    console.warn(`⚠️ Suspicious request detected from ${req.ip}: ${req.method} ${req.path}`);

    // Log but don't block (could be false positive)
    // In stricter mode, you could return 400 here
  }

  next();
}

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

function getCorsOrigins() {
  const origins = [process.env.FRONTEND_URL || "https://phone.hekax.com"];

  // Only allow localhost in development
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:5173");
    origins.push("http://localhost:3000");
  }

  return origins;
}

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getCorsOrigins();

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`⚠️ CORS blocked origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Organization-Id", "X-Request-Id"],
  exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  maxAge: 600, // Cache preflight for 10 minutes
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Environment validation
  validateSecurityEnvironment,

  // Headers
  securityHeaders,

  // Rate limiting
  authLimiter,
  registerLimiter,
  apiLimiter,
  webhookLimiter,
  passwordResetLimiter,
  createRateLimiter,

  // Account lockout
  isAccountLocked,
  getLockoutRemaining,
  recordFailedLogin,
  clearFailedLogins,
  checkAccountLockout,

  // Sanitization
  sanitizeString,
  sanitizeObject,
  sanitizeRequest,

  // Logging
  securityLogger,

  // Detection
  detectSuspiciousActivity,

  // CORS
  getCorsOrigins,
  corsOptions,
};
