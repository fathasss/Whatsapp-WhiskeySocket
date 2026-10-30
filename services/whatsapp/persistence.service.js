const crypto = require("crypto");
const { isDbConnected } = require("../../db/database");
const AccountModel = require("../../models/account.model");
const ContactModel = require("../../models/contact.model");
const ChatModel = require("../../models/chat.model");
const MessageModel = require("../../models/message.model");
const ActivityLogModel = require("../../models/activity-log.model");
const { cleanJid } = require("../../utils/whatsapp.utils");

async function normalizeJid(jid) {
  if (!jid) return null;
  const cleaned = await cleanJid(String(jid).trim());
  if (!cleaned.includes("@")) {
    return `${cleaned}@s.whatsapp.net`;
  }
  return cleaned;
}

async function ensureAccount(accountId, patch = {}) {
  if (!isDbConnected() || !accountId) return null;
  const update = { $set: { ...patch }, $setOnInsert: { accountId } };
  return AccountModel.findOneAndUpdate({ accountId }, update, {
    upsert: true,
    new: true,
  });
}

async function ensureContact(accountDoc, jid, patch = {}) {
  if (!isDbConnected() || !accountDoc || !jid) return null;
  const normalizedJid = await normalizeJid(jid);
  const isGroup = normalizedJid.endsWith("@g.us");
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined && v !== null)
  );

  return ContactModel.findOneAndUpdate(
    { accountId: accountDoc.accountId, jid: normalizedJid },
    {
      $set: {
        account: accountDoc._id,
        isGroup,
        lastActive: new Date(),
        ...cleanPatch,
      },
      $setOnInsert: {
        accountId: accountDoc.accountId,
        jid: normalizedJid,
      },
    },
    { upsert: true, new: true }
  );
}

async function ensureChat(accountDoc, chatId, patch = {}, contactDoc = null) {
  if (!isDbConnected() || !accountDoc || !chatId) return null;
  const normalizedChatId = await normalizeJid(chatId);
  const chatType = normalizedChatId.endsWith("@g.us") ? "group" : "individual";
  const resolvedContact =
    contactDoc || (await ensureContact(accountDoc, normalizedChatId, { name: patch.name }));

  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );

  return ChatModel.findOneAndUpdate(
    { accountId: accountDoc.accountId, chatId: normalizedChatId },
    {
      $set: {
        account: accountDoc._id,
        chatType,
        ...(resolvedContact ? { contact: resolvedContact._id } : {}),
        ...cleanPatch,
      },
      $setOnInsert: {
        accountId: accountDoc.accountId,
        chatId: normalizedChatId,
      },
    },
    { upsert: true, new: true }
  );
}

async function logActivity({
  accountId,
  accountDoc = null,
  chatDoc = null,
  messageDoc = null,
  contactDoc = null,
  category,
  action,
  actorJid = null,
  targetJid = null,
  summary = "",
  metadata = {},
}) {
  if (!isDbConnected() || !accountId) return null;
  try {
    const acc = accountDoc || (await ensureAccount(accountId));
    return await ActivityLogModel.create({
      account: acc?._id || null,
      accountId,
      chat: chatDoc?._id || null,
      message: messageDoc?._id || null,
      contact: contactDoc?._id || null,
      category,
      action,
      actorJid,
      targetJid,
      summary,
      metadata,
    });
  } catch (err) {
    console.error("⚠️ ActivityLog kayıt hatası:", err.message);
    return null;
  }
}

