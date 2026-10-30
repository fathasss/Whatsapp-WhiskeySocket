const { getAccount } = require("../../models/accounts");
const { senderInfo, buildContextInfo } = require("../../utils/whatsapp.utils");
const { parseMessage } = require("./message.parser");
const {
  recordInboundMessage,
  recordOutboundMessage,
  recordMessageReaction,
  recordMessageEdit,
  recordMessageDelete,
  recordGroupChange,
} = require("./persistence.service");

async function listenMessages(accountId, sock) {
  const messageHandler = async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || !msg.key) continue;

      const _chatId = msg.key.remoteJid;
      if (!_chatId || _chatId === "status@broadcast") continue;

      // Karşı taraftan gelen silme (REVOKE) veya düzenleme (MESSAGE_EDIT) protokol mesajları
      const proto = msg.message?.protocolMessage;
      if (proto) {
        const targetId = proto.key?.id;
        const sender = await senderInfo(msg);
        if (targetId && (proto.type === 0 || proto.type === "REVOKE")) {
          await recordMessageDelete({
            accountId,
            to: _chatId,
            messageId: targetId,
            actorJid: sender.jid,
            fromMe: Boolean(msg.key.fromMe),
          });
        } else if (targetId && proto.editedMessage) {
          const editedText =
            proto.editedMessage.conversation ||
            proto.editedMessage.extendedTextMessage?.text ||
            proto.editedMessage.imageMessage?.caption ||
            proto.editedMessage.videoMessage?.caption ||
            "";
          if (editedText) {
            await recordMessageEdit({
              accountId,
              to: _chatId,
              messageId: targetId,
              newText: editedText,
              actorJid: sender.jid,
            });
          }
        }
        continue;
      }

      const parsedData = await parseMessage(msg);
      if (!parsedData) continue;

      const { content, actualMessageType, linkedMessageId, clientMessageId } = parsedData;
      const sender = await senderInfo(msg);

      await recordInboundMessage({
        accountId,
        msg,
        sock,
        sender,
        chatId: _chatId,
        content,
        actualMessageType,
        linkedMessageId,
        clientMessageId,
      });
    }
  };

  sock.ev.on("messages.upsert", messageHandler);

  sock.ev.on("groups.update", async (updates) => {
    for (const upd of updates || []) {
      if (!upd.id) continue;
      await recordGroupChange({
        accountId,
        groupId: upd.id,
        action: "group.updated_remote",
        chatPatch: {
          ...(upd.subject ? { name: upd.subject } : {}),
          ...(upd.desc !== undefined ? { description: upd.desc } : {}),
        },
        summary: "Grup bilgisi WhatsApp üzerinden güncellendi",
        metadata: upd,
      });
    }
  });

  sock.ev.on("group-participants.update", async (event) => {
    if (!event?.id) return;
    await recordGroupChange({
      accountId,
      groupId: event.id,
      action: `group.participants_${event.action || "updated"}`,
      summary: `Grup üye hareketi (${event.action})`,
      metadata: {
        participants: event.participants,
        action: event.action,
        author: event.author,
      },
    });
  });

  sock.ev.on("messages.media-update", () => {});
  sock.ev.on("history.set", () => {});
  sock.ev.on("presence.update", () => {});
}

function resolveMediaInput(content) {
  if (content.buffer) return content.buffer;
  if (content.base64) {
    const base64Data = content.base64.split(",").pop();
    return Buffer.from(base64Data, "base64");
  }
  if (content.url) return { url: content.url };
  throw new Error("Missing media file, base64, or url in content.");
}

