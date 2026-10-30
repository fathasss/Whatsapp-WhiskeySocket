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
 * Karşı tarafa veya gruba Presence (durum) bildirimi gönderir.
 * presence: 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'
 */
async function sendPresence(accountId, to, presence) {
  const sock = getSock(accountId);
  await sock.sendPresenceUpdate(presence, to);
  await recordProfileOrStatusChange({
    accountId,
    category: "profile",
    action: "profile.presence_sent",
    targetJid: to,
    contactPatch: { lastPresence: presence },
    summary: `Karşı tarafa '${presence}' durumu gönderildi`,
    metadata: { to, presence },
  });
  return { success: true, presence, to };
}

/**
 * Profil resmini günceller. 
 * Jid verilirse o grubun resmini günceller, verilmezse kendi profil resmini (sock.user.id) günceller.
 */
async function updateProfilePicture(accountId, imageBuffer, jid = null) {
  const sock = getSock(accountId);
  const targetJid = jid || sock.user.id;
  await sock.updateProfilePicture(targetJid, imageBuffer);
  await recordProfileOrStatusChange({
    accountId,
    category: "profile",
    action: "profile.picture_updated",
    targetJid,
    summary: jid ? "Grup profil resmi güncellendi" : "Hesap profil resmi güncellendi",
    metadata: { targetJid, byteLength: imageBuffer?.length || 0 },
  });
  return { success: true, targetJid };
}

/**
 * "Hakkımda" (Status / About) yazısını günceller.
 */
async function updateProfileStatusText(accountId, statusText) {
  const sock = getSock(accountId);
  await sock.updateProfileStatus(statusText);
  await recordProfileOrStatusChange({
    accountId,
    category: "profile",
    action: "profile.status_updated",
    targetJid: sock.user?.id || null,
    accountPatch: { statusText },
    summary: "WhatsApp 'Hakkımda' yazısı güncellendi",
    metadata: { statusText },
  });
  return { success: true, statusText };
}

/**
 * Belirli bir numarayı engeller veya engelini kaldırır.
 * action: 'block' | 'unblock'
 */
async function updateBlock(accountId, jid, action) {
  const sock = getSock(accountId);
  await sock.updateBlockStatus(jid, action);
  const isBlocked = action === "block";
  await recordProfileOrStatusChange({
    accountId,
    category: "profile",
    action: isBlocked ? "contact.blocked" : "contact.unblocked",
    targetJid: jid,
    contactPatch: { isBlocked },
    summary: isBlocked ? `${jid} engellendi` : `${jid} engeli kaldırıldı`,
    metadata: { jid, action },
  });
  return { success: true, action, jid };
}

module.exports = {
  sendPresence,
  updateProfilePicture,
  updateProfileStatusText,
  updateBlock,
};
