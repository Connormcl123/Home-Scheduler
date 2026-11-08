// The big-screen game: lobby, turns, ball physics, camera and HUD.
import { HOLES, surfaceAt, SURFACE_LABEL, aimPointAlongPath } from "./course.js";
import { CLUBS, launchBall, stepBall, lieFactor, putterRange } from "./physics.js";
import { buildHoleGeometry, renderScene, renderMap } from "./render.js";
import { startHost, makeCode } from "./net.js";
import { sfx } from "./sound.js";

const COLORS = ["#e53935", "#1e88e5", "#fbc02d", "#8e24aa"];
const MAX_PLAYERS = 4;
const MAX_STROKES = 10;
const $ = (id) => document.getElementById(id);

const canvas = $("game");
const ctx = canvas.getContext("2d");
const mapCanvas = $("map");
const mapCtx = mapCanvas.getContext("2d");

const game = {
  phase: "lobby", // lobby | intro | aim | flight | result | holeEnd | final
  players: [],
  settings: { holes: 6, difficulty: "normal" },
  holeList: [],
  holeIdx: 0,
  hole: null,
  geo: null,
  wind: { x: 0, y: 0 },
  turn: -1,
  clubIdx: 0,
  heading: 0,
  ball: null,
  shot: null,
  trail: [],
  phaseTime: 0,
  meter: 0,
  meterPeak: 0,
  keyCharge: null
};

const cam = { x: 0, y: -10, z: 3, heading: 0, horizon: 0.36 };
const camTarget = { ...cam };

// ---------------------------------------------------------------- networking

let code = sessionStorage.getItem("swingGolfCode") || makeCode();
let host = null;
let takenRetries = 0;

function openHost() {
  sessionStorage.setItem("swingGolfCode", code);
  host?.destroy();
  setConnStatus("connecting");
  host = startHost(code, {
    onConnection: handleConnection,
    onStatus: (status, detail) => {
      if (status === "taken") {
        takenRetries++;
        if (takenRetries > 2) {
          code = makeCode();
          takenRetries = 0;
        }
        setTimeout(openHost, 2500);
        setConnStatus("connecting");
        return;
      }
      setConnStatus(status, detail);
    }
  });
  showJoinInfo();
}

function setConnStatus(status, detail) {
  const el = $("conn-status");
  const text = {
    connecting: "Connecting to the matchmaking server…",
    online: "Ready for phones",
    reconnecting: "Reconnecting…",
    offline: detail || "Offline"
  }[status] || status;
  el.textContent = text;
  el.dataset.status = status;
}

function controllerUrl(local) {
  const u = new URL("controller.html", location.href);
  u.searchParams.set("code", code);
  if (local) u.searchParams.set("local", "1");
  return u.toString();
}

function showJoinInfo() {
  $("join-code").textContent = code;
  $("chip-code").textContent = code;
  const url = controllerUrl(false);
  $("join-url").textContent = url.replace(/^https?:\/\//, "");
  $("test-link").href = controllerUrl(true);
  const qrEl = $("qr");
  qrEl.innerHTML = "";
  if (window.qrcode) {
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    qrEl.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }
  if (location.protocol === "http:" && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    $("https-warning").hidden = false;
  }
}

function handleConnection(conn) {
  let player = null;
  conn.onData((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "hello") {
      player = registerPlayer(conn, msg);
      return;
    }
    if (player) handleMessage(player, msg);
  });
  conn.onClose(() => {
    if (player && player.conn === conn) {
      player.connected = false;
      player.conn = null;
      if (game.phase === "lobby") {
        game.players = game.players.filter((p) => p !== player);
        game.players.forEach((p, i) => (p.color = COLORS[i]));
      }
      updateLobby();
      broadcastState();
    }
  });
}

function registerPlayer(conn, msg) {
  const name = String(msg.name || "Player").slice(0, 14) || "Player";
  let player = game.players.find((p) => p.clientId === msg.clientId);
  if (player) {
    player.conn?.close();
    player.conn = conn;
    player.connected = true;
    player.name = name;
  } else {
    if (game.phase !== "lobby") {
      conn.send({ t: "error", message: "A round is in progress. Join after it finishes." });
      return null;
    }
    if (game.players.length >= MAX_PLAYERS) {
      conn.send({ t: "error", message: "The game is full (4 players)." });
      return null;
    }
    player = {
      clientId: msg.clientId,
      name,
      color: COLORS[game.players.length],
      conn,
      connected: true,
      scores: [],
      pos: { x: 0, y: 0 },
      prev: { x: 0, y: 0 },
      lie: "tee",
      strokes: 0,
      holed: false
    };
    game.players.push(player);
    sfx.join();
  }
  conn.send({ t: "welcome", name: player.name, color: player.color });
  updateLobby();
  broadcastState();
  return player;
}

