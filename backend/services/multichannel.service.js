// ============================================================================
// HEKAX Phone - Multi-Channel Service
// WhatsApp and Webchat integration service
// ============================================================================

const prisma = require("../lib/prisma");

/**
 * Get all channel configurations for an organization
 */
async function getChannels(organizationId) {
  return prisma.channel.findMany({
    where: { organizationId },
    orderBy: { type: "asc" },
  });
}

/**
 * Get a specific channel configuration
 */
async function getChannel(channelId, organizationId) {
  return prisma.channel.findFirst({
    where: { id: channelId, organizationId },
  });
}

/**
 * Create or update a channel configuration
 */
async function saveChannel(organizationId, data) {
  const {
    id,
    type, // WHATSAPP, WEBCHAT, SMS, MESSENGER
    name,
    enabled,
    config,
    greeting,
    aiEnabled,
    aiPersonality,
  } = data;

  if (id) {
    return prisma.channel.update({
      where: { id, organizationId },
      data: {
        name,
        enabled,
        config,
        greeting,
        aiEnabled,
        aiPersonality,
        updatedAt: new Date(),
      },
    });
  }

  return prisma.channel.create({
    data: {
      organizationId,
      type,
      name,
      enabled: enabled !== false,
      config: config || {},
      greeting,
      aiEnabled: aiEnabled !== false,
      aiPersonality,
    },
  });
}

/**
 * Delete a channel
 */
async function deleteChannel(channelId, organizationId) {
  return prisma.channel.delete({
    where: { id: channelId, organizationId },
  });
}

/**
 * Handle incoming message from any channel
 */
async function handleIncomingMessage(channelId, message) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          aiEnabled: true,
          personality: true,
          systemPrompt: true,
        },
      },
    },
  });

  if (!channel || !channel.enabled) {
    throw new Error("Channel not found or disabled");
  }

  // Create conversation if needed
  let conversation = await prisma.conversation.findFirst({
    where: {
      channelId,
      externalId: message.from,
      status: "ACTIVE",
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        channelId,
        organizationId: channel.organizationId,
        externalId: message.from,
        participantName: message.senderName,
        participantPhone: message.from,
        status: "ACTIVE",
        metadata: {
          channel: channel.type,
          startedAt: new Date().toISOString(),
        },
      },
    });
  }

  // Store incoming message
  await prisma.channelMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      content: message.content,
      contentType: message.type || "text",
      metadata: message.metadata || {},
    },
  });

  // Generate AI response if enabled
  let aiResponse = null;
  if (channel.aiEnabled) {
    aiResponse = await generateAIResponse(channel, conversation, message);

    // Store AI response
    await prisma.channelMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: aiResponse.content,
        contentType: "text",
        metadata: { aiGenerated: true },
      },
    });
  }

  return {
    conversation,
    aiResponse,
  };
}

/**
 * Generate AI response for channel message
 */
async function generateAIResponse(channel, conversation, message) {
  // Get conversation history
  const history = await prisma.channelMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  // Build messages for AI
  const messages = history.map((m) => ({
    role: m.direction === "INBOUND" ? "user" : "assistant",
    content: m.content,
  }));

  // Add current message
  messages.push({
    role: "user",
    content: message.content,
  });

  // Use OpenAI to generate response
  const OpenAI = require("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildSystemPrompt(channel, conversation);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: 500,
    temperature: 0.7,
  });

  return {
    content: completion.choices[0]?.message?.content || "I apologize, I couldn't process that message.",
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}

/**
 * Build system prompt for channel AI
 */
function buildSystemPrompt(channel, conversation) {
  const org = channel.organization;
  const channelName = channel.type.charAt(0) + channel.type.slice(1).toLowerCase();

  let prompt = `You are an AI assistant for ${org.name}, responding via ${channelName}.\n\n`;

  if (channel.aiPersonality) {
    prompt += `Personality: ${channel.aiPersonality}\n\n`;
  } else if (org.personality) {
    prompt += `Personality: ${org.personality}\n\n`;
  }

  if (org.systemPrompt) {
    prompt += `${org.systemPrompt}\n\n`;
  }

  prompt += `Guidelines:
- Keep responses concise and mobile-friendly
- Use simple formatting (no complex markdown)
- Be helpful and professional
- If you can't help, offer to connect them with a human agent
- Remember this is a ${channelName} conversation`;

  if (channel.greeting && !conversation.greetingSent) {
    prompt += `\n\nStart with a greeting if this is a new conversation.`;
  }

  return prompt;
}

/**
 * Send message to a channel
 */