async function recordAccountEvent(accountId, status, extra = {}) {
  if (!isDbConnected()) return null;
  try {
    const patch = { status };
    if (extra.jid) patch.jid = await normalizeJid(extra.jid);
    if (extra.name) patch.name = extra.name;
    if (status === "CONNECTED") patch.lastConnectedAt = new Date();
    if (["STOPPED", "LOGGED_OUT", "REPLACED", "ERROR"].includes(status)) {
      patch.lastDisconnectedAt = new Date();
    }

    const accountDoc = await ensureAccount(accountId, patch);
    await logActivity({
      accountId,
      accountDoc,
      category: "session",
      action: extra.action || `session.${status.toLowerCase()}`,
      actorJid: accountDoc?.jid || null,
      summary: extra.summary || `Hesap durumu güncellendi: ${status}`,
      metadata: extra.metadata || { status },
    });
    return accountDoc;
  } catch (err) {
    console.error("⚠️ recordAccountEvent hatası:", err.message);
    return null;
  }
}

async function recordInboundMessage({
  accountId,
  msg,
  sock,
  sender,
  chatId,
  content,
  actualMessageType,
  linkedMessageId,
  clientMessageId,
}) {
  if (!isDbConnected()) return null;
  try {
    const selfJid = await normalizeJid(sock?.user?.id);
    const normalizedChatId = await normalizeJid(chatId);
    const senderJid = msg.key.fromMe
      ? selfJid || accountId
      : await normalizeJid(sender.jid || normalizedChatId);

    const rawTs = msg.messageTimestamp?.low ?? msg.messageTimestamp;
    const parsedDate = rawTs ? new Date(Number(rawTs) * 1000) : new Date();
    const timestamp = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const accountDoc = await ensureAccount(accountId, {
      ...(selfJid ? { jid: selfJid } : {}),
      status: "CONNECTED",
    });

    const senderContact = await ensureContact(accountDoc, senderJid, {
      ...(sender?.name && sender.name !== "Unknown" ? { name: sender.name } : {}),
    });

    const chatContact = normalizedChatId.endsWith("@g.us")
      ? await ensureContact(accountDoc, normalizedChatId, { isGroup: true })
      : senderContact;

    const chatDoc = await ensureChat(
      accountDoc,
      normalizedChatId,
      {
        ...(!normalizedChatId.endsWith("@g.us") && sender?.name && sender.name !== "Unknown"
          ? { name: sender.name }
          : {}),
      },
      chatContact
    );

    // Gelen reaksiyon ise hedef mesajın reactions dizisini güncelle
    if (actualMessageType === "reactionMessage" && linkedMessageId) {
      const emoji = msg.message?.reactionMessage?.text ?? "";
      return await recordMessageReaction({
        accountId,
        to: normalizedChatId,
        messageId: linkedMessageId,
        emoji,
        senderJid,
        fromMe: Boolean(msg.key.fromMe),
      });
    }

    let replyToDoc = null;
    if (linkedMessageId) {
      replyToDoc = await MessageModel.findOne({
        accountId,
        chatId: normalizedChatId,
        messageId: linkedMessageId,
      });
    }

    // Büyük base64 medyaların 16MB BSON sınırını zorlamaması için koruma
    const storedUrl =
      content.url && content.url.length > 2 * 1024 * 1024
        ? `[inline-media:${content.mimetype || actualMessageType}:${content.fileLength || 0}b]`
        : content.url || "";

    const msgDoc = await MessageModel.findOneAndUpdate(
      { accountId, chatId: normalizedChatId, messageId: msg.key.id },
      {
        $set: {
          account: accountDoc._id,
          chat: chatDoc._id,
          sender: senderContact?._id || null,
          senderJid,
          replyTo: replyToDoc?._id || null,
          replyToMessageId: linkedMessageId || null,
          clientMessageId: clientMessageId || null,
          direction: msg.key.fromMe ? "outbound" : "inbound",
          isFromMe: Boolean(msg.key.fromMe),
          type: actualMessageType,
          content: {
            text: content.text || "",
            caption: content.caption || "",
            url: storedUrl,
            mimetype: content.mimetype || "text/plain",
            fileSha256: content.fileSha256 || null,
            fileLength: content.fileLength || 0,
          },
          status: msg.key.fromMe ? "sent" : "delivered",
          timestamp,
        },
        $setOnInsert: {
          accountId,
          chatId: normalizedChatId,
          messageId: msg.key.id,
        },
      },
      { upsert: true, new: true }
    );

    const chatUpdate = {
      $set: {
        lastMessage: msgDoc._id,
        lastMessageText: content.text || content.caption || `[${actualMessageType}]`,
        lastMessageType: actualMessageType,
        lastMessageAt: timestamp,
      },
    };
    if (!msg.key.fromMe) {
      chatUpdate.$inc = { unreadCount: 1 };
    }
    await ChatModel.updateOne({ _id: chatDoc._id }, chatUpdate);

    await logActivity({
      accountId,
      accountDoc,
      chatDoc,
      messageDoc: msgDoc,
      contactDoc: senderContact,
      category: "message",
      action: msg.key.fromMe ? "message.synced_outbound" : "message.received",
      actorJid: senderJid,
      targetJid: normalizedChatId,
      summary: `${actualMessageType} mesajı kaydedildi`,
      metadata: {
        messageId: msg.key.id,
        type: actualMessageType,
        isGroup: normalizedChatId.endsWith("@g.us"),
      },
    });

    return msgDoc;
  } catch (err) {
    console.error("⚠️ recordInboundMessage hatası:", err.message);
    return null;
  }
}