function isHostPlayer(p) {
  return game.players.find((q) => q.connected) === p;
}

function handleMessage(player, msg) {
  const myTurn = game.players[game.turn] === player && game.phase === "aim";
  switch (msg.t) {
    case "settings":
      if (game.phase === "lobby" && isHostPlayer(player)) {
        if ([3, 6].includes(msg.holes)) game.settings.holes = msg.holes;
        if (["easy", "normal", "pro"].includes(msg.difficulty)) game.settings.difficulty = msg.difficulty;
        updateLobby();
        broadcastState();
      }
      break;
    case "start":
      if (game.phase === "lobby" && isHostPlayer(player)) startRound();
      break;
    case "next":
      advance();
      break;
    case "aim":
      if (myTurn) nudgeAim(Math.sign(msg.d) * (msg.fine ? 0.25 : 1));
      break;
    case "club":
      if (myTurn) changeClub(Math.sign(msg.d));
      break;
    case "motion":
      if (myTurn) game.meter = Math.max(0, Math.min(1.2, Number(msg.p) || 0));
      break;
    case "swing":
      if (myTurn) takeShot(Number(msg.power) || 0, Number(msg.face) || 0);
      break;
  }
}

function stateFor(player) {
  const current = game.players[game.turn];
  const club = CLUBS[game.clubIdx];
  const s = {
    t: "state",
    phase: game.phase,
    isHost: isHostPlayer(player),
    settings: game.settings,
    players: game.players.map((p) => ({ name: p.name, color: p.color, connected: p.connected })),
    yourTurn: current === player && game.phase === "aim",
    turnName: current?.name || "",
    turnColor: current?.color || ""
  };
  if (game.hole) {
    s.hole = game.holeIdx + 1;
    s.holes = game.holeList.length;
    s.par = game.hole.par;
    s.strokes = player.strokes;
    s.total = player.scores.reduce((a, b) => a + (b || 0), 0);
  }
  if (current === player && game.phase === "aim") {
    s.club = club.name;
    s.full = club.putter ? `${putterRange(distToPin(player.pos))} m putt` : `${Math.round(club.carry * lieFactor(player.lie, club))} m carry`;
    s.putter = !!club.putter;
    s.toPin = Math.round(distToPin(player.pos));
    s.lie = SURFACE_LABEL[player.lie];
  }
  return s;
}

function broadcastState() {
  for (const p of game.players) if (p.conn) p.conn.send(stateFor(p));
}

function sendTo(player, msg) {
  player?.conn?.send(msg);
}

// ---------------------------------------------------------------- game flow

function startRound() {
  if (!game.players.length) return;
  game.holeList = HOLES.slice(0, game.settings.holes);
  for (const p of game.players) p.scores = [];
  sfx.unlock();
  startHole(0);
}

function startHole(i) {
  game.holeIdx = i;
  game.hole = game.holeList[i];
  game.geo = buildHoleGeometry(game.hole);
  const windSpeed = Math.random() * (game.settings.difficulty === "easy" ? 2.5 : 5.5);
  const windDir = Math.random() * Math.PI * 2;
  game.wind = { x: Math.sin(windDir) * windSpeed, y: Math.cos(windDir) * windSpeed };
  for (const p of game.players) {
    p.pos = { ...game.hole.tee };
    p.prev = { ...game.hole.tee };
    p.lie = "tee";
    p.strokes = 0;
    p.holed = false;
  }
  game.turn = -1;
  game.ball = null;
  game.trail = [];
  setPhase("intro");
  $("lobby").hidden = true;
  $("scorecard").hidden = true;
  $("hud").hidden = false;
  showBanner(`Hole ${game.hole.number}`, `${game.hole.name} · Par ${game.hole.par} · ${game.hole.length} m`, 3000);
  broadcastState();
}

