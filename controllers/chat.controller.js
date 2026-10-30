const {
  readMessageService,
  archiveChatService,
  pinChatService,
  muteChatService,
} = require("../services/whatsapp/chat.service");
const {
  sendMessageService,
  sendReactionService,
  deleteMessageService,
  editMessageService,
} = require("../services/whatsapp/message.service");
const {
  getChats,
  getChatMessages,
} = require("../services/whatsapp/persistence.service");
const { parseMessageRequest } = require("../utils/whatsapp.utils");

function normalizeIndividualJid(to) {
  if (!to) return null;
  const trimmed = String(to).trim();
  return trimmed.includes("@") ? trimmed : `${trimmed}@s.whatsapp.net`;
}

const sendChatMessage = async (req, res) => {
  try {
    const { accountId } = req.params;
    const parsed = parseMessageRequest(req, false);
    if (parsed.error) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const { targetJid, type, content } = parsed;
    const result =
      type === "reaction" || type === "react"
        ? await sendReactionService(accountId, targetJid, type, content)
        : await sendMessageService(accountId, targetJid, type, content);

    return res.json({ success: true, result });
  } catch (err) {
    console.error("sendChatMessage Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const editChatMessage = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { to, messageId, newText } = req.body || {};

    if (!to || !messageId || !newText) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields (to, messageId, newText)",
      });
    }

    const targetJid = normalizeIndividualJid(to);
    if (targetJid.endsWith("@g.us")) {
      return res.status(400).json({
        success: false,
        error: "Use /group/editmessage/:accountId for group messages (@g.us)",
      });
    }

    const result = await editMessageService(accountId, targetJid, messageId, newText);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const deleteChatMessage = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { to, messageId, fromMe } = req.body || {};

    if (!to || !messageId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields (to, messageId)",
      });
    }

    const targetJid = normalizeIndividualJid(to);
    if (targetJid.endsWith("@g.us")) {
      return res.status(400).json({
        success: false,
        error: "Use /group/deletemessage/:accountId for group messages (@g.us)",
      });
    }

    const result = await deleteMessageService(
      accountId,
      targetJid,
      messageId,
      fromMe !== false
    );
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const sendChatReaction = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { to, type = "react", content = {} } = req.body || {};

    if (!to) {
      return res.status(400).json({
        success: false,
        error: "Missing required field (to)",
      });
    }

    const targetJid = normalizeIndividualJid(to);
    if (targetJid.endsWith("@g.us")) {
      return res.status(400).json({
        success: false,
        error: "Use /group/sendreaction/:accountId for group messages (@g.us)",
      });
    }

    const result = await sendReactionService(accountId, targetJid, type, content);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const listChats = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { chatType, archived, limit, page } = req.query;
    const data = await getChats(accountId, { chatType, archived, limit, page });
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const listChatMessages = async (req, res) => {
  try {
    const { accountId, chatId } = req.params;
    const { limit, page } = req.query;
    const data = await getChatMessages(accountId, chatId, { limit, page });
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { keys } = req.body || {};

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ success: false, error: "Missing or invalid keys array" });
    }

    const result = await readMessageService(accountId, keys);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const archiveChat = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { jid, isArchive } = req.body || {};

    if (!jid) {
      return res.status(400).json({ success: false, error: "Missing jid" });
    }

    const result = await archiveChatService(accountId, jid, isArchive !== false);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const pinChat = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { jid, isPinned } = req.body || {};

    if (!jid) {
      return res.status(400).json({ success: false, error: "Missing jid" });
    }

    const result = await pinChatService(accountId, jid, isPinned !== false);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const muteChat = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { jid, muteDurationMs } = req.body || {};

    if (!jid) {
      return res.status(400).json({ success: false, error: "Missing jid" });
    }

    const result = await muteChatService(accountId, jid, muteDurationMs || null);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  sendChatReaction,
  listChats,
  listChatMessages,
  markAsRead,
  archiveChat,
  pinChat,
  muteChat,
};