async function recordOutboundMessage({
  accountId,
  to,
  type,
  content,
  sentResult,
  selfJid,
}) {
  if (!isDbConnected()) return null;
  try {
    const normalizedChatId = await normalizeJid(to);
    const actorJid = (await normalizeJid(selfJid)) || accountId;
    const messageId = sentResult?.key?.id || crypto.randomUUID();
    const timestamp = new Date();

    const accountDoc = await ensureAccount(accountId, {
      ...(selfJid ? { jid: actorJid } : {}),
    });
    const senderContact = await ensureContact(accountDoc, actorJid);
    const targetContact = await ensureContact(accountDoc, normalizedChatId, {
      isGroup: normalizedChatId.endsWith("@g.us"),
    });
    const chatDoc = await ensureChat(accountDoc, normalizedChatId, {}, targetContact);

    const replyMessageId = content?.reply?.replyMessageId || null;
    let replyToDoc = null;
    if (replyMessageId) {
      replyToDoc = await MessageModel.findOne({
        accountId,
        chatId: normalizedChatId,
        messageId: replyMessageId,
      });
    }

    const bufferLength = content?.buffer ? content.buffer.length : 0;
    const bufferSha = content?.buffer
      ? crypto.createHash("sha256").update(content.buffer).digest("hex")
      : null;

    const textSummary =
      content?.text ||
      content?.caption ||
      content?.pollName ||
      content?.displayName ||
      (type === "location" ? `[Konum: ${content.latitude}, ${content.longitude}]` : `[${type}]`);

    const msgDoc = await MessageModel.findOneAndUpdate(
      { accountId, chatId: normalizedChatId, messageId },
      {
        $set: {
          account: accountDoc._id,
          chat: chatDoc._id,
          sender: senderContact?._id || null,
          senderJid: actorJid,
          replyTo: replyToDoc?._id || null,
          replyToMessageId: replyMessageId,
          clientMessageId: content?.clientMessageId || null,
          direction: "outbound",
          isFromMe: true,
          type,
          content: {
            text: String(content?.text ?? content?.caption ?? ""),
            caption: content?.caption || "",
            url: content?.url || (content?.fileName ? `upload://${content.fileName}` : ""),
            mimetype: content?.mimetype || "text/plain",
            fileName: content?.fileName || null,
            fileSha256: bufferSha,
            fileLength: bufferLength || String(content?.text ?? content?.caption ?? "").length,
            latitude: content?.latitude ?? null,
            longitude: content?.longitude ?? null,
            displayName: content?.displayName || null,
            vcard: content?.vcard || null,
            pollName: content?.pollName || null,
            pollValues: Array.isArray(content?.pollValues) ? content.pollValues : [],
            ptt: Boolean(content?.ptt),
          },
          status: "sent",
          timestamp,
        },
        $setOnInsert: {
          accountId,
          chatId: normalizedChatId,
          messageId,
        },
      },
      { upsert: true, new: true }
    );

    await ChatModel.updateOne(
      { _id: chatDoc._id },
      {
        $set: {
          lastMessage: msgDoc._id,
          lastMessageText: textSummary,
          lastMessageType: type,
          lastMessageAt: timestamp,
        },
      }
    );

    await logActivity({
      accountId,
      accountDoc,
      chatDoc,
      messageDoc: msgDoc,
      contactDoc: targetContact,
      category: normalizedChatId.endsWith("@g.us") ? "group" : "message",
      action: "message.sent",
      actorJid,
      targetJid: normalizedChatId,
      summary: `API üzerinden ${type} mesajı gönderildi`,
      metadata: { messageId, type, to: normalizedChatId },
    });

    return msgDoc;
  } catch (err) {
    console.error("⚠️ recordOutboundMessage hatası:", err.message);
    return null;
  }
}