function setPhase(phase) {
  game.phase = phase;
  game.phaseTime = 0;
}

function distToPin(pos) {
  return Math.hypot(game.hole.pin.x - pos.x, game.hole.pin.y - pos.y);
}

function nextTurn() {
  const active = game.players.filter((p) => !p.holed);
  if (!active.length) {
    endHole();
    return;
  }
  // Tee off in join order, then whoever is farthest from the pin plays.
  let next = active.find((p) => p.strokes === 0);
  if (!next) next = active.reduce((a, b) => (distToPin(b.pos) > distToPin(a.pos) ? b : a));
  game.turn = game.players.indexOf(next);
  beginTurn(next);
}

function beginTurn(p) {
  game.ball = { x: p.pos.x, y: p.pos.y, z: 0, mode: "stopped" };
  game.trail = [];
  game.meter = 0;
  game.meterPeak = 0;
  autoClub(p);
  autoAim(p);
  setPhase("aim");
  setAimCamera(true);
  showBanner(`${p.name}'s turn`, p.connected ? "Hold the swing button on your phone and swing!" : "Phone disconnected – reconnect or press Space to swing", 1800, p.color);
  broadcastState();
  sendTo(p, { t: "buzz", ms: [60, 60, 60] });
}

function autoClub(p) {
  const d = distToPin(p.pos);
  if (p.lie === "green" || (p.lie === "fringe" && d < 20)) {
    game.clubIdx = CLUBS.findIndex((c) => c.putter);
    return;
  }
  const options = CLUBS.map((c, i) => ({ c, i })).filter(({ c }) => !c.putter && (!c.teeOnly || p.lie === "tee"));
  let pick = options[0];
  for (const o of options) {
    if (o.c.carry * lieFactor(p.lie, o.c) >= d * 0.92) pick = o;
  }
  game.clubIdx = pick.i;
}

function autoAim(p) {
  const club = CLUBS[game.clubIdx];
  const d = distToPin(p.pos);
  const carry = club.putter ? d : club.carry * lieFactor(p.lie, club) * 1.05;
  let target = game.hole.pin;
  if (carry < d * 0.9) {
    const along = aimPointAlongPath(game.hole, p.pos.x, p.pos.y, carry);
    if (along && Math.hypot(along.x - p.pos.x, along.y - p.pos.y) > 20) target = along;
  }
  game.heading = Math.atan2(target.x - p.pos.x, target.y - p.pos.y);
}

function nudgeAim(deg) {
  const club = CLUBS[game.clubIdx];
  game.heading += ((club.putter ? deg * 0.5 : deg) * Math.PI) / 180;
  setAimCamera(false);
}

function changeClub(d) {
  const p = game.players[game.turn];
  let i = game.clubIdx;
  for (let k = 0; k < CLUBS.length; k++) {
    i = (i + d + CLUBS.length) % CLUBS.length;
    const c = CLUBS[i];
    if (c.teeOnly && p.lie !== "tee") continue;
    if (c.putter && p.lie === "sand") continue;
    break;
  }
  game.clubIdx = i;
  setAimCamera(false);
  broadcastState();
}

function difficultyAccuracy() {
  return { easy: 0.45, normal: 0.8, pro: 1.15 }[game.settings.difficulty] || 0.8;
}

function takeShot(power, face) {
  const p = game.players[game.turn];
  const club = CLUBS[game.clubIdx];
  p.prev = { ...p.pos };
  p.strokes++;
  game.ball = launchBall({
    x: p.pos.x,
    y: p.pos.y,
    club,
    lie: p.lie,
    power,
    face,
    heading: game.heading,
    accuracy: difficultyAccuracy(),
    putterRange: putterRange(distToPin(p.pos))
  });
  game.shot = { player: p, club, start: { ...p.pos }, power, face, carry: null, events: [] };
  game.meterPeak = Math.min(1.2, power);
  game.trail = [];
  setPhase("flight");
  club.putter ? sfx.putt() : sfx.hit(power);
  sendTo(p, { t: "buzz", ms: [80] });
  const pct = Math.round(power * 100);
  const faceText = Math.abs(face) < 2.5 ? "square" : face > 0 ? `${Math.round(face)}° open` : `${Math.round(-face)}° closed`;
  $("swing-readout").textContent = `${pct}% power · face ${faceText}`;
  broadcastState();
}