async function sendMessage(channelId, conversationId, content, contentType = "text") {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error("Channel not found");
  }

  // Store outbound message
  const message = await prisma.channelMessage.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      content,
      contentType,
      status: "PENDING",
    },
  });

  // Send via appropriate provider
  let result;
  switch (channel.type) {
    case "WHATSAPP":
      result = await sendWhatsAppMessage(channel, content, conversationId);
      break;
    case "WEBCHAT":
      result = { success: true }; // Webchat is real-time via WebSocket
      break;
    default:
      throw new Error(`Unsupported channel type: ${channel.type}`);
  }

  // Update message status
  await prisma.channelMessage.update({
    where: { id: message.id },
    data: {
      status: result.success ? "SENT" : "FAILED",
      externalId: result.messageId,
    },
  });

  return message;
}

/**
 * Send WhatsApp message via Twilio
 */
async function sendWhatsAppMessage(channel, content, conversationId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  try {
    const twilio = require("twilio");
    const config = channel.config;
    const client = twilio(
      config.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID,
      config.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN
    );

    const message = await client.messages.create({
      body: content,
      from: `whatsapp:${config.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${conversation.participantPhone}`,
    });

    return { success: true, messageId: message.sid };
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Get conversations for a channel
 */
async function getConversations(channelId, organizationId, options = {}) {
  const { status, limit = 50, offset = 0 } = options;

  const where = { channelId, organizationId };
  if (status) where.status = status;

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.conversation.count({ where }),
  ]);

  return { conversations, total, limit, offset };
}

/**
 * Get conversation messages
 */
async function getConversationMessages(conversationId, organizationId, options = {}) {
  const { limit = 100, before } = options;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const where = { conversationId };
  if (before) {
    where.createdAt = { lt: new Date(before) };
  }

  const messages = await prisma.channelMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.reverse();
}

/**
 * Close a conversation
 */
async function closeConversation(conversationId, organizationId, resolution) {
  return prisma.conversation.update({
    where: { id: conversationId, organizationId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      resolution,
    },
  });
}

/**
 * Transfer conversation to human agent
 */
async function transferToAgent(conversationId, organizationId, agentId) {
  return prisma.conversation.update({
    where: { id: conversationId, organizationId },
    data: {
      status: "TRANSFERRED",
      assignedToId: agentId,
      transferredAt: new Date(),
    },
  });
}

/**
 * Get webchat widget configuration
 */
async function getWebchatConfig(organizationId) {
  const channel = await prisma.channel.findFirst({
    where: { organizationId, type: "WEBCHAT", enabled: true },
    include: {
      organization: {
        select: {
          name: true,
          primaryColor: true,
          secondaryColor: true,
          logoUrl: true,
        },
      },
    },
  });

  if (!channel) {
    return null;
  }

  return {
    channelId: channel.id,
    name: channel.name || channel.organization.name,
    greeting: channel.greeting,
    primaryColor: channel.config?.primaryColor || channel.organization.primaryColor,
    secondaryColor: channel.config?.secondaryColor || channel.organization.secondaryColor,
    logoUrl: channel.config?.logoUrl || channel.organization.logoUrl,
    position: channel.config?.position || "bottom-right",
    showAvatar: channel.config?.showAvatar !== false,
    enableFileUpload: channel.config?.enableFileUpload || false,
    offlineMessage: channel.config?.offlineMessage || "We're currently offline. Please leave a message.",
  };
}

/**
 * Get channel statistics
 */
async function getChannelStats(organizationId, startDate, endDate) {
  const where = {
    organizationId,
    createdAt: {
      gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      lte: endDate || new Date(),
    },
  };

  const [
    totalConversations,
    byChannel,
    byStatus,
    avgResponseTime,
    messageCount,
  ] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.groupBy({
      by: ["channelId"],
      where,
      _count: true,
    }),
    prisma.conversation.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
    prisma.channelMessage.aggregate({
      where: {
        conversation: { organizationId },
        direction: "OUTBOUND",
        createdAt: where.createdAt,
      },
      _avg: { responseTimeMs: true },
    }),
    prisma.channelMessage.count({
      where: {
        conversation: { organizationId },
        createdAt: where.createdAt,
      },
    }),
  ]);

  return {
    totalConversations,
    totalMessages: messageCount,
    byChannel: byChannel.map((c) => ({
      channelId: c.channelId,
      count: c._count,
    })),
    byStatus: byStatus.map((s) => ({
      status: s.status,
      count: s._count,
    })),
    avgResponseTimeMs: avgResponseTime._avg?.responseTimeMs || 0,
  };
}

module.exports = {
  getChannels,
  getChannel,
  saveChannel,
  deleteChannel,
  handleIncomingMessage,
  sendMessage,
  getConversations,
  getConversationMessages,
  closeConversation,
  transferToAgent,
  getWebchatConfig,
  getChannelStats,
};
