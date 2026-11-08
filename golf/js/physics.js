// Ball flight, bounce and roll.
import { surfaceAt } from "./course.js";

export const G = 9.81;
const DRAG = 0.0021; // quadratic drag coefficient (1/m)
const CUP_RADIUS = 0.12; // generous so putting feels fair
const MAX_CUP_SPEED = 2.4;

export const CLUBS = [
  { id: "DR", name: "Driver", carry: 225, launch: 12, lift: 0.0017, check: 0.75, teeOnly: true },
  { id: "3W", name: "3 Wood", carry: 200, launch: 14, lift: 0.0017, check: 0.7 },
  { id: "5I", name: "5 Iron", carry: 170, launch: 18, lift: 0.0018, check: 0.6 },
  { id: "7I", name: "7 Iron", carry: 145, launch: 23, lift: 0.0019, check: 0.5 },
  { id: "9I", name: "9 Iron", carry: 120, launch: 29, lift: 0.0019, check: 0.42 },
  { id: "PW", name: "Pitching Wedge", carry: 95, launch: 35, lift: 0.0019, check: 0.36 },
  { id: "SW", name: "Sand Wedge", carry: 65, launch: 44, lift: 0.0017, check: 0.3 },
  { id: "PT", name: "Putter", carry: 0, launch: 0, lift: 0, putter: true }
];

export const SURFACES = {
  tee: { bounce: 0.32, keep: 0.62, roll: 2.2 },
  fairway: { bounce: 0.32, keep: 0.6, roll: 2.4 },
  fringe: { bounce: 0.3, keep: 0.62, roll: 1.6 },
  green: { bounce: 0.26, keep: 0.68, roll: 1.0 },
  rough: { bounce: 0.18, keep: 0.38, roll: 5.5 },
  sand: { bounce: 0.04, keep: 0.1, roll: 10 },
  water: { bounce: 0, keep: 0, roll: 99 },
  ob: { bounce: 0.2, keep: 0.4, roll: 5 }
};

// How much of a club's distance you get from each lie.
export function lieFactor(lie, club) {
  if (club.putter) return 1;
  if (lie === "rough") return 0.85;
  if (lie === "sand") return club.id === "SW" ? 0.82 : 0.55;
  return 1;
}

function flightAccel(b, wind) {
  const rx = b.vx - wind.x;
  const ry = b.vy - wind.y;
  const rz = b.vz;
  const sp = Math.hypot(rx, ry, rz);
  const hs = Math.hypot(b.vx, b.vy) || 1;
  return {
    ax: -DRAG * sp * rx + b.side * (b.vy / hs),
    ay: -DRAG * sp * ry + b.side * (-b.vx / hs),
    az: -G - DRAG * sp * rz + b.lift * sp * sp
  };
}

function integrateFlight(b, dt, wind) {
  const a = flightAccel(b, wind);
  b.vx += a.ax * dt;
  b.vy += a.ay * dt;
  b.vz += a.az * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.lift *= 1 - 0.12 * dt; // backspin decays
}

// Carry distance in still air for a launch speed (used for calibration).
function simulateCarry(speed, launchDeg, lift) {
  const a = (launchDeg * Math.PI) / 180;
  const b = { x: 0, y: 0, z: 0, vx: 0, vy: speed * Math.cos(a), vz: speed * Math.sin(a), side: 0, lift };
  const still = { x: 0, y: 0 };
  const dt = 1 / 120;
  for (let i = 0; i < 2400; i++) {
    integrateFlight(b, dt, still);
    if (b.z < 0) return b.y;
  }
  return b.y;
}

const speedCache = new Map();
// Launch speed that carries the ball `carry` metres in still air.
export function speedForCarry(club, carry) {
  const key = `${club.id}:${Math.round(carry * 2)}`;
  if (speedCache.has(key)) return speedCache.get(key);
  let lo = 1;
  let hi = 140;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (simulateCarry(mid, club.launch, club.lift) < carry) lo = mid;
    else hi = mid;
  }
  const v = (lo + hi) / 2;
  speedCache.set(key, v);
  return v;
}

export function putterRange(distance) {
  const ranges = [4, 8, 15, 25, 40];
  return ranges.find((r) => r >= distance * 1.3) || ranges[ranges.length - 1];
}