function finishShot(outcome) {
  const s = game.shot;
  const p = s.player;
  let title = "";
  let sub = "";
  if (outcome === "holed") {
    p.holed = true;
    p.pos = { ...game.hole.pin };
    title = scoreName(p.strokes, game.hole.par);
    sub = `${p.name} holes out in ${p.strokes}`;
    sfx.cup();
  } else if (outcome === "water" || outcome === "ob") {
    p.strokes++;
    p.pos = { ...p.prev };
    title = outcome === "water" ? "Splash!" : "Out of bounds";
    sub = "+1 penalty stroke – replay from the same spot";
    outcome === "water" ? sfx.splash() : sfx.miss();
  } else {
    p.pos = { x: game.ball.x, y: game.ball.y };
    p.lie = surfaceAt(game.hole, p.pos.x, p.pos.y);
    const dist = Math.hypot(p.pos.x - s.start.x, p.pos.y - s.start.y);
    title = s.club.putter ? (distToPin(p.pos) < 1 ? "So close!" : SURFACE_LABEL[p.lie]) : SURFACE_LABEL[p.lie];
    sub = `${Math.round(dist)} m · ${Math.round(distToPin(p.pos))} m to the pin`;
  }
  if (!p.holed && p.strokes >= MAX_STROKES) {
    p.holed = true;
    sub += ` · picked up at ${MAX_STROKES}`;
  }
  if (p.holed) p.scores[game.holeIdx] = p.strokes;
  showBanner(title, sub, 2400, p.color);
  setPhase("result");
  broadcastState();
}

function scoreName(strokes, par) {
  if (strokes === 1) return "HOLE IN ONE!";
  const diff = strokes - par;
  return { "-3": "Albatross!", "-2": "Eagle!", "-1": "Birdie!", 0: "Par", 1: "Bogey", 2: "Double bogey" }[diff] || `+${diff}`;
}

function endHole() {
  setPhase(game.holeIdx + 1 >= game.holeList.length ? "final" : "holeEnd");
  renderScorecard();
  $("scorecard").hidden = false;
  broadcastState();
}

function advance() {
  if (game.phase === "result" && game.phaseTime > 0.6) nextTurn();
  else if (game.phase === "intro" && game.phaseTime > 0.8) {
    setPhase("result");
    game.phaseTime = 99;
  } else if (game.phase === "holeEnd" && game.phaseTime > 1) startHole(game.holeIdx + 1);
  else if (game.phase === "final" && game.phaseTime > 1) backToLobby();
  else if (game.phase === "lobby" && game.players.length) startRound();
}

function backToLobby() {
  setPhase("lobby");
  game.hole = null;
  game.players = game.players.filter((p) => p.connected);
  game.players.forEach((p, i) => (p.color = COLORS[i]));
  $("scorecard").hidden = true;
  $("hud").hidden = true;
  $("lobby").hidden = false;
  updateLobby();
  broadcastState();
}

// ---------------------------------------------------------------- update loop

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function setAimCamera(snap) {
  const club = CLUBS[game.clubIdx];
  const b = game.ball;
  const back = club.putter ? 4.5 : 9;
  camTarget.x = b.x - Math.sin(game.heading) * back;
  camTarget.y = b.y - Math.cos(game.heading) * back;
  camTarget.z = club.putter ? 1.9 : 3.2;
  camTarget.heading = game.heading;
  camTarget.horizon = club.putter ? 0.24 : 0.36;
  if (snap && game.phase !== "aim") Object.assign(cam, camTarget);
}

