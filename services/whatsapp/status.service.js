const { getAccount } = require("../../models/accounts");
const { recordProfileOrStatusChange } = require("./persistence.service");

function getSock(accountId) {
  const account = getAccount(accountId);
  if (!account) throw new Error("Hesap (Account) bulunamadı veya bağlı değil!");
  const sock = account.sock;
  if (!sock) throw new Error("WhatsApp Socket hazır değil!");
  return sock;
}

/**
 * Durum (Status/Hikaye) gönderir.
 * @param {string} accountId - Hesabın ID'si
 * @param {string} type - 'text', 'image' veya 'video'
 * @param {object} content - Gönderilecek içerik { text, backgroundColor, buffer, caption }
 */
async function sendStatusService(accountId, type, content) {
  const sock = getSock(accountId);
  const statusJid = "status@broadcast";
  let messageOptions = {};

  switch (type) {
    case "text":
      messageOptions = {
        text: content.text,
        backgroundColor: content.backgroundColor || "#000000",
      };
      break;
    case "image":
      messageOptions = {
        image: content.buffer,
        caption: content.caption || "",
      };
      break;
    case "video":
      messageOptions = {
        video: content.buffer,
        caption: content.caption || "",
      };
      break;
    default:
      throw new Error("Geçersiz hikaye tipi (text, image, video olmalı).");
  }

  // Hikayeyi gönder
  const response = await sock.sendMessage(statusJid, messageOptions);
  await recordProfileOrStatusChange({
    accountId,
    category: "status",
    action: "status.sent",
    targetJid: statusJid,
    summary: `${type} tipinde durum (hikaye) paylaşıldı`,
    metadata: {
      type,
      text: content.text || content.caption || "",
      backgroundColor: content.backgroundColor || null,
      messageId: response?.key?.id || null,
    },
  });

  return { success: true, response };
}

module.exports = {
  sendStatusService,
};
