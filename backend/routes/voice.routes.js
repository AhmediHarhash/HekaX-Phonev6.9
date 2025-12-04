// ============================================================================
// HEKAX Phone - Voice Preview Routes
// Generate voice previews using OpenAI TTS
// ============================================================================

const express = require("express");
const OpenAI = require("openai");
const { authMiddleware } = require("../middleware/auth.middleware");

const router = express.Router();

// In-memory cache for voice previews (expires after 1 hour)
const voiceCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/voice/preview
 * Generate a voice preview using OpenAI TTS
 */
router.post("/preview", authMiddleware, async (req, res) => {
  try {
    const { voiceId, text } = req.body;

    if (!voiceId) {
      return res.status(400).json({ error: "Voice ID required" });
    }

    const previewText = text || "Hi, thank you for calling. How may I help you today?";
    
    // Check cache
    const cacheKey = `${voiceId}-${previewText}`;
    const cached = voiceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ audioUrl: cached.audioUrl });
    }

    // Validate voice ID (OpenAI voices - includes all available TTS voices)
    // Note: "sage" is a newer OpenAI voice, "fable" is still valid but less commonly used
    const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "sage"];
    if (!validVoices.includes(voiceId)) {
      return res.status(400).json({ error: "Invalid voice ID" });
    }

    const { OPENAI_API_KEY } = process.env;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OpenAI not configured" });
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Generate speech
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: voiceId,
      input: previewText,
    });

    // Convert to base64 data URL
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const audioUrl = `data:audio/mp3;base64,${buffer.toString("base64")}`;

    // Cache the result
    voiceCache.set(cacheKey, {
      audioUrl,
      timestamp: Date.now(),
    });

    // Clean old cache entries periodically
    if (voiceCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of voiceCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          voiceCache.delete(key);
        }
      }
    }

    res.json({ audioUrl });
  } catch (err) {
    console.error("❌ Voice preview error:", err.message);
    console.error("❌ Full error:", err);
    
    // Return more specific error messages
    if (err.message?.includes("API key")) {
      return res.status(500).json({ error: "OpenAI API key invalid or missing" });
    }
    if (err.message?.includes("rate limit")) {
      return res.status(429).json({ error: "Rate limit exceeded, try again later" });
    }
    if (err.message?.includes("insufficient_quota")) {
      return res.status(402).json({ error: "OpenAI quota exceeded" });
    }
    
    res.status(500).json({ error: "Failed to generate voice preview" });
  }
});

module.exports = router;