async function sendMessageService(accountId, to, type, content) {
  const account = getAccount(accountId);
  if (!account) throw new Error("Account not linked!");

  const sock = account.sock;
  if (!sock) throw new Error("Socket not ready!");
  if (!content) throw new Error("Missing content object.");

  let messageOptions = {};
  const contextInfo = buildContextInfo(content);

  switch (type) {
    case "text": {
      const textBody = content.text ?? content.caption;
      if (textBody === undefined || textBody === null || textBody === "") {
        throw new Error("Missing text or caption in content.");
      }
      messageOptions = { text: String(textBody), contextInfo };
      break;
    }
    case "image":
      messageOptions = {
        image: resolveMediaInput(content),
        caption: content.caption || "📷 Fotoğraf",
        ...(content.mentions ? { mentions: content.mentions } : {}),
        contextInfo,
      };
      break;
    case "video":
      messageOptions = {
        video: resolveMediaInput(content),
        caption: content.caption || "📷 Video",
        ...(content.mentions ? { mentions: content.mentions } : {}),
        contextInfo,
      };
      break;
    case "document":
      messageOptions = {
        document: resolveMediaInput(content),
        mimetype: content.mimetype || "application/octet-stream",
        fileName: content.fileName || "file",
        caption: content.caption || "📄 Dosya",
        ...(content.mentions ? { mentions: content.mentions } : {}),
        contextInfo,
      };
      break;
    case "audio":
      messageOptions = {
        audio: resolveMediaInput(content),
        mimetype: content.mimetype || "audio/mp4",
        ptt: content.ptt || false,
        contextInfo,
      };
      break;
    case "sticker":
      messageOptions = {
        sticker: resolveMediaInput(content),
        contextInfo,
      };
      break;
    case "location":
      messageOptions = {
        location: {
          degreesLatitude: content.latitude,
          degreesLongitude: content.longitude,
        },
        contextInfo,
      };
      break;
    case "contact":
      messageOptions = {
        contacts: {
          displayName: content.displayName,
          contacts: [{ vcard: content.vcard }],
        },
        contextInfo,
      };
      break;
    case "poll":
      messageOptions = {
        poll: {
          name: content.pollName,
          values: content.pollValues,
          selectableCount: content.selectableCount || 1,
        },
        contextInfo,
      };
      break;
    default:
      throw new Error("Unsupported message type.");
  }

  const sentResult = await sock.sendMessage(to, messageOptions);
  await recordOutboundMessage({
    accountId,
    to,
    type,
    content,
    sentResult,
    selfJid: sock.user?.id,
  });

  return sentResult;
}

async function sendReactionService(accountId, to, type, content) {
  const account = getAccount(accountId);
  if (!account) throw new Error("Account not linked!");

  const sock = account.sock;
  if (!sock) throw new Error("Socket not ready!");
  if (!content) throw new Error("Missing content object.");

  let messageOptions = {};

  switch (type) {
    case "react":
    case "reaction":
      if (content.emoji === undefined || content.emoji === null || !content.messageId) {
        throw new Error("Reaction requires emoji and messageId.");
      }
      messageOptions = {
        react: {
          text: String(content.emoji),
          key: {
            remoteJid: to,
            fromMe: content.fromMe ?? false,
            id: content.messageId,
            ...(to.endsWith("@g.us") && content.participant
              ? { participant: content.participant }
              : {}),
          },
        },
      };
      break;
    default:
      throw new Error("Unsupported message type.");
  }

  const sentResult = await sock.sendMessage(to, messageOptions);
  await recordMessageReaction({
    accountId,
    to,
    messageId: content.messageId,
    emoji: String(content.emoji),
    senderJid: sock.user?.id,
    fromMe: true,
  });

  return sentResult;
}

async function deleteMessageService(accountId, to, messageId, fromMe = true, participant = undefined) {
  const account = getAccount(accountId);
  if (!account) throw new Error("Account not linked!");
  const sock = account.sock;
  if (!sock) throw new Error("Socket not ready!");

  const resolvedParticipant = to.endsWith("@g.us")
    ? fromMe
      ? sock.user?.id
      : participant
    : undefined;

  const sentResult = await sock.sendMessage(to, {
    delete: {
      remoteJid: to,
      fromMe,
      id: messageId,
      ...(resolvedParticipant ? { participant: resolvedParticipant } : {}),
    },
  });

  await recordMessageDelete({
    accountId,
    to,
    messageId,
    actorJid: sock.user?.id,
    fromMe,
  });

  return sentResult;
}

async function editMessageService(accountId, to, messageId, newText) {
  const account = getAccount(accountId);
  if (!account) throw new Error("Account not linked!");
  const sock = account.sock;
  if (!sock) throw new Error("Socket not ready!");

  const sentResult = await sock.sendMessage(to, {
    text: newText,
    edit: {
      remoteJid: to,
      fromMe: true,
      id: messageId,
    },
  });

  await recordMessageEdit({
    accountId,
    to,
    messageId,
    newText,
    actorJid: sock.user?.id,
  });

  return sentResult;
}

module.exports = {
  listenMessages,
  sendMessageService,
  sendReactionService,
  deleteMessageService,
  editMessageService,
};
