const {
  startWhatsApp,
  stopWhatsApp,
  clearAuth,
} = require("../services/whatsapp/connection.service");
const { getActivities } = require("../services/whatsapp/persistence.service");
const AccountModel = require("../models/account.model");
const { isDbConnected } = require("../db/database");
const { accounts } = require("../models/accounts");

const listAccounts = async (_req, res) => {
  try {
    const activeMemory = Object.entries(accounts).map(([accountId, info]) => ({
      accountId,
      status: info.status,
      hasQR: Boolean(info.currentQR),
      jid: info.sock?.user?.id || null,
    }));

    const dbAccounts = isDbConnected()
      ? await AccountModel.find().sort({ updatedAt: -1 }).lean()
      : [];

    return res.json({
      success: true,
      activeSessions: activeMemory,
      persistedAccounts: dbAccounts,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAccountActivities = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { category, action, limit, page } = req.query;
    const data = await getActivities(accountId, { category, action, limit, page });
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const generateQr = (req, res) => {
  const { accountId } = req.params;
  const account = accounts[accountId];
  if (account && account.currentQR) {
    return res.json({
      success: true,
      message: "QR kod başarıyla alındı",
      response: `${account.currentQR}`,
    });
  }
  return res.json({
    success: false,
    message: "📱 No qr or account not linked!",
    response: null,
  });
};

const startAccount = async (req, res) => {
  const { accountId } = req.params;

  if (!accountId) {
    return res.status(400).json({
      success: false,
      message: "❌ The accountId parameter is missing!",
      response: null,
    });
  }

  try {
    const result = await startWhatsApp(accountId);
    if (!result?.success) {
      return res.status(500).json(result);
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `❌ Failed to start WhatsApp session for ${accountId}: ${err.message}`,
      response: null,
    });
  }
};

const stopAccount = async (req, res) => {
  const { accountId } = req.params;
  const result = await stopWhatsApp(accountId);
  if (result.success) {
    return res.json({
      success: true,
      message: `Listening stopped for ${accountId}`,
    });
  }
  return res.status(404).json({
    success: false,
    message: result.message || "No listener found",
  });
};

const clearAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const result = await clearAuth(accountId);
    return res.json(result);
  } catch (error) {
    console.error("❌ Auth temizleme hatası:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  listAccounts,
  getAccountActivities,
  generateQr,
  startAccount,
  stopAccount,
  clearAccount,
};
