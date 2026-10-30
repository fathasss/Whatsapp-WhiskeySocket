const { getAccount } = require("../../models/accounts");
const { recordGroupChange } = require("./persistence.service");

function getSock(accountId) {
  const account = getAccount(accountId);
  if (!account) throw new Error("Hesap (Account) bulunamadı veya bağlı değil!");
  const sock = account.sock;
  if (!sock) throw new Error("WhatsApp Socket hazır değil!");
  return sock;
}

/**
 * Grup oluşturur.
 */
async function createGroup(accountId, subject, participants) {
  const sock = getSock(accountId);
  // Baileys groupCreate requires an array of JIDs
  const response = await sock.groupCreate(subject, participants);
  const mappedParticipants = (response.participants || []).map((p) => ({
    jid: p.id,
    admin: p.admin || null,
  }));

  await recordGroupChange({
    accountId,
    groupId: response.id,
    action: "group.created",
    chatPatch: {
      name: response.subject || subject,
      owner: response.owner || sock.user?.id || null,
      participants: mappedParticipants,
      isActiveMember: true,
    },
    summary: `Yeni grup oluşturuldu: ${subject}`,
    metadata: { subject, participants },
  });

  return response;
}

/**
 * Gruba kişi ekler, çıkarır veya yetkilerini (admin) değiştirir.
 * action: "add" | "remove" | "promote" | "demote"
 */
async function updateParticipants(accountId, groupId, participants, action) {
  const sock = getSock(accountId);
  const response = await sock.groupParticipantsUpdate(groupId, participants, action);

  let latestParticipants;
  try {
    const metadata = await sock.groupMetadata(groupId);
    latestParticipants = (metadata?.participants || []).map((p) => ({
      jid: p.id,
      admin: p.admin || null,
    }));
  } catch {
    latestParticipants = undefined;
  }

  await recordGroupChange({
    accountId,
    groupId,
    action: `group.participants_${action}`,
    chatPatch: latestParticipants ? { participants: latestParticipants } : {},
    summary: `Grup üye işlemi yapıldı (${action})`,
    metadata: { groupId, participants, action, response },
  });

  return response;
}

/**
 * Grubun başlığını değiştirir.
 */
async function updateSubject(accountId, groupId, subject) {
  const sock = getSock(accountId);
  await sock.groupUpdateSubject(groupId, subject);
  await recordGroupChange({
    accountId,
    groupId,
    action: "group.subject_updated",
    chatPatch: { name: subject },
    summary: `Grup başlığı değiştirildi: ${subject}`,
    metadata: { groupId, subject },
  });
  return { success: true, subject };
}

/**
 * Grubun açıklamasını değiştirir.
 */
async function updateDescription(accountId, groupId, description) {
  const sock = getSock(accountId);
  await sock.groupUpdateDescription(groupId, description);
  await recordGroupChange({
    accountId,
    groupId,
    action: "group.description_updated",
    chatPatch: { description },
    summary: "Grup açıklaması güncellendi",
    metadata: { groupId, description },
  });
  return { success: true, description };
}

/**
 * Gruptan çıkar.
 */
async function leaveGroup(accountId, groupId) {
  const sock = getSock(accountId);
  await sock.groupLeave(groupId);
  await recordGroupChange({
    accountId,
    groupId,
    action: "group.left",
    chatPatch: { isActiveMember: false },
    summary: "Gruptan çıkıldı",
    metadata: { groupId },
  });
  return { success: true, groupId };
}

/**
 * Grubun tüm bilgilerini (üyeler vb.) getirir.
 */
async function getGroupInfoService(accountId, groupId) {
  const sock = getSock(accountId);
  const metadata = await sock.groupMetadata(groupId);
  const members = metadata.participants.map((p) => ({
    id: p.id,
    admin: p.admin, // 'admin' | 'superadmin' | null
  }));

  await recordGroupChange({
    accountId,
    groupId: metadata.id || groupId,
    action: "group.info_fetched",
    chatPatch: {
      name: metadata.subject,
      description: metadata.desc || "",
      owner: metadata.owner || null,
      participants: members.map((m) => ({ jid: m.id, admin: m.admin || null })),
    },
    summary: `Grup bilgileri senkronize edildi: ${metadata.subject}`,
    metadata: { memberCount: members.length },
  });

  return {
    id: metadata.id,
    subject: metadata.subject,
    description: metadata.desc,
    owner: metadata.owner,
    creation: metadata.creation,
    members: members,
  };
}

module.exports = {
  createGroup,
  updateParticipants,
  updateSubject,
  updateDescription,
  leaveGroup,
  getGroupInfoService,
};
