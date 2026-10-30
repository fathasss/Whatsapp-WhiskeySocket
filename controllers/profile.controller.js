const {
  sendPresence,
  updateProfilePicture,
  updateProfileStatusText,
  updateBlock
} = require("../services/whatsapp/profile.service");

const presence = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { to, presence: presenceType } = req.body;
    
    if (!to || !presenceType) {
      return res.status(400).json({ success: false, error: "Missing to or presence" });
    }

    const validPresences = ['unavailable', 'available', 'composing', 'recording', 'paused'];
    if (!validPresences.includes(presenceType)) {
      return res.status(400).json({ success: false, error: `Invalid presence. Allowed: ${validPresences.join(", ")}` });
    }

    const result = await sendPresence(accountId, to, presenceType);
    return res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updatePicture = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { jid } = req.body; // Optional: if empty, updates own PP
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image file provided" });
    }

    const result = await updateProfilePicture(accountId, req.file.buffer, jid);
    return res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { statusText } = req.body;
    
    if (!statusText) {
      return res.status(400).json({ success: false, error: "Missing statusText" });
    }

    const result = await updateProfileStatusText(accountId, statusText);
    return res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const blockUser = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { jid, action } = req.body;
    
    if (!jid || !action) {
      return res.status(400).json({ success: false, error: "Missing jid or action" });
    }

    if (!['block', 'unblock'].includes(action)) {
      return res.status(400).json({ success: false, error: "Action must be 'block' or 'unblock'" });
    }

    const result = await updateBlock(accountId, jid, action);
    return res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  presence,
  updatePicture,
  updateStatus,
  blockUser
};
