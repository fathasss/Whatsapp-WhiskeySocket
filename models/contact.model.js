const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    accountId: { type: String, required: true, index: true },
    jid: { type: String, required: true },
    name: { type: String, default: "Unknown" },
    isGroup: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    lastPresence: { type: String, default: null },
    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

contactSchema.index({ accountId: 1, jid: 1 }, { unique: true });

module.exports = mongoose.model("Contact", contactSchema);

