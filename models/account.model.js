const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    accountId: { type: String, required: true, unique: true, index: true },
    jid: { type: String, default: null },
    name: { type: String, default: null },
    status: {
      type: String,
      enum: [
        "INITIALIZING",
        "QR_READY",
        "CONNECTED",
        "RECONNECTING",
        "REPLACED",
        "RATE_LIMIT",
        "LOGGED_OUT",
        "STOPPED",
        "CLEARED",
        "ERROR",
      ],
      default: "INITIALIZING",
    },
    statusText: { type: String, default: null },
    lastConnectedAt: { type: Date, default: null },
    lastDisconnectedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Account", accountSchema);

