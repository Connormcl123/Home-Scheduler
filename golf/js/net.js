// Display <-> phone messaging.
// Uses PeerJS (WebRTC data channels, free public signalling broker) so the game can be served
// from any static HTTPS host. A BroadcastChannel fallback lets you test with two tabs on one computer.

const PREFIX = "swing-golf-v1-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

class Conn {
  constructor(id, sendFn, closeFn) {
    this.id = id;
    this._send = sendFn;
    this._close = closeFn;
    this._data = [];
    this._closeCbs = [];
    this.open = true;
  }
  send(msg) {
    if (!this.open) return;
    try {
      this._send(msg);
    } catch (err) {
      console.warn("send failed", err);
    }
  }
  onData(cb) {
    this._data.push(cb);
  }
  onClose(cb) {
    this._closeCbs.push(cb);
  }
  emit(msg) {
    this._data.forEach((cb) => cb(msg));
  }
  closed() {
    if (!this.open) return;
    this.open = false;
    this._closeCbs.forEach((cb) => cb());
  }
  close() {
    if (this._close) this._close();
    this.closed();
  }
}

// Host side (the TV / big screen).
export function startHost(code, { onConnection, onStatus }) {
  // Same-computer test channel.
  const bc = new BroadcastChannel(PREFIX + code);
  const local = new Map();
  bc.onmessage = (e) => {
    const { from, to, kind, data } = e.data || {};
    if (to !== "host") return;
    if (kind === "open") {
      local.get(from)?.closed();
      const conn = new Conn(
        "local-" + from,
        (msg) => bc.postMessage({ from: "host", to: from, kind: "data", data: msg }),
        () => bc.postMessage({ from: "host", to: from, kind: "close" })
      );
      local.set(from, conn);
      bc.postMessage({ from: "host", to: from, kind: "accept" });
      onConnection(conn);
    } else if (kind === "data") local.get(from)?.emit(data);
    else if (kind === "close") {
      local.get(from)?.closed();
      local.delete(from);
    }
  };

  let peer = null;
  const startPeer = () => {
    if (!window.Peer) {
      onStatus?.("offline", "PeerJS failed to load – only same-computer test controllers will work.");
      return;
    }
    peer = new window.Peer(PREFIX + code, { debug: 1 });
    peer.on("open", () => onStatus?.("online"));
    peer.on("connection", (dc) => {
      dc.on("open", () => {
        const conn = new Conn(dc.peer, (msg) => dc.send(msg), () => dc.close());
        dc.on("data", (msg) => conn.emit(msg));
        dc.on("close", () => conn.closed());
        dc.on("error", () => conn.closed());
        onConnection(conn);
      });
    });
    peer.on("disconnected", () => {
      onStatus?.("reconnecting");
      setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 1500);
    });
    peer.on("error", (err) => {
      if (err.type === "unavailable-id") onStatus?.("taken");
      else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") onStatus?.("reconnecting", err.message);
      else console.warn("peer error", err.type, err);
    });
  };
  startPeer();

  return {
    destroy() {
      bc.close();
      peer?.destroy();
    }
  };
}

// Controller side (the phone). Resolves with a Conn once connected.
export function connectToHost(code, { local = false, timeout = 15000 } = {}) {
  code = code.toUpperCase().trim();
  if (local) return connectLocal(code, timeout);
  return new Promise((resolve, reject) => {
    if (!window.Peer) {
      reject(new Error("Could not load the connection library. Check your internet connection."));
      return;
    }
    const peer = new window.Peer({ debug: 1 });
    let done = false;
    const fail = (msg) => {
      if (done) return;
      done = true;
      peer.destroy();
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail("Timed out. Check the code on the TV and try again."), timeout);
    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") fail(`No game found with code ${code}.`);
      else fail(err.message || String(err.type));
    });
    peer.on("open", () => {
      const dc = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
      dc.on("open", () => {
        clearTimeout(timer);
        done = true;
        const conn = new Conn(dc.peer, (msg) => dc.send(msg), () => {
          dc.close();
          peer.destroy();
        });
        dc.on("data", (msg) => conn.emit(msg));
        dc.on("close", () => conn.closed());
        dc.on("error", () => conn.closed());
        peer.on("disconnected", () => conn.closed());
        resolve(conn);
      });
    });
  });
}

function connectLocal(code, timeout) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2, 10);
    const bc = new BroadcastChannel(PREFIX + code);
    let conn = null;
    const timer = setTimeout(() => {
      bc.close();
      reject(new Error(`No display open with code ${code} in this browser.`));
    }, Math.min(timeout, 4000));
    bc.onmessage = (e) => {
      const { from, to, kind, data } = e.data || {};
      if (from !== "host" || to !== id) return;
      if (kind === "accept" && !conn) {
        clearTimeout(timer);
        conn = new Conn("host", (msg) => bc.postMessage({ from: id, to: "host", kind: "data", data: msg }), () => {
          bc.postMessage({ from: id, to: "host", kind: "close" });
          bc.close();
        });
        window.addEventListener("pagehide", () => bc.postMessage({ from: id, to: "host", kind: "close" }));
        resolve(conn);
      } else if (kind === "data") conn?.emit(data);
      else if (kind === "close") conn?.closed();
    };
    bc.postMessage({ from: id, to: "host", kind: "open" });
  });
}
