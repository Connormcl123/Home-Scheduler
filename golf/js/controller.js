// Phone controller: joins the display, reads motion sensors and sends swings.
import { connectToHost } from "./net.js";
import { SwingDetector } from "./swing.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const LOCAL = params.get("local") === "1";

const store = {
  get(k, d) {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  }
};

let clientId = store.get("swingGolfClientId", null);
if (!clientId) {
  clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set("swingGolfClientId", clientId);
}
// Separate identity per tab when testing locally, so several test tabs can join.
if (LOCAL) clientId = `${clientId}-${Math.random().toString(36).slice(2, 6)}`;

let conn = null;
let code = (params.get("code") || store.get("swingGolfLastCode", "")).toUpperCase();
let name = store.get("swingGolfName", "");
let state = null;
let sensorSeen = false;
let wakeLock = null;
let reconnecting = false;
let motionDenied = false;

$("code-input").value = code;
$("name-input").value = name;
if (LOCAL) $("name-input").value = name || `Tester ${Math.floor(Math.random() * 90 + 10)}`;
$("strength").value = store.get("swingGolfStrength", "1100");
$("lefty").checked = store.get("swingGolfLefty", "0") === "1";
$("mode").value = store.get("swingGolfMode", "motion");

// ---------------------------------------------------------------- swing detection

const detector = new SwingDetector({
  onLevel: (lvl) => {
    setPadFill(lvl);
    sendMotion(lvl);
  },
  onSwing: ({ power, face }) => {
    send({ t: "swing", power, face });
    setPad("done", "Nice swing!", `${Math.round(power * 100)}% power`);
    setPadFill(Math.min(1, power));
    vibrate(40);
  }
});

function applySettings() {
  const full = Number($("strength").value);
  detector.full = state?.putter ? full * 0.3 : full;
  detector.flip = $("lefty").checked;
}

let lastMotionSent = 0;
function sendMotion(lvl) {
  const now = performance.now();
  if (now - lastMotionSent < 66) return;
  lastMotionSent = now;
  send({ t: "motion", p: Math.round(lvl * 100) / 100 });
}

window.addEventListener("devicemotion", (e) => {
  const rr = e.rotationRate;
  if (rr && (rr.alpha || rr.beta || rr.gamma)) {
    sensorSeen = true;
    detector.feed(rr, performance.now());
  } else if (e.acceleration && (e.acceleration.x || e.acceleration.y || e.acceleration.z)) {
    sensorSeen = true;
    detector.feedAccel(e.acceleration, performance.now());
  }
});

async function requestMotionPermission() {
  try {
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      const res = await DeviceMotionEvent.requestPermission();
      return res === "granted";
    }
  } catch (err) {
    console.warn(err);
    return false;
  }
  return true;
}

function checkSensors() {
  const info = $("sensor-info");
  if (!window.isSecureContext) {
    info.textContent = "Motion sensors need an https page. Using swipe mode.";
    $("mode").value = "swipe";
    return;
  }
  setTimeout(() => {
    if (sensorSeen) {
      info.textContent = "Motion sensors active ✓";
    } else {
      info.textContent = motionDenied
        ? "Motion access was denied – switched to swipe mode. Reload the page to be asked again."
        : "No motion sensor data detected – switched to swipe mode.";
      if ($("mode").value === "motion") $("mode").value = "swipe";
      render();
    }
  }, 2500);
}

// ---------------------------------------------------------------- connection

function send(msg) {
  conn?.send(msg);
}

async function join() {
  code = $("code-input").value.toUpperCase().trim();
  name = $("name-input").value.trim() || "Player";
  if (code.length !== 4) {
    $("join-error").textContent = "Enter the 4-letter code shown on the TV.";
    return;
  }
  store.set("swingGolfName", name);
  store.set("swingGolfLastCode", code);
  $("join-btn").disabled = true;
  $("join-btn").textContent = "Joining…";
  $("join-error").textContent = "";

  // iOS asks for permission here. If it's refused, checkSensors() below notices the missing data.
  motionDenied = !(await requestMotionPermission());

  try {
    await connect();
    $("join-screen").hidden = true;
    $("main-screen").hidden = false;
    requestWakeLock();
    checkSensors();
  } catch (err) {
    $("join-error").textContent = err.message;
  } finally {
    $("join-btn").disabled = false;
    $("join-btn").textContent = "Join game";
  }
}

