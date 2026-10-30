const mongoose = require("mongoose");

const participantSubSchema = new mongoose.Schema(
  {
    jid: { type: String, required: true },
    admin: { type: String, default: null },
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    accountId: { type: String, required: true, index: true },
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      default: null,
    },
    chatId: { type: String, required: true },
    chatType: {
      type: String,
      enum: ["individual", "group"],
      required: true,
    },
    name: { type: String, default: "Unknown" },
    description: { type: String, default: "" },
    owner: { type: String, default: null },
    participants: { type: [participantSubSchema], default: [] },
    isActiveMember: { type: Boolean, default: true },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    muted: { type: Boolean, default: false },
    mutedUntil: { type: Date, default: null },
    unreadCount: { type: Number, default: 0 },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageText: { type: String, default: "" },
    lastMessageType: { type: String, default: null },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chatSchema.index({ accountId: 1, chatId: 1 }, { unique: true });
chatSchema.index({ accountId: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Chat", chatSchema);