function update(dt) {
  game.phaseTime += dt;
  const hole = game.hole;

  if (game.phase === "intro") {
    const T = 3.2;
    const t = Math.min(1, game.phaseTime / T);
    const e = t * t * (3 - 2 * t);
    const path = hole.path;
    const idx = (1 - e) * (path.length - 1) * 0.85;
    const i0 = Math.floor(idx);
    const f = idx - i0;
    const a = path[i0];
    const b = path[Math.min(path.length - 1, i0 + 1)];
    const px = a.x + (b.x - a.x) * f;
    const py = a.y + (b.y - a.y) * f - 12;
    cam.x = px;
    cam.y = py;
    cam.z = 4 + (1 - e) * 40;
    cam.heading = Math.atan2(hole.pin.x - px, hole.pin.y - py + 0.001);
    cam.horizon = 0.36 - (1 - e) * 0.1;
    if (t >= 1) {
      setPhase("result");
      game.phaseTime = 99;
    }
  } else if (game.phase === "flight" && game.ball) {
    const events = [];
    const steps = 4;
    for (let i = 0; i < steps && game.ball.mode !== "stopped"; i++) stepBall(game.ball, dt / steps, hole, game.wind, events);
    if (game.trail.length === 0 || game.phaseTime % 0.05 < dt) game.trail.push([game.ball.x, game.ball.y, game.ball.z]);
    for (const ev of events) {
      if (ev.type === "tree") sfx.tree();
      if (ev.type === "land" && game.ball.mode !== "stopped") sfx.land(ev.surface);
      if (ev.type === "lip") showBanner("Lip out!", "", 1000);
    }
    const end = events.find((e) => ["holed", "water", "ob", "stop"].includes(e.type));
    if (end) finishShot(end.type);

    const b = game.ball;
    const sp = Math.hypot(b.vx, b.vy);
    const heading = sp > 0.5 ? Math.atan2(b.vx, b.vy) : cam.heading;
    const back = game.shot.club.putter ? 4.5 : 12;
    camTarget.heading = lerpAngle(camTarget.heading, heading, Math.min(1, dt * 1.5));
    camTarget.x = b.x - Math.sin(camTarget.heading) * back;
    camTarget.y = b.y - Math.cos(camTarget.heading) * back;
    camTarget.z = (game.shot.club.putter ? 1.9 : 3.5) + b.z * 0.75;
    camTarget.horizon = game.shot.club.putter ? 0.24 : 0.36 + Math.min(0.12, b.z * 0.004);
  } else if (game.phase === "result") {
    if (game.phaseTime > 2.6) nextTurn();
  } else if (game.phase === "holeEnd" && game.phaseTime > 15) {
    startHole(game.holeIdx + 1);
  }

  if (game.phase !== "intro") {
    const k = 1 - Math.exp(-dt * (game.phase === "flight" ? 3 : 4));
    cam.x += (camTarget.x - cam.x) * k;
    cam.y += (camTarget.y - cam.y) * k;
    cam.z += (camTarget.z - cam.z) * k;
    cam.heading = lerpAngle(cam.heading, camTarget.heading, k);
    cam.horizon += (camTarget.horizon - cam.horizon) * k;
  }

  // Keyboard swing charge.
  if (game.keyCharge !== null && game.phase === "aim") {
    game.keyCharge += dt;
    const t = game.keyCharge / 1.3;
    game.meter = Math.min(1.15, t);
  }
  if (game.phase !== "aim" && game.phase !== "flight") game.meter *= 0.9;
}

// ---------------------------------------------------------------- drawing

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
}

// The map lives in the HUD, which is hidden in the lobby, so size it lazily.
function sizeMap() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(mapCanvas.clientWidth * dpr);
  const h = Math.round(mapCanvas.clientHeight * dpr);
  if (w && (mapCanvas.width !== w || mapCanvas.height !== h)) {
    mapCanvas.width = w;
    mapCanvas.height = h;
  }
}

function sceneBalls() {
  const balls = [];
  game.players.forEach((p, i) => {
    if (p.holed) return;
    const isActive = i === game.turn && game.ball && ["aim", "flight", "result"].includes(game.phase);
    if (isActive) return;
    if (p.strokes === 0 && game.phase !== "intro") return;
    balls.push({ x: p.pos.x, y: p.pos.y, z: 0, color: p.color, active: false });
  });
  const cur = game.players[game.turn];
  if (cur && game.ball && ["aim", "flight", "result"].includes(game.phase) && !(cur.holed && game.phase === "result" && game.ball.mode === "stopped" && distToPin(game.ball) < 0.2)) {
    balls.push({ x: game.ball.x, y: game.ball.y, z: game.ball.z || 0, color: cur.color, active: true });
  }
  return balls;
}

function currentTarget() {
  if (game.phase !== "aim") return null;
  const p = game.players[game.turn];
  const club = CLUBS[game.clubIdx];
  const dist = club.putter ? Math.min(distToPin(p.pos), putterRange(distToPin(p.pos))) : club.carry * lieFactor(p.lie, club);
  return {
    from: p.pos,
    to: { x: p.pos.x + Math.sin(game.heading) * dist, y: p.pos.y + Math.cos(game.heading) * dist },
    radius: club.putter ? 0.4 : Math.max(3, dist * 0.04)
  };
}

