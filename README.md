# Whatsapp-WhiskeySocket

**Node.js**, **Express 5**, **Baileys (`@whiskeysockets/baileys`)**, **MCP (`@modelcontextprotocol/sdk`)** ve **MongoDB (`Mongoose`)** tabanlı; çoklu WhatsApp oturum yönetimi, sohbet/grup mesajlaşma, ilişkisel hareket kayıt ve AI ajan (MCP) servisidir.

> **Sistem Mimarisi Diyagramı:** Projenin uçtan uca bileşen, veri akışı ve Docker topolojisi için [docs/architecture-diagram.html](docs/architecture-diagram.html) dosyasına göz atabilirsiniz.

---

## Özellikler

* **Yerleşik MCP Sunucusu (`/mcp`):** Uygulamadaki 32 API işleminin tamamı `http://localhost:3002/mcp` üzerinde **MCP Streamable HTTP** protokolü ile **Claude**, **Gemini** ve **OpenCode** tarafından doğrudan çağrılabilir.
* **Çoklu WhatsApp Oturumu:** Birden fazla hesabı eşzamanlı başlatma, QR kod alma, otomatik yeniden bağlanma (`autoStartSessions`) ve temiz kapatma (`graceful shutdown`).
* **Local Mod (Auth Devre Dışı):** Yerel geliştirme ve kullanım için Swagger UI, REST ve MCP uçlarında token zorunluluğu kaldırılmıştır.
* **Domain Odaklı Mesajlaşma (`/chat` & `/group`):** Metin, medya (`multipart/form-data`, `url` veya `base64`), sesli not (`PTT`), çıkartma, konum, kartvizit (`vCard`), anket, reaksiyon, mesaj düzenleme ve mesaj silme işlemleri doğrudan bireysel sohbet (`/chat`) ve grup (`/group`) uçları altında ayrıştırılmıştır.
* **İlişkisel MongoDB Veri Modeli:**
  * `Account` — WhatsApp hesap oturumları ve durumları
  * `Contact` — Bireysel kişi ve grup kartları (`account` referanslı)
  * `Chat` — Sohbet odaları, sabitleme/arşiv/sessize alma durumları, grup üyeleri ve `lastMessage` referansı
  * `Message` — Gelen ve giden tüm mesajlar, `sender` referansı, alıntılar için `replyTo` self-referansı, düzenleme geçmişi (`editHistory`), silinme ve reaksiyonlar
  * `ActivityLog` — Oturum, mesaj, sohbet, grup, profil ve hikaye hareketlerinin `account`, `chat`, `message` ve `contact` `ObjectId` referanslarıyla ilişkisel kaydı

---

## Kurulum ve Çalıştırma

### 1. Docker Compose ile Çalıştırma (Önerilen)

Uygulama ve MongoDB 6 servisini kalıcı volume bağlantılarıyla birlikte başlatır:

```powershell
docker compose up -d --build
```

* **Swagger UI:** http://localhost:3002/api-docs
* **MCP Endpoint (Streamable HTTP):** http://localhost:3002/mcp
* **Sağlık Kontrolü:** http://localhost:3002/health

### 2. Yerel (Node.js >= 20) Çalıştırma

```powershell
npm install
npm start
```

`.env` örneği:

```env
PORT=3002
MONGO_URI=mongodb://localhost:27017/whatsapp_whiskeysocket
```

---

## MCP Bağlantısı (Claude, Gemini, OpenCode)

Uygulama ayaktayken `http://localhost:3002/mcp` adresi üzerinden **32 MCP aracının** tamamına erişilebilir (`account_*`, `chat_*`, `group_*`, `profile_*`, `status_send`).

### Claude Code
```powershell
claude mcp add --transport http whatsapp http://localhost:3002/mcp
```

