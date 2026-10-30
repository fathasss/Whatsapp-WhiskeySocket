const crypto = require("crypto");

async function senderInfo(msg) {
  const remoteJid = msg?.key?.remoteJid || "";
  const isGroup = remoteJid.endsWith("@g.us");

  let senderJid =
    (isGroup ? msg?.key?.participant : remoteJid) ||
    msg?.participant ||
    remoteJid ||
    null;

  const senderId = senderJid ? senderJid.split("@")[0] : null;
  const senderName = msg?.pushName || senderId || "Unknown";

  return {
    jid: senderJid,
    id: senderId,
    name: senderName,
    isGroup,
  };
}

async function cleanJid(jid) {
  if (!jid) return null;
  return jid.replace(/:\d+@/, "@");
}

function buildContextInfo(content) {
  const clientMessageId = content.clientMessageId || crypto.randomUUID();
  const contextInfo = {
    clientMessageId,
  };

  if (content.reply?.replyMessageId) {
    contextInfo.stanzaId = content.reply.replyMessageId;
    contextInfo.participant = content.reply.replyParticipant;

    if (content.reply.replyMessage) {
      contextInfo.quotedMessage = {
        conversation: content.reply.replyMessage,
      };
    }
  }

  return contextInfo;
}

function safeJsonParse(value) {
  if (!value) return undefined;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const ALLOWED_MESSAGE_TYPES = [
  "text",
  "image",
  "video",
  "document",
  "reaction",
  "react",
  "audio",
  "sticker",
  "location",
  "contact",
  "poll",
];

function parseMessageRequest(req, isGroupScope = false) {
  let rawTarget = isGroupScope
    ? req.body?.groupId || req.body?.to
    : req.body?.to;

  let type;
  let content = {};

  if (req.file) {
    type = req.body?.type || "image";
    content = {
      caption: req.body?.caption,
      mentions: safeJsonParse(req.body?.mentions),
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      fileName: req.file.originalname,
      reply: safeJsonParse(req.body?.reply),
      ptt: req.body?.ptt === "true" || req.body?.ptt === true,
    };
  } else if (req.body && req.body.type) {
    type = req.body.type;
    content = req.body.content || {};
  } else {
    return { error: "Invalid request format" };
  }

  if (!rawTarget || !type) {
    return {
      error: isGroupScope
        ? "Missing required fields (groupId, type)"
        : "Missing required fields (to, type)",
    };
  }

  if (!ALLOWED_MESSAGE_TYPES.includes(type)) {
    return {
      error: `Unsupported message type. Allowed: ${ALLOWED_MESSAGE_TYPES.join(", ")}`,
    };
  }

  let targetJid = String(rawTarget).trim();
  if (isGroupScope) {
    if (!targetJid.includes("@")) {
      targetJid = `${targetJid}@g.us`;
    }
    if (!targetJid.endsWith("@g.us")) {
      return { error: "Group endpoint requires a valid groupId (@g.us)" };
    }
  } else {
    if (!targetJid.includes("@")) {
      targetJid = `${targetJid}@s.whatsapp.net`;
    }
    if (targetJid.endsWith("@g.us")) {
      return { error: "Use /group/sendmessage/:accountId for group messages (@g.us)" };
    }
  }

  return { targetJid, type, content };
}

module.exports = {
  senderInfo,
  cleanJid,
  buildContextInfo,
  safeJsonParse,
  ALLOWED_MESSAGE_TYPES,
  parseMessageRequest,
};
