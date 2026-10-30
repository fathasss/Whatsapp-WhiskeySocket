const express = require('express');
const router = express.Router();
const { upload } = require('../middlewares/upload.middleware');
const {
  presence,
  updatePicture,
  updateStatus,
  blockUser
} = require('../controllers/profile.controller');

/**
 * @swagger
 * tags:
 *   - name: Profile & User
 */

/**
 * @swagger
 * /profile/presence/{accountId}:
 *   post:
 *     summary: Karşı tarafa 'Yazıyor...', 'Ses Kaydediyor...' gibi durum (presence) gönderir
 *     tags: [Profile & User]
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
 *               presence:
 *                 type: string
 *                 enum: [unavailable, available, composing, recording, paused]
 *                 example: "composing"
 *     responses:
 *       200:
 *         description: Durum gönderildi
 */
router.post('/presence/:accountId', presence);

/**
 * @swagger
 * /profile/picture/{accountId}:
 *   post:
 *     summary: Profil resmini değiştirir (Kendi profiliniz veya yöneticisi olduğunuz grup)
 *     tags: [Profile & User]
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Yüklenecek resim (Webp veya Jpg)
 *               jid:
 *                 type: string
 *                 description: Opsiyonel. Boş bırakılırsa kendi profil resmini değiştirir.
 *     responses:
 *       200:
 *         description: Profil resmi güncellendi
 */
router.post('/picture/:accountId', upload.single('file'), updatePicture);

/**
 * @swagger
 * /profile/status/{accountId}:
 *   post:
 *     summary: Kendi WhatsApp 'Hakkımda' (About/Status) yazısını günceller
 *     tags: [Profile & User]
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
 *               statusText:
 *                 type: string
 *                 example: "Meşgul. Sadece acil durumlarda yazın."
 *     responses:
 *       200:
 *         description: Status güncellendi
 */
router.post('/status/:accountId', updateStatus);

/**
 * @swagger
 * /profile/block/{accountId}:
 *   post:
 *     summary: Bir numarayı engeller veya engelini kaldırır
 *     tags: [Profile & User]
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
 *               action:
 *                 type: string
 *                 enum: [block, unblock]
 *                 example: "block"
 *     responses:
 *       200:
 *         description: Engelleme işlemi başarılı
 */
router.post('/block/:accountId', blockUser);

module.exports = router;
