const wsModule = require("ws");
const OriginalWebSocket = wsModule.WebSocket;

function applyWebSocketPatch() {
  wsModule.WebSocket = function (...args) {
    const w = new OriginalWebSocket(...args);
    w.on("open", () => {
      if (w._socket && w._socket.setKeepAlive) {
        w._socket.setKeepAlive(true, 15000); // 15s
        console.log("Patched: TCP keepAlive set on new ws connection");
      }
      w._keepPing = setInterval(() => {
        if (w.readyState === w.OPEN) w.ping();
      }, 30000);
    });
    w.on("close", () => {
      clearInterval(w._keepPing);
    });
    return w;
  };
}

module.exports = { applyWebSocketPatch };
