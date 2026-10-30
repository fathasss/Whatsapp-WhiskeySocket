const { getAccount } = require("../../models/accounts");
const {
  recordMessagesRead,
  recordChatStateChange,
} = require("./persistence.service");

function getSock(accountId) {
  const account = getAccount(accountId);
  if (!account) throw new Error("Hesap (Account) bulunamadı veya bağlı değil!");
  const sock = account.sock;
  if (!sock) throw new Error("WhatsApp Socket hazır değil!");
  return sock;
}

/**
 * Mesajı okundu (Mavi Tik) olarak işaretler.
 * keys array of { remoteJid, id, participant (optional) }
 */
async function readMessageService(accountId, keys) {
  const sock = getSock(accountId);
  await sock.readMessages(keys);
  await recordMessagesRead({ accountId, keys, actorJid: sock.user?.id });
  return { success: true, keys };
}

/**
 * Sohbeti arşivler veya arşivden çıkarır.
 */
async function archiveChatService(accountId, jid, isArchive = true) {
  const sock = getSock(accountId);
  await sock.chatModify({ archive: isArchive }, jid);
  await recordChatStateChange({
    accountId,
    jid,
    action: isArchive ? "chat.archived" : "chat.unarchived",
    patch: { archived: isArchive },
    summary: isArchive ? "Sohbet arşivlendi" : "Sohbet arşivden çıkarıldı",
    metadata: { jid, isArchive },
  });
  return { success: true, jid, isArchive };
}

/**
 * Sohbeti sabitler veya sabitlenmesini kaldırır.
 */
async function pinChatService(accountId, jid, isPinned = true) {
  const sock = getSock(accountId);
  await sock.chatModify({ pin: isPinned }, jid);
  await recordChatStateChange({
    accountId,
    jid,
    action: isPinned ? "chat.pinned" : "chat.unpinned",
    patch: { pinned: isPinned },
    summary: isPinned ? "Sohbet sabitlendi" : "Sohbet sabitlemesi kaldırıldı",
    metadata: { jid, isPinned },
  });
  return { success: true, jid, isPinned };
}

/**
 * Sohbeti sessize alır veya sessizden çıkarır.
 * muteDurationMs: Milisaniye cinsinden süre (örn: 8 saat için 8 * 60 * 60 * 1000).
 * Eğer null ise sessize almayı iptal eder.
 */
async function muteChatService(accountId, jid, muteDurationMs) {
  const sock = getSock(accountId);
  const muteValue = muteDurationMs ? Date.now() + muteDurationMs : null;
  await sock.chatModify({ mute: muteValue }, jid);
  await recordChatStateChange({
    accountId,
    jid,
    action: muteValue ? "chat.muted" : "chat.unmuted",
    patch: {
      muted: Boolean(muteValue),
      mutedUntil: muteValue ? new Date(muteValue) : null,
    },
    summary: muteValue ? "Sohbet sessize alındı" : "Sohbet sessizden çıkarıldı",
    metadata: { jid, muteDurationMs },
  });
  return { success: true, jid, muteDurationMs };
}

module.exports = {
  readMessageService,
  archiveChatService,
  pinChatService,
  muteChatService,
};