### Gemini CLI (`~/.gemini/settings.json`) / Antigravity (`mcp_config.json`)
```json
{
  "mcpServers": {
    "whatsapp": {
      "httpUrl": "http://localhost:3002/mcp"
    }
  }
}
```
> *Not: Antigravity `mcp_config.json` kullanıyorsanız `"serverUrl": "http://localhost:3002/mcp"` alanını da kullanabilirsiniz.*

### OpenCode (`opencode.json`)
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "whatsapp": {
      "type": "remote",
      "url": "http://localhost:3002/mcp",
      "enabled": true
    }
  }
}
```

---

## Temel API Uçları

### Account (`/account`)
* `GET /account/list` (`account_list`) — Aktif oturumları ve MongoDB kayıtlı hesapları listeler
* `GET /account/activities/:accountId` (`account_activities`) — Hesaba ait tüm ilişkisel hareket geçmişini (`populate` edilmiş) getirir
* `POST /account/start/:accountId` (`account_start`) — WhatsApp oturumunu başlatır
* `POST /account/generateqr/:accountId` (`account_generate_qr`) — Güncel QR kodu (`data:image/png;base64,...`) döner
* `POST /account/stop/:accountId` (`account_stop`) — Oturumu durdurur
* `POST /account/clear/:accountId` (`account_clear`) — Oturumu kapatır ve `./auth_info/:accountId` verisini siler

### Chat & Inbox (`/chat`)
* `GET /chat/list/:accountId` (`chat_list`) — Bireysel/grup sohbet listesini (`contact` ve `lastMessage` ile ilişkili) getirir
* `GET /chat/messages/:accountId/:chatId` (`chat_messages`) — Sohbetin mesaj geçmişini (`sender` ve `replyTo` ile ilişkili) getirir
* `POST /chat/sendmessage/:accountId` (`chat_send_message`) — Bireysel sohbete mesaj gönderir
* `POST /chat/editmessage/:accountId` (`chat_edit_message`) — Gönderilmiş bireysel mesajı düzenler
* `POST /chat/deletemessage/:accountId` (`chat_delete_message`) — Bireysel mesajı herkes için siler
* `POST /chat/sendreaction/:accountId` (`chat_send_reaction`) — Mesaja emoji reaksiyonu ekler veya kaldırır
* `POST /chat/read/:accountId` (`chat_mark_read`) — Mesajları okundu (mavi tik) işaretler
* `POST /chat/archive/:accountId` (`chat_archive`) · `POST /chat/pin/:accountId` (`chat_pin`) · `POST /chat/mute/:accountId` (`chat_mute`)

### Group (`/group`)
* `GET /group/messages/:accountId/:groupId` (`group_messages`) — Grubun ilişkisel mesaj geçmişini getirir
* `POST /group/sendmessage/:accountId` (`group_send_message`) — Gruba mesaj gönderir (`groupId: "...@g.us"`)
* `POST /group/editmessage/:accountId` (`group_edit_message`) — Grup mesajını düzenler
* `POST /group/deletemessage/:accountId` (`group_delete_message`) — Grup mesajını siler (`fromMe: false` ise `participant` destekli)
* `POST /group/sendreaction/:accountId` (`group_send_reaction`) — Grup mesajına reaksiyon bırakır
* `POST /group/create/:accountId` (`group_create`) · `POST /group/participants/:accountId` (`group_participants`) · `POST /group/subject/:accountId` (`group_subject`) · `POST /group/description/:accountId` (`group_description`) · `POST /group/leave/:accountId` (`group_leave`) · `POST /group/info/:accountId` (`group_info`)

### Profile (`/profile`) & Status (`/status`)
* `POST /profile/presence/:accountId` (`profile_presence`) · `POST /profile/picture/:accountId` (`profile_picture`) · `POST /profile/status/:accountId` (`profile_status`) · `POST /profile/block/:accountId` (`profile_block`)
* `POST /status/send/:accountId` (`status_send`) — Metin, resim veya video hikaye paylaşır

---

## Lisans

MIT License © Fatih HAS