async function connect() {
  const c = await connectToHost(code, { local: LOCAL });
  conn = c;
  c.onData(onMessage);
  c.onClose(() => {
    if (conn !== c) return;
    conn = null;
    setConn(false);
    scheduleReconnect();
  });
  c.send({ t: "hello", clientId, name });
  setConn(true);
}

function scheduleReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  const attempt = async () => {
    try {
      await connect();
      reconnecting = false;
    } catch {
      setTimeout(attempt, 2500);
    }
  };
  setTimeout(attempt, 1000);
}

function setConn(ok) {
  $("conn").textContent = ok ? "connected" : "reconnecting…";
  $("conn").classList.toggle("bad", !ok);
}

function onMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.t === "welcome") {
    $("me-name").textContent = msg.name;
    document.documentElement.style.setProperty("--me", msg.color);
    $("me-dot").style.background = msg.color;
  } else if (msg.t === "state") {
    const wasMyTurn = state?.yourTurn;
    state = msg;
    if (state.yourTurn && !wasMyTurn) detector.disarm();
    render();
  } else if (msg.t === "buzz") {
    vibrate(msg.ms);
  } else if (msg.t === "error") {
    $("join-error").textContent = msg.message;
    $("main-screen").hidden = true;
    $("join-screen").hidden = false;
    conn?.close();
    conn = null;
  }
}

// ---------------------------------------------------------------- UI

function render() {
  if (!state) return;
  applySettings();
  const lobby = state.phase === "lobby";
  $("lobby-panel").hidden = !lobby;
  $("turn-panel").hidden = !state.yourTurn;
  $("host-controls").hidden = !state.isHost;
  $("guest-wait").hidden = state.isHost;
  $("lobby-players").innerHTML = (state.players || [])
    .map((p) => `<span style="--c:${p.color}">${escapeHtml(p.name)}</span>`)
    .join("");
  for (const b of document.querySelectorAll("[data-holes]")) b.classList.toggle("active", Number(b.dataset.holes) === state.settings.holes);
  for (const b of document.querySelectorAll("[data-difficulty]")) b.classList.toggle("active", b.dataset.difficulty === state.settings.difficulty);

  const status = $("status");
  status.classList.toggle("go", !!state.yourTurn);
  const holeText = state.hole ? `Hole ${state.hole}/${state.holes} · Par ${state.par} · ` : "";
  if (lobby) status.textContent = `${state.players.length} player${state.players.length === 1 ? "" : "s"} in the lobby`;
  else if (state.yourTurn) status.textContent = `Your shot! ${holeText}Stroke ${state.strokes + 1}`;
  else if (state.phase === "holeEnd") status.textContent = "Hole complete – check the scorecard";
  else if (state.phase === "final") status.textContent = "Round over!";
  else if (state.phase === "intro") status.textContent = `${holeText}Get ready…`;
  else status.textContent = state.turnName ? `${state.turnName} is playing · ${holeText}` : holeText;

  $("next-btn").hidden = !["holeEnd", "final", "result", "intro"].includes(state.phase);
  $("next-btn").textContent = state.phase === "final" ? "Back to lobby" : state.phase === "holeEnd" ? "Next hole ▶" : "Skip ▶";

  if (state.yourTurn) {
    $("club-name").textContent = state.club;
    $("club-full").textContent = state.full;
    $("to-pin").textContent = `${state.toPin} m`;
    $("lie").textContent = state.lie;
    if (!detector.armed && $("pad").dataset.state !== "armed") {
      const swipe = $("mode").value === "swipe";
      setPad("ready", swipe ? "Flick up to swing" : "Hold & swing", swipe ? "Swipe up fast for power, angle it to curve" : "Press and hold here, then swing the phone");
      setPadFill(0);
    }
  } else {
    detector.disarm();
    setPad("wait", lobby ? "Practice grip 🏌️" : "Wait for your turn", "");
    setPadFill(0);
  }
}

function setPad(s, label, sub) {
  $("pad").dataset.state = s;
  $("pad-label").textContent = label;
  $("pad-sub").textContent = sub || "";
}

function setPadFill(lvl) {
  $("pad-fill").style.height = `${Math.min(100, Math.max(0, lvl) * 83)}%`;
}

