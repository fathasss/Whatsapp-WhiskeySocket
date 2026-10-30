const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const { webcrypto } = require("crypto");
const setupSwagger = require("./api-docs/swagger");
const { setupMcpRoutes, closeAllMcpSessions } = require("./mcp/whatsapp-mcp");
const { connectDatabase, disconnectDatabase, isDbConnected } = require("./db/database");
const { autoStartSessions, stopAllSessions } = require("./services/whatsapp/connection.service");
const { applyWebSocketPatch } = require("./utils/ws-patch");

globalThis.crypto = webcrypto;

// Apply WebSocket Patch
applyWebSocketPatch();

const accountRoutes = require("./routes/account.routes");
const chatRoutes = require("./routes/chat.routes");
const groupRoutes = require("./routes/group.routes");
const profileRoutes = require("./routes/profile.routes");
const statusRoutes = require("./routes/status.routes");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
setupSwagger(app);

// Global hata yakalayıcılar
process.on("unhandledRejection", (reason) => {
  console.error("🚨 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("🚨 Uncaught Exception:", err);
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mongodb: isDbConnected() ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

// MCP Streamable HTTP Server (http://localhost:3002/mcp)
setupMcpRoutes(app);

// Routes (Local mod - Authentication devre dışı)
app.use("/account", accountRoutes);
app.use("/chat", chatRoutes);
app.use("/group", groupRoutes);
app.use("/profile", profileRoutes);
app.use("/status", statusRoutes);

const PORT = process.env.PORT || 3002;
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await connectDatabase();
  } catch (err) {
    console.error("⚠️ MongoDB ilk bağlantı hatası:", err.message);
  }
  await autoStartSessions();
});

async function shutdown(signal) {
  console.log(`\n🛑 ${signal} alındı, servis kapatılıyor...`);
  try {
    await closeAllMcpSessions();
    await stopAllSessions();
    await disconnectDatabase();
  } catch (err) {
    console.error("⚠️ Kapanış sırasında hata:", err.message);
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
