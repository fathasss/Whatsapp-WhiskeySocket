const {
  createGroup,
  updateParticipants,
  updateSubject,
  updateDescription,
  leaveGroup,
  getGroupInfoService,
} = require("../services/whatsapp/group.service");
const {
  sendMessageService,
  sendReactionService,
  deleteMessageService,
  editMessageService,
} = require("../services/whatsapp/message.service");
const { getChatMessages } = require("../services/whatsapp/persistence.service");
const { parseMessageRequest } = require("../utils/whatsapp.utils");

function normalizeGroupJid(groupId) {
  if (!groupId) return null;
  const trimmed = String(groupId).trim();
  return trimmed.includes("@") ? trimmed : `${trimmed}@g.us`;
}

const sendGroupMessage = async (req, res) => {
  try {
    const { accountId } = req.params;
    const parsed = parseMessageRequest(req, true);
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
    console.error("sendGroupMessage Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const editGroupMessage = async (req, res) => {
  try {
    const { accountId } = req.params;
    const rawGroup = req.body?.groupId || req.body?.to;
    const { messageId, newText } = req.body || {};

    if (!rawGroup || !messageId || !newText) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields (groupId, messageId, newText)",
      });
    }

    const groupJid = normalizeGroupJid(rawGroup);
    if (!groupJid.endsWith("@g.us")) {
      return res.status(400).json({
        success: false,
        error: "groupId must be a valid WhatsApp group JID (@g.us)",
      });
    }

    const result = await editMessageService(accountId, groupJid, messageId, newText);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const deleteGroupMessage = async (req, res) => {
  try {
    const { accountId } = req.params;
    const rawGroup = req.body?.groupId || req.body?.to;
    const { messageId, fromMe, participant } = req.body || {};

    if (!rawGroup || !messageId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields (groupId, messageId)",
      });
    }

    const groupJid = normalizeGroupJid(rawGroup);
    if (!groupJid.endsWith("@g.us")) {
      return res.status(400).json({
        success: false,
        error: "groupId must be a valid WhatsApp group JID (@g.us)",
      });
    }

    const isFromMe = fromMe !== false;
    if (!isFromMe && !participant) {
      return res.status(400).json({
        success: false,
        error: "Deleting another member's message in a group requires 'participant' JID",
      });
    }

    const result = await deleteMessageService(
      accountId,
      groupJid,
      messageId,
      isFromMe,
      participant
    );
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const sendGroupReaction = async (req, res) => {
  try {
    const { accountId } = req.params;
    const rawGroup = req.body?.groupId || req.body?.to;
    const { type = "react", content = {} } = req.body || {};

    if (!rawGroup) {
      return res.status(400).json({
        success: false,
        error: "Missing required field (groupId)",
      });
    }

    const groupJid = normalizeGroupJid(rawGroup);
    if (!groupJid.endsWith("@g.us")) {
      return res.status(400).json({
        success: false,
        error: "groupId must be a valid WhatsApp group JID (@g.us)",
      });
    }

    const result = await sendReactionService(accountId, groupJid, type, content);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const listGroupMessages = async (req, res) => {
  try {
    const { accountId, groupId } = req.params;
    const { limit, page } = req.query;
    const groupJid = normalizeGroupJid(groupId);
    const data = await getChatMessages(accountId, groupJid, { limit, page });
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { subject, participants } = req.body || {};

    if (!subject || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing subject or participants array",
      });
    }

    const result = await createGroup(accountId, subject, participants);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const updateAction = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { groupId, participants, action } = req.body || {};

    if (!groupId || !Array.isArray(participants) || !action) {
      return res.status(400).json({
        success: false,
        error: "Missing groupId, participants array, or action",
      });
    }

    const validActions = ["add", "remove", "promote", "demote"];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: "Invalid action. Allowed: add, remove, promote, demote",
      });
    }

    const result = await updateParticipants(accountId, groupId, participants, action);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const updateSubj = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { groupId, subject } = req.body || {};

    if (!groupId || !subject) {
      return res.status(400).json({ success: false, error: "Missing groupId or subject" });
    }

    const result = await updateSubject(accountId, groupId, subject);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const updateDesc = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { groupId, description } = req.body || {};

    if (!groupId || !description) {
      return res.status(400).json({ success: false, error: "Missing groupId or description" });
    }

    const result = await updateDescription(accountId, groupId, description);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const leave = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { groupId } = req.body || {};

    if (!groupId) {
      return res.status(400).json({ success: false, error: "Missing groupId" });
    }

    const result = await leaveGroup(accountId, groupId);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

const getInfo = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { groupId } = req.body || {};

    if (!groupId) {
      return res.status(400).json({ success: false, error: "Missing groupId" });
    }

    const result = await getGroupInfoService(accountId, groupId);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  sendGroupMessage,
  editGroupMessage,
  deleteGroupMessage,
  sendGroupReaction,
  listGroupMessages,
  create,
  updateAction,
  updateSubj,
  updateDesc,
  leave,
  getInfo,
};