async function recordMessageReaction({
  accountId,
  to,
  messageId,
  emoji,
  senderJid,
  fromMe = true,
}) {
  if (!isDbConnected()) return null;
  try {
    const normalizedChatId = await normalizeJid(to);
    const actor = (await normalizeJid(senderJid)) || accountId;
    const accountDoc = await ensureAccount(accountId);
    const chatDoc = await ensureChat(accountDoc, normalizedChatId);

    const msgDoc = await MessageModel.findOne({
      accountId,
      chatId: normalizedChatId,
      messageId,
    });

    if (msgDoc) {
      const filtered = (msgDoc.reactions || []).filter((r) => r.senderJid !== actor);
      if (emoji && emoji.trim() !== "") {
        filtered.push({
          emoji,
          senderJid: actor,
          fromMe,
          updatedAt: new Date(),
        });
      }
      msgDoc.reactions = filtered;
      await msgDoc.save();
    }

    await logActivity({
      accountId,
      accountDoc,
      chatDoc,
      messageDoc: msgDoc,
      category: "message",
      action: emoji && emoji.trim() !== "" ? "message.reaction_added" : "message.reaction_removed",
      actorJid: actor,
      targetJid: normalizedChatId,
      summary: emoji ? `Mesaja '${emoji}' reaksiyonu bırakıldı` : "Mesaj reaksiyonu kaldırıldı",
      metadata: { messageId, emoji },
    });

    return msgDoc;
  } catch (err) {
    console.error("⚠️ recordMessageReaction hatası:", err.message);
    return null;
  }
}

async function recordMessageEdit({ accountId, to, messageId, newText, actorJid }) {
  if (!isDbConnected()) return null;
  try {
    const normalizedChatId = await normalizeJid(to);
    const actor = (await normalizeJid(actorJid)) || accountId;
    const accountDoc = await ensureAccount(accountId);
    const chatDoc = await ensureChat(accountDoc, normalizedChatId);

    const msgDoc = await MessageModel.findOne({
      accountId,
      chatId: normalizedChatId,
      messageId,
    });

    const now = new Date();
    if (msgDoc) {
      const prevText = msgDoc.content?.text || msgDoc.content?.caption || "";
      msgDoc.editHistory.push({ previousText: prevText, editedAt: now });
      msgDoc.content.text = newText;
      if (msgDoc.content.caption) msgDoc.content.caption = newText;
      msgDoc.isEdited = true;
      msgDoc.editedAt = now;
      await msgDoc.save();

      if (chatDoc && String(chatDoc.lastMessage) === String(msgDoc._id)) {
        chatDoc.lastMessageText = newText;
        await chatDoc.save();
      }
    }

    await logActivity({
      accountId,
      accountDoc,
      chatDoc,
      messageDoc: msgDoc,
      category: "message",
      action: "message.edited",
      actorJid: actor,
      targetJid: normalizedChatId,
      summary: "Mesaj metni düzenlendi",
      metadata: { messageId, newText },
    });

    return msgDoc;
  } catch (err) {
    console.error("⚠️ recordMessageEdit hatası:", err.message);
    return null;
  }
}

