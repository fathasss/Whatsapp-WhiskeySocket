const express = require("express");
const router = express.Router();
const {
  listAccounts,
  getAccountActivities,
  generateQr,
  startAccount,
  stopAccount,
  clearAccount,
} = require("../controllers/account.controller");

/**
 * @swagger
 * tags:
 *   - name: Account
 *     description: WhatsApp hesap oturum yönetimi ve ilişkisel hareket (ActivityLog) sorgulama
 */

/**
 * @swagger
 * /account/list:
 *   get:
 *     summary: Aktif ve MongoDB'de kayıtlı WhatsApp hesaplarını listeler
 *     tags: [Account]
 *     responses:
 *       200:
 *         description: Hesap listesi getirildi
 */
router.get("/list", listAccounts);

/**
 * @swagger
 * /account/activities/{accountId}:
 *   get:
 *     summary: Hesaba ait tüm ilişkisel hareket kayıtlarını (oturum, mesaj, grup, profil) listeler
 *     tags: [Account]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [session, message, chat, group, profile, status]
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
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
 *         description: Hareket geçmişi getirildi
 */
router.get("/activities/:accountId", getAccountActivities);

/**
 * @swagger
 * /account/start/{accountId}:
 *   post:
 *     summary: Belirtilen WhatsApp hesabı için oturumu başlatır
 *     tags: [Account]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Hesap başlatıldı
 */
router.post("/start/:accountId", startAccount);

/**
 * @swagger
 * /account/stop/{accountId}:
 *   post:
 *     summary: Aktif WhatsApp oturumunu durdurur
 *     tags: [Account]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Hesap durduruldu
 */
router.post("/stop/:accountId", stopAccount);

/**
 * @swagger
 * /account/clear/{accountId}:
 *   post:
 *     summary: Hesabın diskteki kimlik (auth_info) verilerini temizler
 *     tags: [Account]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Hesap kimlik bilgileri silindi
 */
router.post("/clear/:accountId", clearAccount);

/**
 * @swagger
 * /account/generateqr/{accountId}:
 *   post:
 *     summary: Oturum için üretilen güncel QR kodu döndürür
 *     tags: [Account]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: QR kod bilgisi döndürüldü
 */
router.post("/generateqr/:accountId", generateQr);

module.exports = router;