function vibrate(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && $("main-screen").hidden === false) {
    requestWakeLock();
    if (!conn) scheduleReconnect();
  }
});

// Swing pad – motion mode: hold to arm. Swipe mode: flick upward.
const pad = $("pad");
let swipe = null;

pad.addEventListener("pointerdown", (e) => {
  if (!state?.yourTurn) return;
  e.preventDefault();
  pad.setPointerCapture?.(e.pointerId);
  if ($("mode").value === "swipe") {
    swipe = { pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }] };
    setPad("armed", "Flick up!", "");
    return;
  }
  applySettings();
  detector.arm();
  setPad("armed", "SWING!", "Keep holding until you've swung");
  vibrate(15);
});

pad.addEventListener("pointermove", (e) => {
  if (!swipe) return;
  swipe.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  const first = swipe.pts[0];
  const up = Math.max(0, first.y - e.clientY);
  setPadFill(up / (pad.clientHeight * 0.8));
});

const endPress = (e) => {
  if (swipe) {
    swipe.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    finishSwipe(swipe.pts);
    swipe = null;
    return;
  }
  if (detector.armed) {
    detector.disarm();
    if (state?.yourTurn) setPad("ready", "Hold & swing", "Released before the swing – try again");
    setPadFill(0);
    send({ t: "motion", p: 0 });
  }
};
pad.addEventListener("pointerup", endPress);
pad.addEventListener("pointercancel", endPress);

function finishSwipe(pts) {
  const end = pts[pts.length - 1];
  // Use the last ~120ms of movement for speed.
  let startPt = pts[0];
  for (const p of pts) if (end.t - p.t <= 120) {
    startPt = p;
    break;
  }
  const dy = startPt.y - end.y;
  const dx = end.x - startPt.x;
  const dt = Math.max(16, end.t - startPt.t);
  const speed = dy / dt; // px per ms, upward
  if (dy < 30 || speed < 0.2) {
    setPad("ready", "Flick up to swing", "Too gentle – flick faster");
    setPadFill(0);
    return;
  }
  const scale = Number($("strength").value) / 1100;
  const power = Math.min(1.2, speed / (3.2 * scale * (state?.putter ? 0.45 : 1)));
  let face = (Math.atan2(dx, dy) * 180) / Math.PI * 0.6;
  if ($("lefty").checked) face = -face;
  send({ t: "swing", power, face });
  setPad("done", "Nice swing!", `${Math.round(power * 100)}% power`);
  setPadFill(Math.min(1, power));
  vibrate(40);
}

// Buttons with hold-to-repeat.
function repeatButton(el, fn) {
  let timer = null;
  const stop = () => {
    clearTimeout(timer);
    clearInterval(timer);
    timer = null;
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fn(false);
    stop();
    timer = setTimeout(() => {
      timer = setInterval(() => fn(true), 90);
    }, 350);
  });
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointerleave", stop);
  el.addEventListener("pointercancel", stop);
}

for (const b of document.querySelectorAll("[data-aim]")) {
  repeatButton(b, (repeat) => send({ t: "aim", d: Number(b.dataset.aim), fine: !repeat }));
}
for (const b of document.querySelectorAll("[data-club]")) {
  b.addEventListener("click", () => send({ t: "club", d: Number(b.dataset.club) }));
}
for (const b of document.querySelectorAll("[data-holes]")) {
  b.addEventListener("click", () => send({ t: "settings", holes: Number(b.dataset.holes) }));
}
for (const b of document.querySelectorAll("[data-difficulty]")) {
  b.addEventListener("click", () => send({ t: "settings", difficulty: b.dataset.difficulty }));
}
$("start-btn").addEventListener("click", () => send({ t: "start" }));
$("next-btn").addEventListener("click", () => send({ t: "next" }));
$("join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  join();
});
$("strength").addEventListener("change", () => {
  store.set("swingGolfStrength", $("strength").value);
  applySettings();
});
$("lefty").addEventListener("change", () => {
  store.set("swingGolfLefty", $("lefty").checked ? "1" : "0");
  applySettings();
});
$("mode").addEventListener("change", () => {
  store.set("swingGolfMode", $("mode").value);
  render();
});

// Prevent pull-to-refresh / double-tap zoom during play.
document.addEventListener("touchmove", (e) => {
  if (e.target.closest?.(".pad")) e.preventDefault();
}, { passive: false });
