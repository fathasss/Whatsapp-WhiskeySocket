const { handleMediaMessage } = require("./media.service.js");

const WRAPPER_TYPES = new Set([
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "ephemeralMessage",
  "documentWithCaptionMessage",
]);

async function parseMessage(msg) {
  if (!msg?.message) return null;

  let content = {
    text: "",
    caption: "",
    url: "text://message",
    mimetype: "text/plain",
    fileSha256: "0",
    fileLength: 0,
  };

  const messageKeys = Object.keys(msg.message).filter((k) => k !== "messageContextInfo");
  if (!messageKeys.length) return null;

  const messageType = messageKeys[0];
  let rawMessage = msg.message[messageType];
  let actualMessageType = messageType;
  let linkedMessageId = null;

  // Unwrapping viewOnce / ephemeral / documentWithCaption (iç içe sarılı mesajlar dahil)
  let unwrapDepth = 0;
  while (WRAPPER_TYPES.has(actualMessageType) && rawMessage?.message && unwrapDepth < 3) {
    const innerKeys = Object.keys(rawMessage.message).filter((k) => k !== "messageContextInfo");
    if (!innerKeys.length) break;
    const innerType = innerKeys[0];
    console.log("📦 Unwrapping message type:", innerType);
    rawMessage = rawMessage.message[innerType];
    actualMessageType = innerType;
    unwrapDepth++;
  }

  const clientMessageId =
    rawMessage?.contextInfo?.clientMessageId ||
    msg.message?.imageMessage?.contextInfo?.clientMessageId ||
    msg.message?.extendedTextMessage?.contextInfo?.clientMessageId ||
    msg.message?.documentMessage?.contextInfo?.clientMessageId;

  try {
    if (actualMessageType === "conversation" && rawMessage) {
      if (typeof rawMessage === "string") content.text = rawMessage;
      else if (Array.isArray(rawMessage)) content.text = rawMessage.join("");
      else if (typeof rawMessage === "object") content.text = JSON.stringify(rawMessage);
      else content.text = String(rawMessage);
    } else if (actualMessageType === "extendedTextMessage" && rawMessage?.text) {
      content.text = rawMessage.text || "";
    } else if (actualMessageType === "imageMessage" && rawMessage) {
      await handleMediaMessage(rawMessage, "image", content);
    } else if (actualMessageType === "videoMessage" && rawMessage) {
      await handleMediaMessage(rawMessage, "video", content);
    } else if (actualMessageType === "documentMessage" && rawMessage) {
      await handleMediaMessage(rawMessage, "document", content);
    } else if (actualMessageType === "audioMessage" && rawMessage) {
      await handleMediaMessage(rawMessage, "audio", content);
    } else if (actualMessageType === "stickerMessage" && rawMessage) {
      await handleMediaMessage(rawMessage, "sticker", content);
    } else if (actualMessageType === "contactMessage" && rawMessage?.displayName) {
      content.text = `[Kişi: ${rawMessage.displayName || "Bilinmeyen"}]`;
    } else if (actualMessageType === "locationMessage" && rawMessage) {
      content.text = `[Konum: ${rawMessage.degreesLatitude}, ${rawMessage.degreesLongitude}]`;
    } else if (actualMessageType === "liveLocationMessage") {
      content.text = "[Canlı konum paylaşımı]";
    } else if (actualMessageType === "contactsArrayMessage" && rawMessage?.contacts) {
      content.text = `[${rawMessage.contacts?.length || 0} kişi paylaşıldı]`;
    } else if (actualMessageType === "groupInviteMessage" && rawMessage) {
      content.text = `[Grup daveti: ${rawMessage.groupName || "Bilinmeyen grup"}]`;
    } else if (actualMessageType === "buttonsMessage" && rawMessage) {
      content.text = rawMessage.contentText || "[Buton mesajı]";
    } else if (actualMessageType === "templateMessage") {
      content.text = "[Şablon mesajı]";
    } else if (actualMessageType === "listMessage" && rawMessage) {
      content.text = rawMessage.description || "[Liste mesajı]";
    } else if (actualMessageType === "reactionMessage" && rawMessage) {
      const reactedEmoji = rawMessage.text || "❤️";
      content.text = `[Tepki: ${reactedEmoji}]`;
      const targetMessageId = rawMessage.key?.id;
      if (targetMessageId !== null && targetMessageId !== undefined) {
        linkedMessageId = String(targetMessageId);
      }
    } else if (
      (actualMessageType === "pollCreationMessage" ||
        actualMessageType === "pollCreationMessageV2" ||
        actualMessageType === "pollCreationMessageV3") &&
      rawMessage
    ) {
      content.text = `[Anket: ${rawMessage.name || "Bilinmeyen anket"}]`;
    } else if (actualMessageType === "pollUpdateMessage") {
      content.text = "[Anket güncellemesi]";
    } else if (actualMessageType === "protocolMessage") {
      return null; // Ignore protocol messages
    } else {
      console.log("❓ Unknown message type, available keys:", Object.keys(rawMessage || {}));
      return null;
    }

    let contextInfo = rawMessage?.contextInfo || {};
    if (contextInfo && contextInfo.stanzaId) {
      linkedMessageId = contextInfo.stanzaId;
    }

    if (!content.fileLength) {
      content.fileLength = content.text?.length || 0;
    }
  } catch (error) {
    console.error("❌ Error processing message content:", error);
    content.text = `[Hata: ${actualMessageType} işlenemedi]`;
  }

  return { content, actualMessageType, linkedMessageId, clientMessageId };
}

module.exports = { parseMessage };
