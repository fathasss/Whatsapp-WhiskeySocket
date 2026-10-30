const mongoose = require("mongoose");

let connected = false;

mongoose.connection.on("connected", () => {
  connected = true;
  console.log("🟢 MongoDB bağlantısı kuruldu.");
});

mongoose.connection.on("disconnected", () => {
  connected = false;
  console.warn("🟡 MongoDB bağlantısı kesildi.");
});

mongoose.connection.on("error", (err) => {
  console.error("🔴 MongoDB bağlantı hatası:", err.message);
});

async function connectDatabase() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/whatsapp_whiskeysocket";
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });
  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

function isDbConnected() {
  return connected && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  isDbConnected,
};