async function recordMessageDelete({ accountId, to, messageId, actorJid, fromMe = true }) {
  if (!isDbConnected()) return null;
  try {
    const normalizedChatId = await normalizeJid(to);
    const actor = (await normalizeJid(actorJid)) || accountId;
    const accountDoc = await ensureAccount(accountId);
    const chatDoc = await ensureChat(accountDoc, normalizedChatId);

    const msgDoc = await MessageModel.findOneAndUpdate(
      { accountId, chatId: normalizedChatId, messageId },
      {
        $set: {
          isDeleted: true,
          status: "deleted",
          deletedAt: new Date(),
        },
      },
      { new: true }
    );

    if (msgDoc && chatDoc && String(chatDoc.lastMessage) === String(msgDoc._id)) {
      chatDoc.lastMessageText = "[Mesaj silindi]";
      await chatDoc.save();
    }

    await logActivity({
      accountId,
      accountDoc,
      chatDoc,
      messageDoc: msgDoc,
      category: "message",
      action: "message.deleted",
      actorJid: actor,
      targetJid: normalizedChatId,
      summary: "Mesaj silindi",
      metadata: { messageId, fromMe },
    });

    return msgDoc;
  } catch (err) {
    console.error("⚠️ recordMessageDelete hatası:", err.message);
    return null;
  }
}

async function recordMessagesRead({ accountId, keys, actorJid }) {
  if (!isDbConnected()) return null;
  try {
    const accountDoc = await ensureAccount(accountId);
    const actor = (await normalizeJid(actorJid)) || accountId;
    const chatIds = new Set();

    for (const k of keys) {
      if (!k?.remoteJid || !k?.id) continue;
      const normalizedChatId = await normalizeJid(k.remoteJid);
      chatIds.add(normalizedChatId);
      await MessageModel.updateOne(
        { accountId, chatId: normalizedChatId, messageId: k.id },
        { $set: { status: "read" } }
      );
    }

    for (const cid of chatIds) {
      const chatDoc = await ensureChat(accountDoc, cid, { unreadCount: 0 });
      await logActivity({
        accountId,
        accountDoc,
        chatDoc,
        category: "chat",
        action: "message.read",
        actorJid: actor,
        targetJid: cid,
        summary: `${keys.length} mesaj okundu işaretlendi`,
        metadata: { keys },
      });
    }
  } catch (err) {
    console.error("⚠️ recordMessagesRead hatası:", err.message);
  }
}

async function recordChatStateChange({ accountId, jid, action, patch, summary, metadata }) {
  if (!isDbConnected()) return null;
  try {
    const accountDoc = await ensureAccount(accountId);
    const normalizedJid = await normalizeJid(jid);
    const chatDoc = await ensureChat(accountDoc, normalizedJid, patch);

    await logActivity({
      accountId,
      accountDoc,
      chatDoc,
      category: "chat",
      action,
      actorJid: accountDoc?.jid || accountId,
      targetJid: normalizedJid,
      summary,
      metadata,
    });
    return chatDoc;
  } catch (err) {
    console.error("⚠️ recordChatStateChange hatası:", err.message);
    return null;
  }
}

async function recordGroupChange({
  accountId,
  groupId,
  action,
  chatPatch = {},
  summary = "",
  metadata = {},
}) {
  if (!isDbConnected()) return null;
  try {
    const accountDoc = await ensureAccount(accountId);
    const normalizedGroupId = await normalizeJid(groupId);
    const contactDoc = await ensureContact(accountDoc, normalizedGroupId, {
      isGroup: true,
      ...(chatPatch.name ? { name: chatPatch.name } : {}),
    });
    const chatDoc = await ensureChat(
      accountDoc,
      normalizedGroupId,
      { chatType: "group", ...chatPatch },
      contactDoc
    );

    await logActivity({
      accountId,
      accountDoc,
      chatDoc,
      contactDoc,
      category: "group",
      action,
      actorJid: accountDoc?.jid || accountId,
      targetJid: normalizedGroupId,
      summary,
      metadata,
    });
    return chatDoc;
  } catch (err) {
    console.error("⚠️ recordGroupChange hatası:", err.message);
    return null;
  }
}

