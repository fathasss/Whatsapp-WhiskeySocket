const { sendStatusService } = require("../services/whatsapp/status.service");

const sendStatus = async (req, res) => {
  try {
    const { accountId } = req.params;
    let type, content = {};

    // Eğer dosya yüklenmişse (Resim veya Video)
    if (req.file) {
      type = req.body.type || "image"; // 'image' veya 'video'
      
      if (!["image", "video"].includes(type)) {
        return res.status(400).json({ success: false, error: "File uploads must be of type 'image' or 'video'" });
      }

      content = {
        buffer: req.file.buffer,
        caption: req.body.caption || "",
      };
    } 
    // Dosya yoksa sadece JSON ise (Metin Hikaye)
    else {
      type = req.body.type;
      
      if (type !== "text") {
        return res.status(400).json({ success: false, error: "Missing file for media status, or invalid type. Expected 'text'." });
      }

      content = {
        text: req.body.text,
        backgroundColor: req.body.backgroundColor || "#000000"
      };

      if (!content.text) {
        return res.status(400).json({ success: false, error: "Missing 'text' field for text status" });
      }
    }

    const result = await sendStatusService(accountId, type, content);
    return res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  sendStatus
};