function draw(time) {
  const W = canvas.width;
  const H = canvas.height;
  if (!game.hole) {
    ctx.fillStyle = "#1f4d2b";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const scene = {
    hole: game.hole,
    geo: game.geo,
    cam,
    balls: sceneBalls(),
    target: currentTarget(),
    trail: game.phase === "flight" || game.phase === "result" ? game.trail : null,
    time: time / 1000
  };
  renderScene(ctx, W, H, scene);
  sizeMap();
  renderMap(mapCtx, mapCanvas.width, mapCanvas.height, scene);
  drawHud();
}

function drawHud() {
  const hole = game.hole;
  const p = game.players[game.turn];
  $("hud-hole").textContent = `Hole ${hole.number}`;
  $("hud-par").textContent = `Par ${hole.par} · ${hole.length} m`;
  $("hud-name").textContent = hole.name;

  const windSpeed = Math.hypot(game.wind.x, game.wind.y);
  const windRel = Math.atan2(game.wind.x, game.wind.y) - cam.heading;
  $("wind-arrow").style.transform = `rotate(${(windRel * 180) / Math.PI}deg)`;
  $("wind-speed").textContent = `${windSpeed.toFixed(1)} m/s`;

  const showShot = p && ["aim", "flight", "result"].includes(game.phase);
  $("hud-shot").hidden = !showShot;
  if (showShot) {
    const club = CLUBS[game.clubIdx];
    $("hud-player").textContent = p.name;
    $("hud-player").style.color = p.color;
    $("hud-strokes").textContent = `Stroke ${Math.max(1, p.strokes + (game.phase === "aim" ? 1 : 0))}`;
    $("hud-club").textContent = club.name;
    const ball = game.ball || p.pos;
    $("hud-topin").textContent = `${Math.round(distToPin(ball))} m to pin`;
    $("hud-full").textContent = club.putter ? `Putter range ${putterRange(distToPin(p.pos))} m` : `Full swing ${Math.round(club.carry * lieFactor(p.lie, club))} m`;
    $("hud-lie").textContent = game.phase === "aim" ? `Lie: ${SURFACE_LABEL[p.lie]}` : "";
  }

  const players = game.players
    .map((q) => {
      const total = q.scores.reduce((a, b) => a + (b || 0), 0);
      const parSoFar = game.holeList.slice(0, q.scores.length).reduce((a, h, i) => a + (q.scores[i] ? h.par : 0), 0);
      const rel = total - parSoFar;
      const relText = q.scores.filter(Boolean).length ? (rel === 0 ? "E" : rel > 0 ? `+${rel}` : `${rel}`) : "–";
      return `<li style="--c:${q.color}" class="${q === p ? "current" : ""} ${q.connected ? "" : "offline"}"><span>${escapeHtml(q.name)}</span><b>${relText}</b><i>${q.holed ? "✓" : q.strokes || ""}</i></li>`;
    })
    .join("");
  if ($("hud-players").dataset.html !== players) {
    $("hud-players").innerHTML = players;
    $("hud-players").dataset.html = players;
  }

  const meter = Math.min(1.2, game.phase === "aim" ? game.meter : game.meterPeak);
  $("meter-fill").style.height = `${(meter / 1.2) * 100}%`;
  $("meter-fill").classList.toggle("over", meter > 1);
  $("meter").hidden = !(game.phase === "aim" || game.phase === "flight");
}

// ---------------------------------------------------------------- overlays

let bannerTimer = null;
function showBanner(title, sub, ms, color) {
  const el = $("banner");
  $("banner-title").textContent = title;
  $("banner-sub").textContent = sub || "";
  el.style.setProperty("--c", color || "#fff");
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove("show"), ms);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function updateLobby() {
  const list = $("lobby-players");
  list.innerHTML = game.players.length
    ? game.players.map((p, i) => `<li style="--c:${p.color}">${escapeHtml(p.name)}${i === 0 ? " <small>host</small>" : ""}${p.connected ? "" : " <small>(offline)</small>"}</li>`).join("")
    : `<li class="empty">Waiting for players…</li>`;
  $("start-btn").disabled = !game.players.length;
  for (const b of document.querySelectorAll("[data-holes]")) b.classList.toggle("active", Number(b.dataset.holes) === game.settings.holes);
  for (const b of document.querySelectorAll("[data-difficulty]")) b.classList.toggle("active", b.dataset.difficulty === game.settings.difficulty);
}

function renderScorecard() {
  const holes = game.holeList;
  const final = game.phase === "final";
  const totals = game.players.map((p) => p.scores.reduce((a, b) => a + (b || 0), 0));
  const parTotal = holes.slice(0, game.holeIdx + 1).reduce((a, h) => a + h.par, 0);
  let html = `<table><thead><tr><th>Hole</th>${holes.map((h) => `<th>${h.number}</th>`).join("")}<th>Total</th></tr>`;
  html += `<tr class="par"><td>Par</td>${holes.map((h) => `<td>${h.par}</td>`).join("")}<td>${holes.reduce((a, h) => a + h.par, 0)}</td></tr></thead><tbody>`;
  game.players.forEach((p, i) => {
    const rel = totals[i] - parTotal;
    html += `<tr><td style="color:${p.color}">${escapeHtml(p.name)}</td>${holes
      .map((h, hi) => {
        const s = p.scores[hi];
        if (!s) return "<td></td>";
        const d = s - h.par;
        return `<td class="${d < 0 ? "under" : d > 0 ? "over" : ""}">${s}</td>`;
      })
      .join("")}<td><b>${totals[i]}</b> <small>${rel === 0 ? "E" : rel > 0 ? "+" + rel : rel}</small></td></tr>`;
  });
  html += "</tbody></table>";
  $("score-table").innerHTML = html;
  if (final) {
    const best = Math.min(...totals);
    const winners = game.players.filter((p, i) => totals[i] === best).map((p) => p.name);
    $("score-title").textContent = winners.length > 1 ? `Tie: ${winners.join(" & ")}!` : `${winners[0]} wins!`;
    $("score-hint").textContent = "Press Next on any phone (or Enter) to go back to the lobby";
    sfx.cheer();
  } else {
    $("score-title").textContent = `After hole ${game.hole.number}`;
    $("score-hint").textContent = "Press Next on any phone (or Enter) for the next hole";
  }
}

// ---------------------------------------------------------------- input on the display itself

window.addEventListener("keydown", (e) => {
  sfx.unlock();
  if (e.repeat && e.code === "Space") return;
  const aiming = game.phase === "aim";
  if (e.code === "Enter") advance();
  else if (e.code === "KeyF") toggleFullscreen();
  else if (aiming && e.code === "ArrowLeft") nudgeAim(e.shiftKey ? -0.25 : -1);
  else if (aiming && e.code === "ArrowRight") nudgeAim(e.shiftKey ? 0.25 : 1);
  else if (aiming && e.code === "ArrowUp") changeClub(-1);
  else if (aiming && e.code === "ArrowDown") changeClub(1);
  else if (aiming && e.code === "Space") {
    game.keyCharge = 0;
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && game.keyCharge !== null) {
    const power = Math.min(1.15, game.keyCharge / 1.3);
    game.keyCharge = null;
    if (game.phase === "aim") takeShot(power, (Math.random() - 0.5) * 8);
  }
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

$("fullscreen-btn").addEventListener("click", toggleFullscreen);
$("start-btn").addEventListener("click", () => startRound());
$("next-btn").addEventListener("click", () => advance());
for (const b of document.querySelectorAll("[data-holes]"))
  b.addEventListener("click", () => {
    game.settings.holes = Number(b.dataset.holes);
    updateLobby();
    broadcastState();
  });
for (const b of document.querySelectorAll("[data-difficulty]"))
  b.addEventListener("click", () => {
    game.settings.difficulty = b.dataset.difficulty;
    updateLobby();
    broadcastState();
  });
document.addEventListener("pointerdown", () => sfx.unlock());
$("new-code").addEventListener("click", () => {
  code = makeCode();
  openHost();
});

// ---------------------------------------------------------------- boot

window.addEventListener("resize", resize);
resize();
updateLobby();
openHost();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.hole) update(dt);
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for debugging in the console.
window.swingGolf = { game, takeShot, CLUBS, putterRange, lieFactor };
