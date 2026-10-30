const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },
    accountId: { type: String, required: true, index: true },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
      index: true,
    },
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      default: null,
      index: true,
    },
    category: {
      type: String,
      enum: ["session", "message", "chat", "group", "profile", "status"],
      required: true,
      index: true,
    },
    action: { type: String, required: true, index: true },
    actorJid: { type: String, default: null },
    targetJid: { type: String, default: null },
    summary: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activityLogSchema.index({ accountId: 1, createdAt: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);

