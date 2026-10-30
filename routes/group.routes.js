const express = require("express");
const router = express.Router();
const { upload } = require("../middlewares/upload.middleware");
const {
  sendGroupMessage,
  editGroupMessage,
  deleteGroupMessage,
  sendGroupReaction,
  listGroupMessages,
  create,
  updateAction,
  updateSubj,
  updateDesc,
  leave,
  getInfo,
} = require("../controllers/group.controller");

/**
 * @swagger
 * tags:
 *   - name: Group
 *     description: WhatsApp grup yönetimi, grup mesajlaşma ve ilişkisel grup geçmişi
 */

/**
 * @swagger
 * /group/messages/{accountId}/{groupId}:
 *   get:
 *     summary: Belirli bir grubun mesaj geçmişini (üye/gönderen ve alıntı ilişkileriyle) getirir
 *     tags: [Group]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         example: "1234567890@g.us"
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
 *         description: Grup mesaj geçmişi getirildi
 */
router.get("/messages/:accountId/:groupId", listGroupMessages);

/**
 * @swagger
 * /group/sendmessage/{accountId}:
 *   post:
 *     summary: Gruba mesaj gönderir (metin, resim, video, belge, ses, çıkartma, konum, kişi, anket)
 *     tags: [Group]
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
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *               type:
 *                 type: string
 *                 enum: [text, image, video, document, audio, sticker, location, contact, poll, reaction]
 *               content:
 *                 type: object
 *             required: [groupId, type, content]
 *           examples:
 *             GroupText:
 *               summary: Gruba metin mesajı
 *               value:
 *                 groupId: "1234567890@g.us"
 *                 type: "text"
 *                 content:
 *                   text: "Herkese merhaba!"
 *             GroupPoll:
 *               summary: Gruba anket mesajı
 *               value:
 *                 groupId: "1234567890@g.us"
 *                 type: "poll"
 *                 content:
 *                   pollName: "Toplantı saati?"
 *                   pollValues: ["10:00", "14:00", "16:00"]
 *                   selectableCount: 1
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *               type:
 *                 type: string
 *                 enum: [image, video, document, audio, sticker]
 *               caption:
 *                 type: string
 *               mentions:
 *                 type: string
 *                 description: JSON string array (örn. '["905xxxxxxxxx@s.whatsapp.net"]')
 *               ptt:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Grup mesajı gönderildi ve MongoDB'ye kaydedildi
 */
router.post("/sendmessage/:accountId", upload.single("file"), sendGroupMessage);

/**
 * @swagger
 * /group/editmessage/{accountId}:
 *   post:
 *     summary: Grupta gönderilmiş bir mesajı düzenler
 *     tags: [Group]
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
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *               messageId:
 *                 type: string
 *                 example: "3EB0XXXXXXXXXXXX"
 *               newText:
 *                 type: string
 *                 example: "Güncellenmiş grup mesajı"
 *             required: [groupId, messageId, newText]
 *     responses:
 *       200:
 *         description: Grup mesajı düzenlendi
 */
router.post("/editmessage/:accountId", editGroupMessage);

/**
 * @swagger
 * /group/deletemessage/{accountId}:
 *   post:
 *     summary: Gruptaki bir mesajı herkes için siler (yönetici ise başka üyenin mesajını da silebilir)
 *     tags: [Group]
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
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *               messageId:
 *                 type: string
 *                 example: "3EB0XXXXXXXXXXXX"
 *               fromMe:
 *                 type: boolean
 *                 example: true
 *               participant:
 *                 type: string
 *                 description: "Başka bir üyenin mesajı siliniyorsa (fromMe: false) o üyenin JID değeri"
 *                 example: "905xxxxxxxxx@s.whatsapp.net"
 *             required: [groupId, messageId]
 *     responses:
 *       200:
 *         description: Grup mesajı silindi
 */
router.post("/deletemessage/:accountId", deleteGroupMessage);

/**
 * @swagger
 * /group/sendreaction/{accountId}:
 *   post:
 *     summary: Gruptaki bir mesaja emoji reaksiyonu bırakır veya kaldırır
 *     tags: [Group]
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
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *               type:
 *                 type: string
 *                 enum: [react, reaction]
 *                 example: "react"
 *               content:
 *                 type: object
 *                 properties:
 *                   emoji:
 *                     type: string
 *                     example: "🔥"
 *                   messageId:
 *                     type: string
 *                     example: "3EB0XXXXXXXXXXXX"
 *                   fromMe:
 *                     type: boolean
 *                     example: false
 *                   participant:
 *                     type: string
 *                     example: "905xxxxxxxxx@s.whatsapp.net"
 *     responses:
 *       200:
 *         description: Grup mesajına reaksiyon gönderildi
 */
router.post("/sendreaction/:accountId", sendGroupReaction);

/**
 * @swagger
 * /group/create/{accountId}:
 *   post:
 *     summary: Yeni WhatsApp grubu oluşturur
 *     tags: [Group]
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
 *               subject:
 *                 type: string
 *                 example: "Yeni Proje Grubu"
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["905xxxxxxxxx@s.whatsapp.net", "905yyyyyyy@s.whatsapp.net"]
 *     responses:
 *       200:
 *         description: Grup oluşturuldu
 */
router.post("/create/:accountId", create);

/**
 * @swagger
 * /group/participants/{accountId}:
 *   post:
 *     summary: Gruba üye ekler, çıkarır, admin yapar veya adminliğini alır
 *     tags: [Group]
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
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["905xxxxxxxxx@s.whatsapp.net"]
 *               action:
 *                 type: string
 *                 enum: [add, remove, promote, demote]
 *                 example: "add"
 *     responses:
 *       200:
 *         description: İşlem başarılı
 */
router.post("/participants/:accountId", updateAction);

/**
 * @swagger
 * /group/subject/{accountId}:
 *   post:
 *     summary: Grubun adını (başlığını) değiştirir
 *     tags: [Group]
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
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *               subject:
 *                 type: string
 *                 example: "Yeni Grup Adı"
 *     responses:
 *       200:
 *         description: Grup adı güncellendi
 */
router.post("/subject/:accountId", updateSubj);

/**
 * @swagger
 * /group/description/{accountId}:
 *   post:
 *     summary: Grubun açıklamasını değiştirir
 *     tags: [Group]
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
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *               description:
 *                 type: string
 *                 example: "Grup kuralları: 1..."
 *     responses:
 *       200:
 *         description: Grup açıklaması güncellendi
 */
router.post("/description/:accountId", updateDesc);

/**
 * @swagger
 * /group/leave/{accountId}:
 *   post:
 *     summary: Gruptan çıkar (Leave)
 *     tags: [Group]
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
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *     responses:
 *       200:
 *         description: Gruptan çıkıldı
 */
router.post("/leave/:accountId", leave);

/**
 * @swagger
 * /group/info/{accountId}:
 *   post:
 *     summary: Grubun üyelerini ve bilgilerini getirir
 *     tags: [Group]
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
 *               groupId:
 *                 type: string
 *                 example: "1234567890@g.us"
 *     responses:
 *       200:
 *         description: Bilgiler getirildi
 */
router.post("/info/:accountId", getInfo);

module.exports = router;
