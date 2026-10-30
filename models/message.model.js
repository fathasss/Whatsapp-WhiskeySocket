const mongoose = require("mongoose");

const reactionSubSchema = new mongoose.Schema(
  {
    emoji: { type: String, default: "" },
    senderJid: { type: String, required: true },
    fromMe: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const editHistorySubSchema = new mongoose.Schema(
  {
    previousText: { type: String, default: "" },
    editedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    accountId: { type: String, required: true, index: true },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    chatId: { type: String, required: true, index: true },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      default: null,
    },
    senderJid: { type: String, required: true },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    replyToMessageId: { type: String, default: null },
    messageId: { type: String, required: true },
    clientMessageId: { type: String, default: null },
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },
    isFromMe: { type: Boolean, default: false },
    type: { type: String, required: true },
    content: {
      text: { type: String, default: "" },
      caption: { type: String, default: "" },
      url: { type: String, default: "" },
      mimetype: { type: String, default: "text/plain" },
      fileName: { type: String, default: null },
      fileSha256: { type: String, default: null },
      fileLength: { type: Number, default: 0 },
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      displayName: { type: String, default: null },
      vcard: { type: String, default: null },
      pollName: { type: String, default: null },
      pollValues: { type: [String], default: [] },
      ptt: { type: Boolean, default: false },
    },
    reactions: { type: [reactionSubSchema], default: [] },
    status: {
      type: String,
      enum: ["sent", "delivered", "read", "deleted"],
      default: "sent",
    },
    isEdited: { type: Boolean, default: false },
    editHistory: { type: [editHistorySubSchema], default: [] },
    editedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

messageSchema.index({ accountId: 1, chatId: 1, messageId: 1 }, { unique: true });
messageSchema.index({ chat: 1, timestamp: -1 });

module.exports = mongoose.model("Message", messageSchema);