async function recordProfileOrStatusChange({
  accountId,
  category,
  action,
  targetJid = null,
  contactPatch = null,
  accountPatch = null,
  summary = "",
  metadata = {},
}) {
  if (!isDbConnected()) return null;
  try {
    const accountDoc = await ensureAccount(accountId, accountPatch || {});
    let contactDoc = null;
    let chatDoc = null;
    const normalizedTarget = targetJid ? await normalizeJid(targetJid) : null;

    if (normalizedTarget && normalizedTarget !== "status@broadcast") {
      contactDoc = await ensureContact(accountDoc, normalizedTarget, contactPatch || {});
      if (contactPatch?.isBlocked !== undefined) {
        chatDoc = await ensureChat(
          accountDoc,
          normalizedTarget,
          { isBlocked: contactPatch.isBlocked },
          contactDoc
        );
      }
    }

    await logActivity({
      accountId,
      accountDoc,
      chatDoc,
      contactDoc,
      category,
      action,
      actorJid: accountDoc?.jid || accountId,
      targetJid: normalizedTarget,
      summary,
      metadata,
    });
  } catch (err) {
    console.error("⚠️ recordProfileOrStatusChange hatası:", err.message);
  }
}

async function getChats(accountId, { chatType, archived, limit = 50, page = 1 } = {}) {
  const filter = { accountId };
  if (chatType) filter.chatType = chatType;
  if (archived !== undefined) filter.archived = archived === "true" || archived === true;

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;

  const [items, total] = await Promise.all([
    ChatModel.find(filter)
      .populate("contact", "jid name isGroup isBlocked lastPresence lastActive")
      .populate("lastMessage", "messageId type content.text content.caption status isEdited isDeleted timestamp senderJid")
      .sort({ pinned: -1, lastMessageAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    ChatModel.countDocuments(filter),
  ]);

  return { items, total, page: Number(page) || 1, limit: safeLimit };
}

async function getChatMessages(accountId, chatId, { limit = 50, page = 1 } = {}) {
  const normalizedChatId = await normalizeJid(chatId);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;

  const filter = { accountId, chatId: normalizedChatId };
  const [items, total] = await Promise.all([
    MessageModel.find(filter)
      .populate("sender", "jid name isGroup")
      .populate("replyTo", "messageId senderJid type content.text content.caption")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    MessageModel.countDocuments(filter),
  ]);

  return { chatId: normalizedChatId, items, total, page: Number(page) || 1, limit: safeLimit };
}

async function getActivities(accountId, { category, action, limit = 50, page = 1 } = {}) {
  const filter = { accountId };
  if (category) filter.category = category;
  if (action) filter.action = action;

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;

  const [items, total] = await Promise.all([
    ActivityLogModel.find(filter)
      .populate("account", "accountId jid status")
      .populate("chat", "chatId chatType name")
      .populate("message", "messageId type content.text isEdited isDeleted status")
      .populate("contact", "jid name isGroup isBlocked")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    ActivityLogModel.countDocuments(filter),
  ]);

  return { items, total, page: Number(page) || 1, limit: safeLimit };
}

module.exports = {
  normalizeJid,
  ensureAccount,
  ensureContact,
  ensureChat,
  logActivity,
  recordAccountEvent,
  recordInboundMessage,
  recordOutboundMessage,
  recordMessageReaction,
  recordMessageEdit,
  recordMessageDelete,
  recordMessagesRead,
  recordChatStateChange,
  recordGroupChange,
  recordProfileOrStatusChange,
  getChats,
  getChatMessages,
  getActivities,
};

