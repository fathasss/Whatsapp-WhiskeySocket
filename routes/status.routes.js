const express = require('express');
const router = express.Router();
const { upload } = require('../middlewares/upload.middleware');
const { sendStatus } = require('../controllers/status.controller');

/**
 * @swagger
 * tags:
 *   - name: Status & Stories
 */

/**
 * @swagger
 * /status/send/{accountId}:
 *   post:
 *     summary: WhatsApp durum (hikaye) gönderir
 *     tags: [Status & Stories]
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
 *               type:
 *                 type: string
 *                 enum: [text, image, video]
 *                 description: Hikaye türü
 *                 example: "image"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: (Sadece image ve video için) Medya dosyası
 *               caption:
 *                 type: string
 *                 description: (Sadece image ve video için) Resmin veya videonun altındaki açıklama
 *                 example: "Bugün harika bir gün!"
 *               text:
 *                 type: string
 *                 description: (Sadece text için) Hikayedeki yazı
 *               backgroundColor:
 *                 type: string
 *                 description: (Sadece text için) Arka plan rengi (Örn. #ff0000)
 *     responses:
 *       200:
 *         description: Hikaye başarıyla gönderildi
 */
router.post('/send/:accountId', upload.single('file'), sendStatus);

module.exports = router;
