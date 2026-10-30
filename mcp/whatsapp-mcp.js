const crypto = require("crypto");
const axios = require("axios");
const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { isInitializeRequest } = require("@modelcontextprotocol/sdk/types.js");

const {
  startWhatsApp,
  stopWhatsApp,
  clearAuth,
} = require("../services/whatsapp/connection.service");
const {
  sendMessageService,
  sendReactionService,
  deleteMessageService,
  editMessageService,
} = require("../services/whatsapp/message.service");
const {
  readMessageService,
  archiveChatService,
  pinChatService,
  muteChatService,
} = require("../services/whatsapp/chat.service");
const {
  createGroup,
  updateParticipants,
  updateSubject,
  updateDescription,
  leaveGroup,
  getGroupInfoService,
} = require("../services/whatsapp/group.service");
const {
  sendPresence,
  updateProfilePicture,
  updateProfileStatusText,
  updateBlock,
} = require("../services/whatsapp/profile.service");
const { sendStatusService } = require("../services/whatsapp/status.service");
const {
  getChats,
  getChatMessages,
  getActivities,
} = require("../services/whatsapp/persistence.service");
const AccountModel = require("../models/account.model");
const { isDbConnected } = require("../db/database");
const { accounts } = require("../models/accounts");

function toIndividualJid(to) {
  const trimmed = String(to || "").trim();
  if (!trimmed) throw new Error("Missing 'to' recipient");
  const jid = trimmed.includes("@") ? trimmed : `${trimmed}@s.whatsapp.net`;
  if (jid.endsWith("@g.us")) {
    throw new Error("Group JID (@g.us) detected; use group_* tools instead.");
  }
  return jid;
}

function toGroupJid(groupId) {
  const trimmed = String(groupId || "").trim();
  if (!trimmed) throw new Error("Missing 'groupId'");
  const jid = trimmed.includes("@") ? trimmed : `${trimmed}@g.us`;
  if (!jid.endsWith("@g.us")) {
    throw new Error("Invalid groupId; expected a WhatsApp group JID (@g.us).");
  }
  return jid;
}

async function resolveBufferFromSource({ base64, url }) {
  if (base64) {
    const raw = String(base64).split(",").pop();
    return Buffer.from(raw, "base64");
  }
  if (url) {
    const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
    return Buffer.from(resp.data);
  }
  throw new Error("Provide either base64 or url for media content.");
}

function okResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errResult(err) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { success: false, error: err?.message || String(err) },
          null,
          2
        ),
      },
    ],
  };
}

function buildSendContent(args) {
  const reply = args.replyMessageId
    ? {
        replyMessageId: args.replyMessageId,
        replyParticipant: args.replyParticipant,
        replyMessage: args.replyMessage,
      }
    : undefined;

  return {
    text: args.text,
    caption: args.caption ?? args.text,
    url: args.url,
    base64: args.base64,
    mimetype: args.mimetype,
    fileName: args.fileName,
    ptt: args.ptt,
    mentions: args.mentions,
    latitude: args.latitude,
    longitude: args.longitude,
    displayName: args.displayName,
    vcard: args.vcard,
    pollName: args.pollName,
    pollValues: args.pollValues,
    selectableCount: args.selectableCount,
    reply,
  };
}

