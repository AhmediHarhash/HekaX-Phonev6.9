// ============================================================================
// HEKAX Phone - Input Validation Middleware
// Using Joi for schema validation
// ============================================================================

const Joi = require("joi");

// ============================================================================
// COMMON PATTERNS
// ============================================================================

const patterns = {
  // UUID v4 pattern
  uuid: Joi.string().uuid({ version: "uuidv4" }),

  // Email with normalization
  email: Joi.string().email().lowercase().trim().max(255),

  // Password requirements
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.max": "Password must be at most 128 characters",
      "string.pattern.base": "Password must contain at least one lowercase letter, one uppercase letter, and one number",
    }),

  // Simple password (less strict, for existing users)
  simplePassword: Joi.string().min(6).max(128),

  // Name fields
  name: Joi.string().trim().min(1).max(100).pattern(/^[a-zA-Z\s\-']+$/),

  // Organization name (allows more characters)
  orgName: Joi.string().trim().min(2).max(100),

  // Phone number (E.164 format preferred)
  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .messages({
      "string.pattern.base": "Invalid phone number format",
    }),

  // URL validation
  url: Joi.string().uri({ scheme: ["http", "https"] }).max(500),

  // Slug (URL-safe string)
  slug: Joi.string()
    .pattern(/^[a-z0-9-]+$/)
    .min(2)
    .max(50),

  // Color hex code
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),

  // Safe text (no HTML/scripts)
  safeText: Joi.string().max(5000).replace(/<[^>]*>/g, ""),

  // Notes/description field
  notes: Joi.string().max(10000).allow("", null),
};

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

const authSchemas = {
  register: Joi.object({
    email: patterns.email.required(),
    password: patterns.simplePassword.required(), // Using simpler password for now
    name: Joi.string().trim().min(1).max(100).required(),
    orgName: patterns.orgName,
    organizationName: patterns.orgName,
  }).or("orgName", "organizationName"),

  login: Joi.object({
    email: patterns.email.required(),
    password: Joi.string().required(),
  }),

  passwordReset: Joi.object({
    email: patterns.email.required(),
  }),

  passwordChange: Joi.object({
    token: Joi.string().required(),
    password: patterns.simplePassword.required(),
  }),
};

// ============================================================================
// TEAM SCHEMAS
// ============================================================================

const teamSchemas = {
  invite: Joi.object({
    email: patterns.email.required(),
    name: Joi.string().trim().min(1).max(100).required(),
    role: Joi.string().valid("AGENT", "MANAGER", "ADMIN").default("AGENT"),
  }),

  update: Joi.object({
    role: Joi.string().valid("AGENT", "MANAGER", "ADMIN", "OWNER"),
    status: Joi.string().valid("ACTIVE", "INACTIVE", "SUSPENDED"),
  }),
};

// ============================================================================
// ORGANIZATION SCHEMAS
// ============================================================================

const organizationSchemas = {
  update: Joi.object({
    name: patterns.orgName,
    greeting: Joi.string().max(500),
    aiEnabled: Joi.boolean(),
    voiceId: Joi.string().max(50),
    personality: Joi.string().max(200),
    language: Joi.string().max(10),
    timezone: Joi.string().max(50),
    primaryColor: patterns.color,
    secondaryColor: patterns.color,
    logoUrl: patterns.url.allow("", null),
    slackWebhookUrl: patterns.url.allow("", null),
    businessHours: Joi.object().unknown(true),
    afterHoursMode: Joi.string().valid("voicemail", "ai", "forward"),
    afterHoursGreeting: Joi.string().max(500),
    onboardingCompleted: Joi.boolean(),
    industry: Joi.string().max(100),
    pendingPhoneNumber: patterns.phone.allow("", null),
    // Aliases
    aiGreeting: Joi.string().max(500),
    aiVoiceId: Joi.string().max(50),
    aiPersonality: Joi.string().max(200),
    afterHoursMessage: Joi.string().max(500),
  }),
};

// ============================================================================
// LEAD SCHEMAS
// ============================================================================

const leadSchemas = {
  update: Joi.object({
    status: Joi.string().valid(
      "NEW",
      "CONTACTED",
      "QUALIFIED",
      "PROPOSAL",
      "NEGOTIATION",
      "WON",
      "LOST",
      "UNQUALIFIED"
    ),
    urgency: Joi.string().valid("HIGH", "MEDIUM", "LOW"),
    temperature: Joi.string().valid("HOT", "WARM", "COLD"),
    notes: patterns.notes,
    assignedToId: Joi.string().uuid().allow(null),
    name: Joi.string().max(100),
    email: patterns.email.allow("", null),
    phone: patterns.phone.allow("", null),
    company: Joi.string().max(100),
  }),

  query: Joi.object({
    status: Joi.string(),
    urgency: Joi.string(),
    limit: Joi.number().integer().min(1).max(500).default(50),
  }),
};

