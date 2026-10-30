const express = require("express");
const router = express.Router();
const { upload } = require("../middlewares/upload.middleware");
const {
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  sendChatReaction,
  listChats,
  listChatMessages,
  markAsRead,
  archiveChat,
  pinChat,
  muteChat,
} = require("../controllers/chat.controller");

/**
 * @swagger
 * tags:
 *   - name: Chat & Inbox
 *     description: Bireysel sohbet mesajlaşma, sohbet yönetimi ve ilişkisel mesaj geçmişi
 */

/**
 * @swagger
 * /chat/list/{accountId}:
 *   get:
 *     summary: Hesaba ait sohbet listesini (son mesaj ve kişi bilgisiyle ilişkili) getirir
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: chatType
 *         schema:
 *           type: string
 *           enum: [individual, group]
 *       - in: query
 *         name: archived
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Sohbet listesi getirildi
 */
router.get("/list/:accountId", listChats);

/**
 * @swagger
 * /chat/messages/{accountId}/{chatId}:
 *   get:
 *     summary: Belirli bir bireysel sohbetin mesaj geçmişini (gönderen ve alıntı ilişkileriyle) getirir
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         example: "905xxxxxxxxx@s.whatsapp.net"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Mesaj geçmişi getirildi
 */
router.get("/messages/:accountId/:chatId", listChatMessages);

/**
 * @swagger
 * /chat/sendmessage/{accountId}:
 *   post:
 *     summary: Bireysel sohbete mesaj gönderir (metin, resim, video, belge, ses, çıkartma, konum, kişi, anket)
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 example: "905xxxxxxxxx@s.whatsapp.net"
 *               type:
 *                 type: string
 *                 enum: [text, image, video, document, audio, sticker, location, contact, poll, reaction]
 *               content:
 *                 type: object
 *             required: [to, type, content]
 *           examples:
 *             Text:
 *               summary: Metin mesajı
 *               value:
 *                 to: "905xxxxxxxxx@s.whatsapp.net"
 *                 type: "text"
 *                 content:
 *                   text: "Merhaba"
 *             Location:
 *               summary: Konum mesajı
 *               value:
 *                 to: "905xxxxxxxxx@s.whatsapp.net"
 *                 type: "location"
 *                 content:
 *                   latitude: 41.0082
 *                   longitude: 28.9784
 *             Poll:
 *               summary: Anket mesajı
 *               value:
 *                 to: "905xxxxxxxxx@s.whatsapp.net"
 *                 type: "poll"
 *                 content:
 *                   pollName: "Hangi gün uygunsunuz?"
 *                   pollValues: ["Pazartesi", "Çarşamba", "Cuma"]
 *                   selectableCount: 1
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               to:
 *                 type: string
 *                 example: "905xxxxxxxxx@s.whatsapp.net"
 *               type:
 *                 type: string
 *                 enum: [image, video, document, audio, sticker]
 *               caption:
 *                 type: string
 *               ptt:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Mesaj gönderildi ve MongoDB'ye kaydedildi
 */
router.post("/sendmessage/:accountId", upload.single("file"), sendChatMessage);

/**
 * @swagger
 * /chat/editmessage/{accountId}:
 *   post:
 *     summary: Bireysel sohbette gönderilmiş bir mesajı düzenler
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 example: "905xxxxxxxxx@s.whatsapp.net"
 *               messageId:
 *                 type: string
 *                 example: "3EB0XXXXXXXXXXXX"
 *               newText:
 *                 type: string
 *                 example: "Düzenlenmiş metin"
 *             required: [to, messageId, newText]
 *     responses:
 *       200:
 *         description: Mesaj düzenlendi
 */
router.post("/editmessage/:accountId", editChatMessage);

/**
 * @swagger
 * /chat/deletemessage/{accountId}:
 *   post:
 *     summary: Bireysel sohbetteki bir mesajı herkes için siler
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 example: "905xxxxxxxxx@s.whatsapp.net"
 *               messageId:
 *                 type: string
 *                 example: "3EB0XXXXXXXXXXXX"
 *               fromMe:
 *                 type: boolean
 *                 example: true
 *             required: [to, messageId]
 *     responses:
 *       200:
 *         description: Mesaj silindi
 */
router.post("/deletemessage/:accountId", deleteChatMessage);

/**
 * @swagger
 * /chat/sendreaction/{accountId}:
 *   post:
 *     summary: Bireysel sohbetteki bir mesaja emoji reaksiyonu bırakır veya kaldırır
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 example: "905xxxxxxxxx@s.whatsapp.net"
 *               type:
 *                 type: string
 *                 enum: [react, reaction]
 *                 example: "react"
 *               content:
 *                 type: object
 *                 properties:
 *                   emoji:
 *                     type: string
 *                     example: "👍"
 *                   messageId:
 *                     type: string
 *                     example: "3EB0XXXXXXXXXXXX"
 *                   fromMe:
 *                     type: boolean
 *                     example: false
 *     responses:
 *       200:
 *         description: Reaksiyon gönderildi
 */
router.post("/sendreaction/:accountId", sendChatReaction);

/**
 * @swagger
 * /chat/read/{accountId}:
 *   post:
 *     summary: Gelen mesajları 'Okundu' (Mavi Tik) olarak işaretler
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               keys:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     remoteJid:
 *                       type: string
 *                       example: "905xxxxxxxxx@s.whatsapp.net"
 *                     id:
 *                       type: string
 *                       example: "3EB0XXXXXXXXXXXX"
 *                     participant:
 *                       type: string
 *     responses:
 *       200:
 *         description: Mesajlar okundu işaretlendi
 */
router.post("/read/:accountId", markAsRead);

/**
 * @swagger
 * /chat/archive/{accountId}:
 *   post:
 *     summary: Sohbeti arşivler veya arşivden çıkarır
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jid:
 *                 type: string
 *                 example: "905xxxxxxxxx@s.whatsapp.net"
 *               isArchive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Sohbet arşiv durumu güncellendi
 */
router.post("/archive/:accountId", archiveChat);

/**
 * @swagger
 * /chat/pin/{accountId}:
 *   post:
 *     summary: Sohbeti sabitler (Pin) veya sabitlenmesini kaldırır
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jid:
 *                 type: string
 *                 example: "905xxxxxxxxx@s.whatsapp.net"
 *               isPinned:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Sohbet sabitleme durumu güncellendi
 */
router.post("/pin/:accountId", pinChat);

/**
 * @swagger
 * /chat/mute/{accountId}:
 *   post:
 *     summary: Sohbeti belirli bir süre sessize alır (Mute) veya sessizden çıkarır
 *     tags: [Chat & Inbox]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jid:
 *                 type: string
 *                 example: "905xxxxxxxxx@s.whatsapp.net"
 *               muteDurationMs:
 *                 type: number
 *                 example: 28800000
 *     responses:
 *       200:
 *         description: Sohbet sessize alma durumu güncellendi
 */
router.post("/mute/:accountId", muteChat);

module.exports = router;