function createWhatsappMcpServer() {
  const server = new McpServer({
    name: "whatsapp-whiskeysocket",
    version: "1.0.0",
  });

  // ==================== 1. ACCOUNT TOOLS (6) ====================

  server.registerTool(
    "account_list",
    {
      title: "List WhatsApp Accounts",
      description:
        "Aktif bellekteki WhatsApp oturumlarını ve MongoDB'de kayıtlı tüm hesapları listeler.",
      inputSchema: {},
    },
    async () => {
      try {
        const activeSessions = Object.entries(accounts).map(([accountId, info]) => ({
          accountId,
          status: info.status,
          hasQR: Boolean(info.currentQR),
          jid: info.sock?.user?.id || null,
        }));
        const persistedAccounts = isDbConnected()
          ? await AccountModel.find().sort({ updatedAt: -1 }).lean()
          : [];
        return okResult({ success: true, activeSessions, persistedAccounts });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "account_activities",
    {
      title: "Get Account Activity Logs",
      description:
        "Hesaba ait tüm ilişkisel hareket kayıtlarını (oturum, mesaj, sohbet, grup, profil, hikaye) listeler.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        category: z
          .enum(["session", "message", "chat", "group", "profile", "status"])
          .optional()
          .describe("Hareket kategorisi filtresi"),
        action: z.string().optional().describe("Belirli aksiyon adı filtresi"),
        page: z.number().int().min(1).optional().describe("Sayfa numarası (varsayılan 1)"),
        limit: z.number().int().min(1).max(200).optional().describe("Kayıt sayısı (varsayılan 50)"),
      },
    },
    async ({ accountId, category, action, page, limit }) => {
      try {
        const data = await getActivities(accountId, { category, action, limit, page });
        return okResult({ success: true, ...data });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "account_start",
    {
      title: "Start WhatsApp Account Session",
      description: "Belirtilen accountId için Baileys WhatsApp oturumunu başlatır.",
      inputSchema: {
        accountId: z.string().describe("Başlatılacak hesap kimliği"),
      },
    },
    async ({ accountId }) => {
      try {
        const result = await startWhatsApp(accountId);
        return okResult(result);
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "account_generate_qr",
    {
      title: "Get WhatsApp QR Code",
      description: "Bağlantı bekleyen oturum için üretilen güncel QR kodu (Data URL) döndürür.",
      inputSchema: {
        accountId: z.string().describe("QR kodu alınacak hesap kimliği"),
      },
    },
    async ({ accountId }) => {
      try {
        const account = accounts[accountId];
        if (account && account.currentQR) {
          return okResult({
            success: true,
            status: account.status,
            qrDataUrl: account.currentQR,
          });
        }
        return okResult({
          success: false,
          status: account?.status || "NOT_STARTED",
          message: "Aktif QR bulunamadı (oturum zaten bağlı veya başlatılmamış olabilir).",
        });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "account_stop",
    {
      title: "Stop WhatsApp Account Session",
      description: "Aktif WhatsApp oturumunu ve dinleyicisini durdurur.",
      inputSchema: {
        accountId: z.string().describe("Durdurulacak hesap kimliği"),
      },
    },
    async ({ accountId }) => {
      try {
        const result = await stopWhatsApp(accountId);
        return okResult(result);
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "account_clear",
    {
      title: "Clear WhatsApp Account Auth",
      description:
        "Oturumu kapatır ve hesabın diskteki auth_info kimlik bilgilerini kalıcı olarak temizler.",
      inputSchema: {
        accountId: z.string().describe("Temizlenecek hesap kimliği"),
      },
    },
    async ({ accountId }) => {
      try {
        const result = await clearAuth(accountId);
        return okResult(result);
      } catch (err) {
        return errResult(err);
      }
    }
  );

  // ==================== 2. CHAT & INBOX TOOLS (10) ====================

  server.registerTool(
    "chat_list",
    {
      title: "List Chats",
      description:
        "Hesaba ait sohbet listesini son mesaj ve kişi (Contact) ilişkileriyle birlikte getirir.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        chatType: z.enum(["individual", "group"]).optional().describe("Sohbet tipi filtresi"),
        archived: z.boolean().optional().describe("Arşiv durumu filtresi"),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ accountId, chatType, archived, page, limit }) => {
      try {
        const data = await getChats(accountId, { chatType, archived, limit, page });
        return okResult({ success: true, ...data });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "chat_messages",
    {
      title: "Get Individual Chat Messages",
      description:
        "Belirli bir bireysel sohbetin mesaj geçmişini gönderen ve alıntı (replyTo) ilişkileriyle getirir.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        chatId: z.string().describe("Kişi numarası veya JID (örn. 905xxxxxxxxx@s.whatsapp.net)"),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ accountId, chatId, page, limit }) => {
      try {
        const jid = toIndividualJid(chatId);
        const data = await getChatMessages(accountId, jid, { limit, page });
        return okResult({ success: true, ...data });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "chat_send_message",
    {
      title: "Send Individual Chat Message",
      description:
        "Bireysel sohbete metin, medya (url/base64), ses (PTT), çıkartma, konum, kişi kartı veya anket mesajı gönderir.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        to: z.string().describe("Alıcı telefon numarası veya JID (905xxxxxxxxx@s.whatsapp.net)"),
        type: z
          .enum(["text", "image", "video", "document", "audio", "sticker", "location", "contact", "poll"])
          .describe("Mesaj tipi"),
        text: z.string().optional().describe("Metin mesajı içeriği"),
        caption: z.string().optional().describe("Medya açıklaması veya metin"),
        url: z.string().optional().describe("Medya dosyası URL'si"),
        base64: z.string().optional().describe("Medya dosyası Base64 verisi"),
        mimetype: z.string().optional().describe("MIME tipi (örn. application/pdf, audio/mp4)"),
        fileName: z.string().optional().describe("Belge dosya adı"),
        ptt: z.boolean().optional().describe("Sesli mesaj (push-to-talk) olarak gönder"),
        latitude: z.number().optional().describe("Konum enlemi"),
        longitude: z.number().optional().describe("Konum boylamı"),
        displayName: z.string().optional().describe("Kartvizit görünen adı"),
        vcard: z.string().optional().describe("vCard metni"),
        pollName: z.string().optional().describe("Anket sorusu"),
        pollValues: z.array(z.string()).optional().describe("Anket seçenekleri"),
        selectableCount: z.number().int().min(1).optional().describe("Seçilebilecek seçenek sayısı"),
        replyMessageId: z.string().optional().describe("Alıntılanacak mesaj ID'si"),
        replyParticipant: z.string().optional().describe("Alıntılanan mesajın gönderen JID'i"),
        replyMessage: z.string().optional().describe("Alıntılanan mesaj metni"),
      },
    },
    async (args) => {
      try {
        const targetJid = toIndividualJid(args.to);
        const content = buildSendContent(args);
        const result = await sendMessageService(args.accountId, targetJid, args.type, content);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "chat_edit_message",
    {
      title: "Edit Individual Chat Message",
      description: "Bireysel sohbette daha önce gönderilmiş bir mesajı düzenler.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        to: z.string().describe("Alıcı JID veya numara"),
        messageId: z.string().describe("Düzenlenecek mesajın WhatsApp ID'si"),
        newText: z.string().describe("Yeni mesaj metni"),
      },
    },
    async ({ accountId, to, messageId, newText }) => {
      try {
        const targetJid = toIndividualJid(to);
        const result = await editMessageService(accountId, targetJid, messageId, newText);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "chat_delete_message",
    {
      title: "Delete Individual Chat Message",
      description: "Bireysel sohbetteki bir mesajı herkes için siler.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        to: z.string().describe("Alıcı JID veya numara"),
        messageId: z.string().describe("Silinecek mesajın WhatsApp ID'si"),
        fromMe: z.boolean().optional().default(true).describe("Mesaj bu hesaptan mı gönderildi"),
      },
    },
    async ({ accountId, to, messageId, fromMe }) => {
      try {
        const targetJid = toIndividualJid(to);
        const result = await deleteMessageService(accountId, targetJid, messageId, fromMe !== false);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "chat_send_reaction",
    {
      title: "React to Individual Chat Message",
      description:
        "Bireysel sohbetteki mesaja emoji reaksiyonu bırakır (kaldırmak için boş string verin).",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        to: z.string().describe("Sohbet JID veya numara"),
        messageId: z.string().describe("Hedef mesaj ID'si"),
        emoji: z.string().describe("Emoji (örn. '👍', kaldırmak için '')"),
        fromMe: z.boolean().optional().default(false).describe("Hedef mesaj bu hesaba mı ait"),
      },
    },
    async ({ accountId, to, messageId, emoji, fromMe }) => {
      try {
        const targetJid = toIndividualJid(to);
        const result = await sendReactionService(accountId, targetJid, "react", {
          emoji,
          messageId,
          fromMe: Boolean(fromMe),
        });
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "chat_mark_read",
    {
      title: "Mark Messages as Read",
      description: "Gelen mesajları okundu (mavi tik) olarak işaretler.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        keys: z
          .array(
            z.object({
              remoteJid: z.string().describe("Sohbet JID"),
              id: z.string().describe("Mesaj ID"),
              participant: z.string().optional().describe("Grup ise gönderen üye JID"),
            })
          )
          .min(1)
          .describe("Okundu işaretlenecek mesaj anahtarları"),
      },
    },
    async ({ accountId, keys }) => {
      try {
        const result = await readMessageService(accountId, keys);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "chat_archive",
    {
      title: "Archive or Unarchive Chat",
      description: "Sohbeti arşivler veya arşivden çıkarır.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        jid: z.string().describe("Sohbet JID"),
        isArchive: z.boolean().optional().default(true).describe("true: arşivle, false: çıkar"),
      },
    },
    async ({ accountId, jid, isArchive }) => {
      try {
        const result = await archiveChatService(accountId, jid, isArchive !== false);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "chat_pin",
    {
      title: "Pin or Unpin Chat",
      description: "Sohbeti sabitler (pin) veya sabitlemesini kaldırır.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        jid: z.string().describe("Sohbet JID"),
        isPinned: z.boolean().optional().default(true).describe("true: sabitle, false: kaldır"),
      },
    },
    async ({ accountId, jid, isPinned }) => {
      try {
        const result = await pinChatService(accountId, jid, isPinned !== false);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "chat_mute",
    {
      title: "Mute or Unmute Chat",
      description:
        "Sohbeti milisaniye cinsinden süreyle sessize alır (0 veya boş verilirse sessizden çıkarır).",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        jid: z.string().describe("Sohbet JID"),
        muteDurationMs: z
          .number()
          .nullable()
          .optional()
          .describe("Sessize alma süresi ms (örn. 8 saat = 28800000, sessizden çıkarmak için 0)"),
      },
    },
    async ({ accountId, jid, muteDurationMs }) => {
      try {
        const result = await muteChatService(accountId, jid, muteDurationMs || null);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  // ==================== 3. GROUP TOOLS (11) ====================

  server.registerTool(
    "group_messages",
    {
      title: "Get Group Messages",
      description: "Belirli bir WhatsApp grubunun ilişkisel mesaj geçmişini getirir.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Grup JID (örn. 1234567890@g.us)"),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ accountId, groupId, page, limit }) => {
      try {
        const groupJid = toGroupJid(groupId);
        const data = await getChatMessages(accountId, groupJid, { limit, page });
        return okResult({ success: true, ...data });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_send_message",
    {
      title: "Send Group Message",
      description:
        "WhatsApp grubuna metin, medya (url/base64), ses, çıkartma, konum, kişi kartı veya anket mesajı gönderir.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Hedef grup JID (1234567890@g.us)"),
        type: z
          .enum(["text", "image", "video", "document", "audio", "sticker", "location", "contact", "poll"])
          .describe("Mesaj tipi"),
        text: z.string().optional().describe("Metin mesajı içeriği"),
        caption: z.string().optional().describe("Medya açıklaması veya metin"),
        url: z.string().optional().describe("Medya URL'si"),
        base64: z.string().optional().describe("Medya Base64 verisi"),
        mimetype: z.string().optional().describe("MIME tipi"),
        fileName: z.string().optional().describe("Belge dosya adı"),
        ptt: z.boolean().optional().describe("Sesli mesaj (PTT)"),
        mentions: z.array(z.string()).optional().describe("Etiketlenecek üye JID listesi"),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        displayName: z.string().optional(),
        vcard: z.string().optional(),
        pollName: z.string().optional(),
        pollValues: z.array(z.string()).optional(),
        selectableCount: z.number().int().min(1).optional(),
        replyMessageId: z.string().optional(),
        replyParticipant: z.string().optional(),
        replyMessage: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const groupJid = toGroupJid(args.groupId);
        const content = buildSendContent(args);
        const result = await sendMessageService(args.accountId, groupJid, args.type, content);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_edit_message",
    {
      title: "Edit Group Message",
      description: "Grupta gönderilmiş bir mesajı düzenler.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Grup JID (@g.us)"),
        messageId: z.string().describe("Düzenlenecek mesaj ID'si"),
        newText: z.string().describe("Yeni mesaj metni"),
      },
    },
    async ({ accountId, groupId, messageId, newText }) => {
      try {
        const groupJid = toGroupJid(groupId);
        const result = await editMessageService(accountId, groupJid, messageId, newText);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_delete_message",
    {
      title: "Delete Group Message",
      description:
        "Gruptaki bir mesajı herkes için siler (başka üyenin mesajı siliniyorsa fromMe: false ve participant verilmelidir).",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Grup JID (@g.us)"),
        messageId: z.string().describe("Silinecek mesaj ID'si"),
        fromMe: z.boolean().optional().default(true).describe("Mesaj bu hesaptan mı gönderildi"),
        participant: z
          .string()
          .optional()
          .describe("Başka üyenin mesajı siliniyorsa gönderen üyenin JID'i"),
      },
    },
    async ({ accountId, groupId, messageId, fromMe, participant }) => {
      try {
        const groupJid = toGroupJid(groupId);
        const isFromMe = fromMe !== false;
        if (!isFromMe && !participant) {
          throw new Error("Deleting another member's message requires 'participant' JID.");
        }
        const result = await deleteMessageService(
          accountId,
          groupJid,
          messageId,
          isFromMe,
          participant
        );
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_send_reaction",
    {
      title: "React to Group Message",
      description: "Gruptaki bir mesaja emoji reaksiyonu bırakır veya kaldırır.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Grup JID (@g.us)"),
        messageId: z.string().describe("Hedef mesaj ID'si"),
        emoji: z.string().describe("Emoji (kaldırmak için '')"),
        fromMe: z.boolean().optional().default(false),
        participant: z.string().optional().describe("Mesajı gönderen grup üyesinin JID'i"),
      },
    },
    async ({ accountId, groupId, messageId, emoji, fromMe, participant }) => {
      try {
        const groupJid = toGroupJid(groupId);
        const result = await sendReactionService(accountId, groupJid, "react", {
          emoji,
          messageId,
          fromMe: Boolean(fromMe),
          participant,
        });
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_create",
    {
      title: "Create WhatsApp Group",
      description: "Yeni bir WhatsApp grubu oluşturur.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        subject: z.string().describe("Grup başlığı"),
        participants: z
          .array(z.string())
          .min(1)
          .describe("Eklenecek katılımcı JID listesi (905xxxxxxxxx@s.whatsapp.net)"),
      },
    },
    async ({ accountId, subject, participants }) => {
      try {
        const normalized = participants.map((p) => toIndividualJid(p));
        const result = await createGroup(accountId, subject, normalized);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_participants",
    {
      title: "Manage Group Participants",
      description: "Gruba üye ekler, çıkarır, yönetici yapar veya yöneticiliğini alır.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Grup JID (@g.us)"),
        participants: z.array(z.string()).min(1).describe("Üye JID listesi"),
        action: z.enum(["add", "remove", "promote", "demote"]).describe("Üye işlemi"),
      },
    },
    async ({ accountId, groupId, participants, action }) => {
      try {
        const groupJid = toGroupJid(groupId);
        const normalized = participants.map((p) => toIndividualJid(p));
        const result = await updateParticipants(accountId, groupJid, normalized, action);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_subject",
    {
      title: "Update Group Subject",
      description: "Grubun adını (başlığını) günceller.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Grup JID (@g.us)"),
        subject: z.string().describe("Yeni grup başlığı"),
      },
    },
    async ({ accountId, groupId, subject }) => {
      try {
        const groupJid = toGroupJid(groupId);
        const result = await updateSubject(accountId, groupJid, subject);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_description",
    {
      title: "Update Group Description",
      description: "Grubun açıklamasını günceller.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Grup JID (@g.us)"),
        description: z.string().describe("Yeni grup açıklaması"),
      },
    },
    async ({ accountId, groupId, description }) => {
      try {
        const groupJid = toGroupJid(groupId);
        const result = await updateDescription(accountId, groupJid, description);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_leave",
    {
      title: "Leave Group",
      description: "Belirtilen WhatsApp grubundan çıkar.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Grup JID (@g.us)"),
      },
    },
    async ({ accountId, groupId }) => {
      try {
        const groupJid = toGroupJid(groupId);
        const result = await leaveGroup(accountId, groupJid);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "group_info",
    {
      title: "Get Group Info and Members",
      description: "Grubun bilgilerini ve üyelerini getirir ve MongoDB ile senkronize eder.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        groupId: z.string().describe("Grup JID (@g.us)"),
      },
    },
    async ({ accountId, groupId }) => {
      try {
        const groupJid = toGroupJid(groupId);
        const result = await getGroupInfoService(accountId, groupJid);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  // ==================== 4. PROFILE & STATUS TOOLS (5) ====================

  server.registerTool(
    "profile_presence",
    {
      title: "Send Presence Update",
      description:
        "Karşı tarafa 'yazıyor...', 'ses kaydediyor...' veya çevrimiçi durumu gönderir.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        to: z.string().describe("Hedef kişi veya grup JID"),
        presence: z
          .enum(["unavailable", "available", "composing", "recording", "paused"])
          .describe("Durum tipi"),
      },
    },
    async ({ accountId, to, presence }) => {
      try {
        const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
        const result = await sendPresence(accountId, jid, presence);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "profile_picture",
    {
      title: "Update Profile or Group Picture",
      description:
        "Kendi profil resmini veya yöneticisi olunan grubun resmini base64 ya da URL ile günceller.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        imageBase64: z.string().optional().describe("Resim Base64 verisi"),
        imageUrl: z.string().optional().describe("Resim URL adresi"),
        jid: z
          .string()
          .optional()
          .describe("Opsiyonel grup JID (@g.us). Boş bırakılırsa kendi profil resmini günceller."),
      },
    },
    async ({ accountId, imageBase64, imageUrl, jid }) => {
      try {
        const buffer = await resolveBufferFromSource({ base64: imageBase64, url: imageUrl });
        const result = await updateProfilePicture(accountId, buffer, jid || null);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "profile_status",
    {
      title: "Update Profile About/Status Text",
      description: "WhatsApp 'Hakkımda' (About) durum yazısını günceller.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        statusText: z.string().describe("Yeni Hakkımda yazısı"),
      },
    },
    async ({ accountId, statusText }) => {
      try {
        const result = await updateProfileStatusText(accountId, statusText);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "profile_block",
    {
      title: "Block or Unblock User",
      description: "Belirtilen numarayı engeller veya engelini kaldırır.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        jid: z.string().describe("Kişi numarası veya JID"),
        action: z.enum(["block", "unblock"]).describe("İşlem tipi"),
      },
    },
    async ({ accountId, jid, action }) => {
      try {
        const targetJid = toIndividualJid(jid);
        const result = await updateBlock(accountId, targetJid, action);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  server.registerTool(
    "status_send",
    {
      title: "Send WhatsApp Status (Story)",
      description: "WhatsApp durum (hikaye) olarak metin, resim veya video paylaşır.",
      inputSchema: {
        accountId: z.string().describe("WhatsApp hesap kimliği"),
        type: z.enum(["text", "image", "video"]).describe("Hikaye türü"),
        text: z.string().optional().describe("Metin hikaye yazısı (type='text' için)"),
        backgroundColor: z
          .string()
          .optional()
          .describe("Metin hikaye arka plan rengi (örn. '#000000')"),
        caption: z.string().optional().describe("Resim/video alt yazısı"),
        mediaBase64: z.string().optional().describe("Resim/video Base64 verisi"),
        mediaUrl: z.string().optional().describe("Resim/video URL adresi"),
      },
    },
    async ({ accountId, type, text, backgroundColor, caption, mediaBase64, mediaUrl }) => {
      try {
        let content;
        if (type === "text") {
          if (!text) throw new Error("Missing 'text' for text status");
          content = { text, backgroundColor: backgroundColor || "#000000" };
        } else {
          const buffer = await resolveBufferFromSource({ base64: mediaBase64, url: mediaUrl });
          content = { buffer, caption: caption || "" };
        }
        const result = await sendStatusService(accountId, type, content);
        return okResult({ success: true, result });
      } catch (err) {
        return errResult(err);
      }
    }
  );

  return server;
}

// Active stateful MCP sessions: sessionId -> { server, transport }
const mcpSessions = new Map();

function setupMcpRoutes(app) {
  app.post("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"];

      if (sessionId && mcpSessions.has(sessionId)) {
        const { transport } = mcpSessions.get(sessionId);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const server = createWhatsappMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (sid) => {
            mcpSessions.set(sid, { server, transport });
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            mcpSessions.delete(transport.sessionId);
          }
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // Stateless fallback (clients calling tools directly without mcp-session-id)
      if (!sessionId) {
        const server = createWhatsappMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        res.on("close", () => {
          transport.close().catch(() => {});
          server.close().catch(() => {});
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "MCP session not found" },
        id: null,
      });
    } catch (err) {
      console.error("❌ MCP POST /mcp error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: err.message || "Internal MCP error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId) {
      if (req.headers.accept && req.headers.accept.includes("text/event-stream")) {
        return res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Missing mcp-session-id header for SSE stream" },
          id: null,
        });
      }
      return res.json({
        status: "ok",
        name: "whatsapp-whiskeysocket",
        protocol: "MCP Streamable HTTP",
        endpoint: "/mcp",
        toolsCount: 32,
        activeSessions: mcpSessions.size,
      });
    }

    const entry = mcpSessions.get(sessionId);
    if (!entry) {
      return res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "MCP session not found" },
        id: null,
      });
    }

    await entry.transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    const entry = sessionId ? mcpSessions.get(sessionId) : null;
    if (!entry) {
      return res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "MCP session not found" },
        id: null,
      });
    }
    await entry.transport.handleRequest(req, res);
    mcpSessions.delete(sessionId);
  });
}

async function closeAllMcpSessions() {
  for (const [sid, { server, transport }] of mcpSessions.entries()) {
    try {
      await transport.close();
      await server.close();
    } catch {
      // ignore close errors on shutdown
    }
    mcpSessions.delete(sid);
  }
}

module.exports = {
  createWhatsappMcpServer,
  setupMcpRoutes,
  closeAllMcpSessions,
};

