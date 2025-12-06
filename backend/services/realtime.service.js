// ============================================================================
// HEKAX Phone - Real-time Service
// WebSocket-based real-time updates for live call dashboard
// ============================================================================

const WebSocket = require("ws");

// Store active WebSocket connections by organization
const connections = new Map(); // orgId -> Set<WebSocket>

// Store active calls by organization
const activeCalls = new Map(); // orgId -> Map<callSid, callData>

/**
 * Initialize real-time service with existing WebSocket server
 */
function initializeRealtimeService(wss) {
  console.log("📡 Real-time service initialized");

  // The main WebSocket connection is handled in server.js
  // This service provides helper functions for broadcasting
}

/**
 * Register a WebSocket connection for an organization
 */
function registerConnection(organizationId, ws) {
  if (!connections.has(organizationId)) {
    connections.set(organizationId, new Set());
  }
  connections.get(organizationId).add(ws);

  console.log(`📡 Client connected to org ${organizationId}. Total: ${connections.get(organizationId).size}`);

  // Send current active calls to new connection
  const orgCalls = activeCalls.get(organizationId);
  if (orgCalls && orgCalls.size > 0) {
    ws.send(JSON.stringify({
      type: "active_calls",
      data: Array.from(orgCalls.values()),
    }));
  }

  // Handle disconnection
  ws.on("close", () => {
    const orgConnections = connections.get(organizationId);
    if (orgConnections) {
      orgConnections.delete(ws);
      console.log(`📡 Client disconnected from org ${organizationId}. Remaining: ${orgConnections.size}`);
    }
  });
}

/**
 * Broadcast message to all connections for an organization
 */
function broadcast(organizationId, message) {
  const orgConnections = connections.get(organizationId);
  if (!orgConnections || orgConnections.size === 0) return;

  const payload = JSON.stringify(message);

  orgConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

/**
 * Notify when a new call starts
 */
function notifyCallStarted(organizationId, callData) {
  // Store in active calls
  if (!activeCalls.has(organizationId)) {
    activeCalls.set(organizationId, new Map());
  }
  activeCalls.get(organizationId).set(callData.callSid, {
    ...callData,
    startTime: Date.now(),
    status: "ringing",
  });

  broadcast(organizationId, {
    type: "call_started",
    data: callData,
    timestamp: new Date().toISOString(),
  });

  console.log(`📞 Call started: ${callData.callSid} for org ${organizationId}`);
}

/**
 * Notify when a call is answered
 */
function notifyCallAnswered(organizationId, callSid, handledByAI = false) {
  const orgCalls = activeCalls.get(organizationId);
  if (orgCalls && orgCalls.has(callSid)) {
    const call = orgCalls.get(callSid);
    call.status = "in_progress";
    call.answeredAt = Date.now();
    call.handledByAI = handledByAI;
    orgCalls.set(callSid, call);
  }

  broadcast(organizationId, {
    type: "call_answered",
    data: { callSid, handledByAI },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Notify when a call ends
 */
function notifyCallEnded(organizationId, callSid, duration, status) {
  // Remove from active calls
  const orgCalls = activeCalls.get(organizationId);
  if (orgCalls) {
    orgCalls.delete(callSid);
  }

  broadcast(organizationId, {
    type: "call_ended",
    data: { callSid, duration, status },
    timestamp: new Date().toISOString(),
  });

  console.log(`📞 Call ended: ${callSid} - ${status} (${duration}s)`);
}

/**
 * Notify when a new lead is captured
 */
function notifyNewLead(organizationId, lead) {
  broadcast(organizationId, {
    type: "new_lead",
    data: lead,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Notify when call is transferred to human
 */
function notifyTransfer(organizationId, callSid, fromNumber, reason) {
  broadcast(organizationId, {
    type: "call_transfer",
    data: { callSid, fromNumber, reason },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Notify voicemail received
 */
function notifyVoicemail(organizationId, voicemail) {
  broadcast(organizationId, {
    type: "new_voicemail",
    data: voicemail,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get current active calls for an organization
 */
function getActiveCalls(organizationId) {
  const orgCalls = activeCalls.get(organizationId);
  if (!orgCalls) return [];
  return Array.from(orgCalls.values());
}

/**
 * Get connection count for an organization
 */
function getConnectionCount(organizationId) {
  const orgConnections = connections.get(organizationId);
  return orgConnections ? orgConnections.size : 0;
}

/**
 * Send stats update to dashboard
 */
function notifyStatsUpdate(organizationId, stats) {
  broadcast(organizationId, {
    type: "stats_update",
    data: stats,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  initializeRealtimeService,
  registerConnection,
  broadcast,
  notifyCallStarted,
  notifyCallAnswered,
  notifyCallEnded,
  notifyNewLead,
  notifyTransfer,
  notifyVoicemail,
  notifyStatsUpdate,
  getActiveCalls,
  getConnectionCount,
};
