const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const crypto = require("crypto");

async function handleMediaMessage(mediaMessage, type, content) {
  try {
    // Caption varsa ekle
    if (mediaMessage.caption) {
      content.caption = mediaMessage.caption;
      content.text = mediaMessage.caption; // lastMessage için
    } else {
      content.text = `[${type.charAt(0).toUpperCase() + type.slice(1)}]`;
    }

    // Media key kontrolü
    if (!mediaMessage.mediaKey) {
      console.warn("⚠️ Media key yok, dosya indirilemez");
      content.text = `[${
        type.charAt(0).toUpperCase() + type.slice(1)
      } - indirilemedi]`;
      return;
    }

    console.log("⬇️ Media indiriliyor...");
    const stream = await downloadContentFromMessage(mediaMessage, type);

    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    const mimeType = mediaMessage.mimetype || "application/octet-stream";
    const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const fileLength = buffer.length;
    const url = `data:${mimeType};base64,${buffer.toString("base64")}`;

    // Content objesini güncelle
    content.url = url;
    content.mimetype = mimeType;
    content.fileSha256 = fileSha256;
    content.fileLength = fileLength;

    console.log("✅ Media başarıyla işlendi:", {
      type,
      fileSize: fileLength,
      mimeType,
      hasCaption: !!mediaMessage.caption,
    });
  } catch (error) {
    console.error("❌ Media işleme hatası:", error);
    content.text = `[${type.charAt(0).toUpperCase() + type.slice(1)} - hata]`;
  }
}

module.exports = { handleMediaMessage };