// ============================================================================
// PHONE NUMBER SCHEMAS
// ============================================================================

const phoneNumberSchemas = {
  search: Joi.object({
    areaCode: Joi.string().pattern(/^\d{3}$/),
    country: Joi.string().length(2).default("US"),
    type: Joi.string().valid("local", "tollfree", "mobile").default("local"),
    contains: Joi.string().max(10),
    limit: Joi.number().integer().min(1).max(20).default(10),
  }),

  purchase: Joi.object({
    phoneNumber: patterns.phone.required(),
  }),

  update: Joi.object({
    friendlyName: Joi.string().max(100),
    routeToAI: Joi.boolean(),
    routeToUser: Joi.string().uuid().allow(null),
    greeting: Joi.string().max(500),
    voiceId: Joi.string().max(50),
  }),
};

// ============================================================================
// DATA MANAGEMENT SCHEMAS
// ============================================================================

const dataSchemas = {
  retention: Joi.object({
    retentionEnabled: Joi.boolean(),
    retentionCallDays: Joi.number().integer().min(7).max(730),
    retentionTranscriptDays: Joi.number().integer().min(7).max(730),
    retentionRecordingDays: Joi.number().integer().min(7).max(730),
    retentionLeadDays: Joi.number().integer().min(7).max(730),
    retentionAuditDays: Joi.number().integer().min(7).max(730),
  }),

  export: Joi.object({
    type: Joi.string()
      .valid("full_export", "calls_only", "leads_only", "transcripts_only")
      .default("full_export"),
    format: Joi.string().valid("json", "csv").default("json"),
  }),

  deleteAll: Joi.object({
    confirmPhrase: Joi.string().valid("DELETE ALL MY DATA").required(),
  }),
};

// ============================================================================
// API KEY SCHEMAS
// ============================================================================

const apiKeySchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    permissions: Joi.array()
      .items(
        Joi.string().valid(
          "calls:read",
          "calls:write",
          "leads:read",
          "leads:write",
          "transcripts:read",
          "analytics:read",
          "webhooks:manage"
        )
      )
      .default([]),
    expiresInDays: Joi.number().integer().min(1).max(365),
  }),

  update: Joi.object({
    name: Joi.string().trim().min(1).max(100),
    permissions: Joi.array().items(
      Joi.string().valid(
        "calls:read",
        "calls:write",
        "leads:read",
        "leads:write",
        "transcripts:read",
        "analytics:read",
        "webhooks:manage"
      )
    ),
  }),
};

// ============================================================================
// VALIDATION MIDDLEWARE FACTORY
// ============================================================================

/**
 * Create validation middleware for a schema
 * @param {Joi.Schema} schema - Joi schema to validate against
 * @param {string} source - 'body', 'query', or 'params'
 */
function validate(schema, source = "body") {
  return (req, res, next) => {
    const data = req[source];

    const { error, value } = schema.validate(data, {
      abortEarly: false, // Return all errors, not just first
      stripUnknown: true, // Remove unknown fields
      convert: true, // Type coercion
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
    }

    // Replace with validated/sanitized data
    req[source] = value;
    next();
  };
}

/**
 * Validate request body
 */
function validateBody(schema) {
  return validate(schema, "body");
}

/**
 * Validate query parameters
 */
function validateQuery(schema) {
  return validate(schema, "query");
}

/**
 * Validate URL parameters
 */
function validateParams(schema) {
  return validate(schema, "params");
}

// ============================================================================
// ID PARAMETER VALIDATION
// ============================================================================

const idParamSchema = Joi.object({
  id: Joi.string().uuid({ version: "uuidv4" }).required(),
});

function validateIdParam(req, res, next) {
  const { error } = idParamSchema.validate({ id: req.params.id });

  if (error) {
    return res.status(400).json({
      error: "Invalid ID format",
      message: "ID must be a valid UUID",
    });
  }

  next();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Patterns
  patterns,

  // Schemas
  authSchemas,
  teamSchemas,
  organizationSchemas,
  leadSchemas,
  phoneNumberSchemas,
  dataSchemas,
  apiKeySchemas,

  // Middleware factories
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateIdParam,

  // Joi instance for custom schemas
  Joi,
};
