const { Boom } = require("@hapi/boom");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode");
const { listenMessages } = require("./message.service");
const { recordAccountEvent } = require("./persistence.service");
const { accounts } = require("../../models/accounts");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

const AUTH_BASE_DIR = path.join(__dirname, "../../auth_info");

function getAuthPath(accountId) {
  const safeId = path.basename(String(accountId || "").trim());
  if (!safeId || safeId === "." || safeId === "..") {
    throw new Error("Invalid accountId");
  }
  return path.join(AUTH_BASE_DIR, safeId);
}

async function startWhatsApp(accountId, isReconnect = false) {
  let sock;

  if (
    !isReconnect &&
    accounts[accountId] &&
    ["CONNECTED", "INITIALIZING", "RECONNECTING"].includes(accounts[accountId].status)
  ) {
    console.log(`⚠️ ${accountId} zaten aktif (${accounts[accountId].status}), yeniden başlatılmadı.`);
    return {
      success: true,
      message: `⚠️ WhatsApp session already active for ${accountId}`,
      response: `STATUS: ${accounts[accountId].status} QR : ${accounts[accountId].currentQR}`,
    };
  }

  try {
    console.log(
      isReconnect
        ? `🔁 Reconnecting WhatsApp session for: ${accountId}`
        : `🚀 Starting new WhatsApp session for: ${accountId}`
    );

    if (accounts[accountId]?.sock) {
      try {
        console.log(`🧹 Closing existing socket for ${accountId} before reconnect...`);
        accounts[accountId].sock.ev.removeAllListeners();
        await accounts[accountId].sock.end();
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        console.warn(`⚠️ Failed to clean up old socket for ${accountId}:`, e.message);
      }
    }

    const authPath = getAuthPath(accountId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      logger: pino({ level: "silent" }),
    });

    accounts[accountId] = { sock, currentQR: null, status: "INITIALIZING" };
    await recordAccountEvent(accountId, "INITIALIZING", {
      action: isReconnect ? "session.reconnecting" : "session.start",
      summary: isReconnect ? "Oturum yeniden bağlanıyor" : "Yeni oturum başlatıldı",
    });

    sock.ev.on("connection.update", async (update) => {
      if (!accounts[accountId]) return;

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        accounts[accountId].currentQR = await qrcode.toDataURL(qr);
        accounts[accountId].status = "QR_READY";
        console.log(`🔑 QR code generated for ${accountId}`);
        await recordAccountEvent(accountId, "QR_READY", {
          action: "session.qr_generated",
          summary: "QR kod üretildi",
        });
      }

      if (connection === "open") {
        accounts[accountId].status = "CONNECTED";
        accounts[accountId].currentQR = null;
        console.log(`✅ ${accountId} connected successfully!`);
        await recordAccountEvent(accountId, "CONNECTED", {
          jid: sock.user?.id,
          name: sock.user?.name,
          action: "session.connected",
          summary: "WhatsApp bağlantısı kuruldu",
        });
        if (typeof listenMessages === "function" && !sock._isListening) {
          sock._isListening = true;
          listenMessages(accountId, sock);
          console.log(`🎧 Listening started for ${accountId}`);
        }
      }

      if (connection === "close") {
        if (!accounts[accountId]) return;

        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const errorData = lastDisconnect?.error?.data;
        console.log(`⚠️ ${accountId} disconnected (reason: ${reason})`);

        const isConflict =
          errorData?.content?.[0]?.tag === "conflict" &&
          errorData?.content?.[0]?.attrs?.type === "replaced";

        if (isConflict) {
          console.warn(`⚔️ Conflict detected for ${accountId}. Another session replaced this one.`);
          accounts[accountId].status = "REPLACED";
          await recordAccountEvent(accountId, "REPLACED", {
            action: "session.replaced",
            summary: "Başka bir oturum bu bağlantının yerini aldı",
          });

          setTimeout(() => {
            if (!accounts[accountId]) return;
            console.log(`⏳ Retrying ${accountId} after conflict...`);
            startWhatsApp(accountId, true);
          }, 10 * 60 * 1000);

          return;
        }

        try {
          if (sock?.end) await sock.end();
        } catch (e) {
          console.warn(`⚠️ Socket cleanup failed for ${accountId}:`, e.message);
        }

        switch (reason) {
          case DisconnectReason.loggedOut:
            accounts[accountId].status = "LOGGED_OUT";
            console.log(`❌ ${accountId} logged out manually.`);
            await recordAccountEvent(accountId, "LOGGED_OUT", {
              action: "session.logged_out",
              summary: "Telefondan oturum kapatıldı",
            });
            break;
          case 515:
            console.warn(`🚫 ${accountId} hit rate limit. Retrying in 10s...`);
            accounts[accountId].status = "RATE_LIMIT";
            await recordAccountEvent(accountId, "RATE_LIMIT", {
              action: "session.rate_limit",
              summary: "Rate limit nedeniyle 10 sn sonra yeniden denenecek",
            });
            setTimeout(() => {
              if (accounts[accountId]) startWhatsApp(accountId, true);
            }, 10000);
            break;
          case DisconnectReason.connectionClosed:
          case DisconnectReason.timedOut:
            console.log(`♻️ ${accountId} reconnecting after timeout...`);
            accounts[accountId].status = "RECONNECTING";
            await startWhatsApp(accountId, true);
            break;
          default:
            console.log(`🔄 ${accountId} restarting session...`);
            await startWhatsApp(accountId, true);
            break;
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);

    return {
      success: true,
      message: `✅ WhatsApp session started for ${accountId}`,
      response: `STATUS: ${accounts[accountId].status} QR : ${accounts[accountId].currentQR}`,
    };
  } catch (err) {
    console.error(`❌ startWhatsApp error for ${accountId}:`, err.message || err);

    if (sock?.end) {
      try {
        await sock.end();
        console.log(`🧹 Socket for ${accountId} closed after error.`);
      } catch (closeErr) {
        console.warn(`⚠️ Failed to close socket for ${accountId}:`, closeErr.message);
      }
    }

    return {
      success: false,
      message: err.message || "Unknown error occurred while starting WhatsApp session",
      response: "STATUS : ERROR",
    };
  }
}

async function stopWhatsApp(accountId) {
  try {
    const account = accounts[accountId];
    if (!account || !account.sock) {
      console.log(`⚠️ ${accountId} için aktif bir WhatsApp bağlantısı bulunamadı.`);
      return { success: false, message: "Bağlantı zaten kapalı", response: null };
    }

    const activeSock = account.sock;
    delete accounts[accountId];
    activeSock.ev.removeAllListeners();

    if (activeSock.ws) {
      await activeSock.ws.close();
    } else if (activeSock.end) {
      await activeSock.end();
    }

    console.log(`🛑 ${accountId} için WhatsApp bağlantısı sonlandırıldı.`);
    await recordAccountEvent(accountId, "STOPPED", {
      action: "session.stop",
      summary: "WhatsApp oturumu durduruldu",
    });
    return { success: true, message: "Bağlantı durduruldu", response: null };
  } catch (error) {
    console.error(`❌ ${accountId} durdurulurken hata oluştu:`, error);
    return { success: false, message: "Bağlantı durdurulamadı", response: error.message };
  }
}

async function stopAllSessions() {
  const activeIds = Object.keys(accounts);
  for (const id of activeIds) {
    await stopWhatsApp(id);
  }
}

async function clearAuth(accountId) {
  if (accounts[accountId]) {
    await stopWhatsApp(accountId);
  }

  const authPath = getAuthPath(accountId);
  if (fs.existsSync(authPath)) {
    fs.rmSync(authPath, { recursive: true, force: true });
    console.log(`🗑️ ${accountId} auth bilgileri silindi`);
    await recordAccountEvent(accountId, "CLEARED", {
      action: "session.clear",
      summary: "Hesap kimlik bilgileri (auth_info) temizlendi",
    });
    return { success: true, message: `🗑️ ${accountId} auth bilgileri silindi`, response: null };
  }
  return { success: false, message: `${accountId} ait auth bulunamadı!`, response: null };
}

async function autoStartSessions() {
  if (!fs.existsSync(AUTH_BASE_DIR)) {
    console.warn(`⚠️ ${AUTH_BASE_DIR} bulunamadı, auto start atlandı.`);
    return;
  }

  const accountFolders = fs
    .readdirSync(AUTH_BASE_DIR)
    .filter((f) => fs.lstatSync(path.join(AUTH_BASE_DIR, f)).isDirectory());

  if (accountFolders.length > 0)
    console.log(`🟢 ${accountFolders.length} kayıtlı hesap bulundu.`);
  else
    console.warn("❌ Kayıtlı hesap bulunamadı.");

  for (const accountId of accountFolders) {
    const sessionPath = path.join(AUTH_BASE_DIR, accountId);
    const sessionFiles = fs
      .readdirSync(sessionPath)
      .filter((f) => f.endsWith(".json"));
      
    if (!sessionFiles.length) {
      console.log(`⚠️ ${accountId} için session dosyası bulunamadı, atlanıyor.`);
      continue;
    }

    try {
      console.log(`🔁 ${accountId} yeniden başlatılıyor...`);
      await startWhatsApp(accountId, true);
      console.log(`✅ ${accountId} başarıyla başlatıldı.`);
    } catch (err) {
      console.error(`❌ ${accountId} başlatılamadı:`, err.message);
    }
  }
}

function getAccount(accountId) {
  return accounts[accountId] || null;
}

module.exports = {
  startWhatsApp,
  stopWhatsApp,
  stopAllSessions,
  clearAuth,
  getAccount,
  autoStartSessions,
};
