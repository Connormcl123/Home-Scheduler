// Course data and surface lookup.
// World units are metres. x = lateral (right is positive), y = down-range from the tee, z = height.

const RAW_HOLES = [
  {
    name: "Morning Mist",
    par: 4,
    fairway: 32,
    fairwayFrom: 35,
    path: [[0, 0], [0, 150], [6, 270], [2, 345]],
    green: { r: 15, pin: [3, -4] },
    bunkers: [[24, 235, 10, 6], [-20, 250, 8, 5], [-17, 352, 6, 4], [16, 333, 5, 4]],
    water: [],
    seed: 11
  },
  {
    name: "Lake Carry",
    par: 3,
    fairway: 20,
    fairwayFrom: 110,
    path: [[0, 0], [0, 155]],
    green: { r: 14, pin: [-4, 3] },
    bunkers: [[-17, 162, 6, 4], [15, 146, 5, 4]],
    water: [[0, 78, 34, 26]],
    seed: 23
  },
  {
    name: "Dogleg Left",
    par: 5,
    fairway: 34,
    fairwayFrom: 40,
    path: [[0, 0], [0, 220], [-50, 330], [-120, 420], [-150, 480]],
    green: { r: 16, pin: [2, 2] },
    bunkers: [[24, 230, 10, 6], [-40, 252, 9, 6], [-112, 372, 7, 5], [-168, 492, 6, 5], [-132, 498, 6, 4]],
    water: [[-172, 440, 16, 12]],
    seed: 37
  },
  {
    name: "Lakeside",
    par: 4,
    fairway: 30,
    fairwayFrom: 35,
    path: [[0, 0], [0, 160], [30, 290], [45, 370]],
    green: { r: 14, pin: [-3, -2] },
    bunkers: [[-22, 270, 9, 6], [61, 372, 6, 4], [28, 386, 5, 4]],
    water: [[50, 185, 18, 70]],
    seed: 41
  },
  {
    name: "Sandy Shelf",
    par: 3,
    fairway: 18,
    fairwayFrom: 120,
    path: [[0, 0], [-5, 185]],
    green: { r: 13, pin: [3, 4] },
    bunkers: [[-19, 180, 7, 5], [15, 189, 6, 5], [-3, 206, 9, 4], [-2, 162, 8, 3]],
    water: [],
    seed: 53
  },
  {
    name: "Home Stretch",
    par: 4,
    fairway: 26,
    fairwayFrom: 35,
    path: [[0, 0], [0, 180], [-15, 300], [-10, 410]],
    green: { r: 15, pin: [-4, 5] },
    bunkers: [[18, 200, 8, 6], [-30, 225, 8, 6], [-27, 405, 6, 5], [8, 422, 5, 5]],
    water: [[17, 330, 14, 20]],
    seed: 67
  }
];

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function densify(points, step) {
  const out = [{ x: points[0][0], y: points[0][1], d: 0 }];
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, d: along + len * t });
    }
    along += len;
  }
  return out;
}

function inEllipse(e, x, y) {
  const dx = (x - e.x) / e.rx;
  const dy = (y - e.y) / e.ry;
  return dx * dx + dy * dy <= 1;
}

function distToPolyline(pts, x, y) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    let t = ((x - a.x) * vx + (y - a.y) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a.x + vx * t - x, a.y + vy * t - y);
    if (d < best) best = d;
  }
  return best;
}

function buildHole(raw, index) {
  const path = densify(raw.path, 8);
  const last = path[path.length - 1];
  const green = { x: last.x, y: last.y, r: raw.green.r };
  const pin = { x: green.x + raw.green.pin[0], y: green.y + raw.green.pin[1] };
  const fairwayPts = path.filter((p) => p.d >= raw.fairwayFrom);
  const bunkers = raw.bunkers.map(([x, y, rx, ry]) => ({ x, y, rx, ry }));
  const water = raw.water.map(([x, y, rx, ry]) => ({ x, y, rx, ry }));

  const hole = {
    number: index + 1,
    name: raw.name,
    par: raw.par,
    tee: { x: 0, y: 0 },
    path,
    fairwayPts,
    fairwayWidth: raw.fairway,
    green,
    pin,
    bunkers,
    water,
    obLimit: raw.fairway / 2 + 48,
    length: Math.round(last.d),
    trees: []
  };

  // Scatter trees along both edges of the hole, deterministic per hole.
  const rand = seededRandom(raw.seed);
  for (let i = 0; i < path.length; i += 2) {
    const p = path[i];
    const q = path[Math.min(path.length - 1, i + 1)];
    const p0 = path[Math.max(0, i - 1)];
    let tx = q.x - p0.x;
    let ty = q.y - p0.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = ty;
    const ny = -tx;
    for (const side of [-1, 1]) {
      if (rand() > 0.72) continue;
      const off = raw.fairway / 2 + 16 + rand() * 32;
      const x = p.x + nx * off * side + (rand() - 0.5) * 6;
      const y = p.y + ny * off * side + (rand() - 0.5) * 6;
      tryTree(hole, x, y, 0.8 + rand() * 0.7);
    }
  }
  // A backdrop of trees behind the green.
  for (let k = 0; k < 9; k++) {
    const a = (k / 8 - 0.5) * 2.2;
    const dir = Math.atan2(green.x - path[path.length - 4].x, green.y - path[path.length - 4].y);
    const dist = green.r + 22 + rand() * 25;
    tryTree(hole, green.x + Math.sin(dir + a) * dist, green.y + Math.cos(dir + a) * dist, 0.9 + rand() * 0.6);
  }
  return hole;
}

function tryTree(hole, x, y, s) {
  if (Math.hypot(x - hole.green.x, y - hole.green.y) < hole.green.r + 12) return;
  if (Math.hypot(x, y) < 18) return;
  if (hole.water.some((w) => inEllipse({ ...w, rx: w.rx + 4, ry: w.ry + 4 }, x, y))) return;
  if (hole.bunkers.some((b) => inEllipse({ ...b, rx: b.rx + 4, ry: b.ry + 4 }, x, y))) return;
  if (distToPolyline(hole.path, x, y) < hole.fairwayWidth / 2 + 10) return;
  hole.trees.push({ x, y, s });
}

export const HOLES = RAW_HOLES.map(buildHole);

// Returns one of: tee, green, fringe, sand, water, fairway, rough, ob
export function surfaceAt(hole, x, y) {
  if (hole.water.some((w) => inEllipse(w, x, y))) return "water";
  const dg = Math.hypot(x - hole.green.x, y - hole.green.y);
  if (dg <= hole.green.r) return "green";
  if (hole.bunkers.some((b) => inEllipse(b, x, y))) return "sand";
  if (dg <= hole.green.r + 2.5) return "fringe";
  if (Math.abs(x) < 4 && y > -4 && y < 5) return "tee";
  const d = distToPolyline(hole.path, x, y);
  if (d > hole.obLimit || y < -25) return "ob";
  if (hole.fairwayPts.length > 1 && distToPolyline(hole.fairwayPts, x, y) <= hole.fairwayWidth / 2) return "fairway";
  return "rough";
}

export const SURFACE_LABEL = {
  tee: "Tee",
  green: "Green",
  fringe: "Fringe",
  sand: "Bunker",
  water: "Water",
  fairway: "Fairway",
  rough: "Rough",
  ob: "Out of bounds"
};

// Point on the hole's centre line roughly `dist` metres from (x, y), as far along the hole as possible.
export function aimPointAlongPath(hole, x, y, dist) {
  let best = null;
  for (const p of hole.path) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= dist) best = p;
  }
  return best;
}