// Create a moving ball from a swing.
// opts: { x, y, club, lie, power (0..1.15), face (deg), heading (rad), accuracy (0..1), putterRange }
export function launchBall(opts) {
  const { club, lie } = opts;
  let power = Math.max(0.02, Math.min(1.15, opts.power));
  let face = Math.max(-30, Math.min(30, opts.face || 0));
  if (Math.abs(face) < 2.5) face = 0; // small "sweet spot"
  if (power > 1) face += (Math.random() - 0.5) * (power - 1) * 60; // overswing costs accuracy
  face *= opts.accuracy ?? 1;

  const ball = { x: opts.x, y: opts.y, z: 0, vx: 0, vy: 0, vz: 0, side: 0, lift: 0, mode: "flight", hitTree: false, landed: false };

  if (club.putter) {
    const dist = power * opts.putterRange;
    const v = Math.sqrt(2 * SURFACES.green.roll * dist);
    const dir = opts.heading + ((face * 0.12) * Math.PI) / 180;
    ball.vx = Math.sin(dir) * v;
    ball.vy = Math.cos(dir) * v;
    ball.mode = "roll";
    ball.landed = true;
    return ball;
  }

  const carry = Math.max(3, club.carry * lieFactor(lie, club) * power);
  const v = speedForCarry(club, carry);
  const launch = (club.launch * Math.PI) / 180;
  const dir = opts.heading + ((face * 0.3) * Math.PI) / 180;
  const hv = v * Math.cos(launch);
  ball.vx = Math.sin(dir) * hv;
  ball.vy = Math.cos(dir) * hv;
  ball.vz = v * Math.sin(launch);
  ball.side = face * 0.075; // m/s^2 of curve, positive bends right
  ball.lift = club.lift;
  ball.check = club.check; // backspin bite on the first bounce
  return ball;
}

// Advance the ball. Pushes events into `events`:
// { type: "land", surface } | { type: "tree" } | { type: "water" } | { type: "ob" } | { type: "holed" } | { type: "lip" } | { type: "stop", surface }
export function stepBall(ball, dt, hole, wind, events) {
  if (ball.mode === "flight") {
    integrateFlight(ball, dt, wind);

    if (!ball.hitTree && ball.z > 1.5) {
      for (const t of hole.trees) {
        const dx = ball.x - t.x;
        const dy = ball.y - t.y;
        if (dx * dx + dy * dy < (2.6 * t.s) ** 2 && ball.z < 10 * t.s) {
          ball.hitTree = true;
          ball.vx *= -0.15;
          ball.vy *= -0.15;
          ball.vz = Math.min(ball.vz, 0) * 0.3;
          ball.side = 0;
          ball.lift = 0;
          events.push({ type: "tree" });
          break;
        }
      }
    }

    if (ball.z <= 0) {
      ball.z = 0;
      const surface = surfaceAt(hole, ball.x, ball.y);
      if (surface === "water" || surface === "ob") {
        ball.mode = "stopped";
        events.push({ type: surface });
        return;
      }
      // Dunk it straight in the cup.
      if (Math.hypot(ball.x - hole.pin.x, ball.y - hole.pin.y) < CUP_RADIUS * 1.3 && Math.abs(ball.vz) < 25) {
        ball.mode = "stopped";
        ball.x = hole.pin.x;
        ball.y = hole.pin.y;
        events.push({ type: "holed" });
        return;
      }
      const s = SURFACES[surface];
      if (!ball.landed) events.push({ type: "land", surface });
      ball.landed = true;
      const keep = s.keep * (ball.check ?? 1);
      ball.check = 1;
      ball.vz = -ball.vz * s.bounce;
      ball.vx *= keep;
      ball.vy *= keep;
      ball.side = 0;
      ball.lift = 0;
      if (ball.vz < 1.2) {
        ball.vz = 0;
        ball.mode = "roll";
      }
    }
    return;
  }

  if (ball.mode === "roll") {
    const surface = surfaceAt(hole, ball.x, ball.y);
    if (surface === "water" || surface === "ob") {
      ball.mode = "stopped";
      events.push({ type: surface });
      return;
    }
    const sp = Math.hypot(ball.vx, ball.vy);
    const dec = SURFACES[surface].roll * dt;
    const px = ball.x;
    const py = ball.y;
    if (sp <= dec) {
      ball.vx = 0;
      ball.vy = 0;
    } else {
      const k = (sp - dec) / sp;
      ball.vx *= k;
      ball.vy *= k;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
    }

    // Closest approach to the cup along this step.
    const dcup = segmentPointDistance(px, py, ball.x, ball.y, hole.pin.x, hole.pin.y);
    if (dcup < CUP_RADIUS) {
      if (sp < MAX_CUP_SPEED) {
        ball.mode = "stopped";
        ball.x = hole.pin.x;
        ball.y = hole.pin.y;
        events.push({ type: "holed" });
        return;
      }
      if (!ball.lipped) {
        ball.lipped = true;
        const turn = (Math.random() - 0.5) * 0.8;
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        const vx = ball.vx * c - ball.vy * s;
        const vy = ball.vx * s + ball.vy * c;
        ball.vx = vx * 0.7;
        ball.vy = vy * 0.7;
        events.push({ type: "lip" });
      }
    }

    if (ball.vx === 0 && ball.vy === 0) {
      ball.mode = "stopped";
      events.push({ type: "stop", surface });
    }
  }
}

function segmentPointDistance(ax, ay, bx, by, px, py) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + vx * t - px, ay + vy * t - py);
}
