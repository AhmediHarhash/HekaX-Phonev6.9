// ============================================================================
// HEKAX Phone - Encryption Utility
// Phase 6.4: For BYO Keys encryption/decryption
// ============================================================================

const crypto = require("crypto");

// Encryption key should be 32 bytes for AES-256
// IMPORTANT: Set this in environment variables in production!
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "hekax-default-key-change-in-prod!";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Ensure key is exactly 32 bytes
 */
function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY);
  if (key.length === 32) return key;
  // Pad or truncate to 32 bytes
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

/**
 * Encrypt a string value
 * @param {string} plaintext - The value to encrypt
 * @returns {string} - Base64 encoded encrypted value (iv:authTag:ciphertext)
 */
function encrypt(plaintext) {
  if (!plaintext) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext}`;
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedValue - The encrypted value (iv:authTag:ciphertext)
 * @returns {string} - The decrypted plaintext
 */
function decrypt(encryptedValue) {
  if (!encryptedValue) return null;

  try {
    const parts = encryptedValue.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted format");
    }

    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const ciphertext = parts[2];
    const key = getKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext, "base64", "utf8");
    plaintext += decipher.final("utf8");

    return plaintext;
  } catch (error) {
    console.error("Decryption error:", error.message);
    return null;
  }
}

/**
 * Hash an API key for storage
 * @param {string} apiKey - The plain API key
 * @returns {string} - SHA-256 hash
 */
function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Generate a secure API key
 * @param {string} prefix - Key prefix (e.g., "hk_live_")
 * @returns {{ key: string, hash: string, prefix: string }}
 */
function generateApiKey(prefix = "hk_live_") {
  const randomPart = crypto.randomBytes(24).toString("base64url");
  const key = `${prefix}${randomPart}`;
  const hash = hashApiKey(key);
  const keyPrefix = key.substring(0, 12);
  
  return { key, hash, keyPrefix };
}

/**
 * Mask a sensitive value for display
 * @param {string} value - The value to mask
 * @param {number} visibleChars - Number of chars to show at start and end
 * @returns {string} - Masked value
 */
function maskValue(value, visibleChars = 4) {
  if (!value || value.length < visibleChars * 2 + 4) {
    return "••••••••";
  }
  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  return `${start}••••••••${end}`;
}

module.exports = {
  encrypt,
  decrypt,
  hashApiKey,
  generateApiKey,
  maskValue,
};
