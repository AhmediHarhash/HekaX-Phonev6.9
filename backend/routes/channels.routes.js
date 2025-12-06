// ============================================================================
// HEKAX Phone - Multi-Channel Routes
// API endpoints for WhatsApp, Webchat, and other channels
// ============================================================================

const express = require("express");
const { authMiddleware } = require("../middleware/auth.middleware");
const multichannelService = require("../services/multichannel.service");

const router = express.Router();

/**
 * GET /api/channels
 * Get all channels for organization
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const channels = await multichannelService.getChannels(req.organizationId);
    res.json({ channels });
  } catch (err) {
    console.error("❌ GET /api/channels error:", err);
    res.status(500).json({ error: "Failed to get channels" });
  }
});

/**
 * GET /api/channels/:id
 * Get specific channel
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const channel = await multichannelService.getChannel(
      req.params.id,
      req.organizationId
    );
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }
    res.json({ channel });
  } catch (err) {
    console.error("❌ GET /api/channels/:id error:", err);
    res.status(500).json({ error: "Failed to get channel" });
  }
});

/**
 * POST /api/channels
 * Create a new channel
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const channel = await multichannelService.saveChannel(
      req.organizationId,
      req.body
    );
    res.status(201).json({ channel });
  } catch (err) {
    console.error("❌ POST /api/channels error:", err);
    res.status(500).json({ error: "Failed to create channel" });
  }
});

/**
 * PUT /api/channels/:id
 * Update a channel
 */
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const channel = await multichannelService.saveChannel(req.organizationId, {
      ...req.body,
      id: req.params.id,
    });
    res.json({ channel });
  } catch (err) {
    console.error("❌ PUT /api/channels/:id error:", err);
    res.status(500).json({ error: "Failed to update channel" });
  }
});

/**
 * DELETE /api/channels/:id
 * Delete a channel
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await multichannelService.deleteChannel(req.params.id, req.organizationId);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /api/channels/:id error:", err);
    res.status(500).json({ error: "Failed to delete channel" });
  }
});

/**
 * GET /api/channels/:id/conversations
 * Get conversations for a channel
 */
router.get("/:id/conversations", authMiddleware, async (req, res) => {
  try {
    const { status, limit, offset } = req.query;

    const result = await multichannelService.getConversations(
      req.params.id,
      req.organizationId,
      {
        status,
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0,
      }
    );

    res.json(result);
  } catch (err) {
    console.error("❌ GET /api/channels/:id/conversations error:", err);
    res.status(500).json({ error: "Failed to get conversations" });
  }
});

/**
 * GET /api/channels/conversations/:conversationId/messages
 * Get messages for a conversation
 */
router.get(
  "/conversations/:conversationId/messages",
  authMiddleware,
  async (req, res) => {
    try {
      const { limit, before } = req.query;

      const messages = await multichannelService.getConversationMessages(
        req.params.conversationId,
        req.organizationId,
        {
          limit: limit ? parseInt(limit) : 100,
          before,
        }
      );

      res.json({ messages });
    } catch (err) {
      console.error("❌ GET conversations/:id/messages error:", err);
      res.status(500).json({ error: "Failed to get messages" });
    }
  }
);

/**
 * POST /api/channels/conversations/:conversationId/messages
 * Send a message in a conversation
 */
router.post(
  "/conversations/:conversationId/messages",
  authMiddleware,
  async (req, res) => {
    try {
      const { content, contentType } = req.body;

      if (!content) {
        return res.status(400).json({ error: "content is required" });
      }

      const message = await multichannelService.sendMessage(
        req.params.channelId,
        req.params.conversationId,
        content,
        contentType
      );

      res.status(201).json({ message });
    } catch (err) {
      console.error("❌ POST conversations/:id/messages error:", err);
      res.status(500).json({ error: "Failed to send message" });
    }
  }
);

/**
 * POST /api/channels/conversations/:conversationId/close
 * Close a conversation
 */
router.post(
  "/conversations/:conversationId/close",
  authMiddleware,
  async (req, res) => {
    try {
      const { resolution } = req.body;

      const conversation = await multichannelService.closeConversation(
        req.params.conversationId,
        req.organizationId,
        resolution
      );

      res.json({ conversation });
    } catch (err) {
      console.error("❌ POST conversations/:id/close error:", err);
      res.status(500).json({ error: "Failed to close conversation" });
    }
  }
);

/**
 * POST /api/channels/conversations/:conversationId/transfer
 * Transfer conversation to agent
 */
router.post(
  "/conversations/:conversationId/transfer",
  authMiddleware,
  async (req, res) => {
    try {
      const { agentId } = req.body;

      if (!agentId) {
        return res.status(400).json({ error: "agentId is required" });
      }

      const conversation = await multichannelService.transferToAgent(
        req.params.conversationId,
        req.organizationId,
        agentId
      );

      res.json({ conversation });
    } catch (err) {
      console.error("❌ POST conversations/:id/transfer error:", err);
      res.status(500).json({ error: "Failed to transfer conversation" });
    }
  }
);

/**
 * GET /api/channels/stats
 * Get channel statistics
 */
router.get("/stats/overview", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await multichannelService.getChannelStats(
      req.organizationId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json(stats);
  } catch (err) {
    console.error("❌ GET /api/channels/stats error:", err);
    res.status(500).json({ error: "Failed to get channel stats" });
  }
});

/**
 * GET /api/channels/webchat/config
 * Get webchat widget configuration (public endpoint)
 */
router.get("/webchat/config/:orgId", async (req, res) => {
  try {
    const config = await multichannelService.getWebchatConfig(req.params.orgId);

    if (!config) {
      return res.status(404).json({ error: "Webchat not configured" });
    }

    res.json(config);
  } catch (err) {
    console.error("❌ GET /api/channels/webchat/config error:", err);
    res.status(500).json({ error: "Failed to get webchat config" });
  }
});

/**
 * POST /api/channels/webhook/whatsapp
 * WhatsApp webhook for incoming messages
 */
router.post("/webhook/whatsapp", async (req, res) => {
  try {
    const { Body, From, To, MessageSid, ProfileName } = req.body;

    // Find the channel by WhatsApp number
    const toNumber = To?.replace("whatsapp:", "");

    // Find organization by WhatsApp number configuration
    // This would need to look up in channel configs
    // For now, acknowledge receipt
    console.log("📱 WhatsApp message received:", {
      from: From,
      to: To,
      body: Body?.substring(0, 50),
    });

    // Process the message
    // await multichannelService.handleIncomingMessage(channelId, {
    //   from: From?.replace("whatsapp:", ""),
    //   content: Body,
    //   senderName: ProfileName,
    //   type: "text",
    //   externalId: MessageSid,
    // });

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ WhatsApp webhook error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

/**
 * POST /api/channels/webchat/message
 * Webchat incoming message (public endpoint)
 */
router.post("/webchat/message", async (req, res) => {
  try {
    const { channelId, sessionId, content, senderName } = req.body;

    if (!channelId || !content) {
      return res.status(400).json({ error: "channelId and content required" });
    }

    const result = await multichannelService.handleIncomingMessage(channelId, {
      from: sessionId || `webchat-${Date.now()}`,
      content,
      senderName: senderName || "Visitor",
      type: "text",
    });

    res.json({
      conversationId: result.conversation.id,
      response: result.aiResponse?.content,
    });
  } catch (err) {
    console.error("❌ Webchat message error:", err);
    res.status(500).json({ error: "Failed to process message" });
  }
});

module.exports = router;
