// Pseudo-3D renderer: a perspective camera over a flat course, drawn on a 2D canvas.

const NEAR = 0.6;
const FAR = 900;

const COLORS = {
  skyTop: "#5aa9e6",
  skyBottom: "#cfeaf7",
  hillFar: "#7fae8a",
  hillNear: "#5d9467",
  rough: "#4f8f3a",
  roughFar: "#6d9f5c",
  fairwayA: "#79c04f",
  fairwayB: "#6fb447",
  tee: "#86cc5a",
  fringe: "#7cc552",
  green: "#93d86a",
  sand: "#ead9a3",
  sandEdge: "#d7c184",
  water: "#3d8fd1",
  waterEdge: "#2f74ad"
};

// Pre-built world-space polygons for a hole.
export function buildHoleGeometry(hole) {
  const fairwayQuads = [];
  const pts = hole.fairwayPts;
  const w = hole.fairwayWidth / 2;
  const edges = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    return { l: [p.x - ty * w, p.y + tx * w], r: [p.x + ty * w, p.y - tx * w] };
  });
  for (let i = 1; i < edges.length; i++) {
    fairwayQuads.push({
      poly: [edges[i - 1].l, edges[i].l, edges[i].r, edges[i - 1].r],
      color: Math.floor(i / 2) % 2 ? COLORS.fairwayA : COLORS.fairwayB
    });
  }
  // Rounded fairway start.
  if (pts.length > 1) {
    const p = pts[0];
    fairwayQuads.unshift({ poly: ellipsePoly(p.x, p.y, w, w, 18), color: COLORS.fairwayB });
  }
  const tee = [[-4, -4], [4, -4], [4, 5], [-4, 5]];
  return {
    fairwayQuads,
    tee,
    fringe: ellipsePoly(hole.green.x, hole.green.y, hole.green.r + 2.5, hole.green.r + 2.5, 40),
    green: ellipsePoly(hole.green.x, hole.green.y, hole.green.r, hole.green.r, 40),
    bunkers: hole.bunkers.map((b) => ({
      edge: ellipsePoly(b.x, b.y, b.rx + 0.8, b.ry + 0.8, 24),
      fill: ellipsePoly(b.x, b.y, b.rx, b.ry, 24)
    })),
    water: hole.water.map((b) => ({
      edge: ellipsePoly(b.x, b.y, b.rx + 1, b.ry + 1, 28),
      fill: ellipsePoly(b.x, b.y, b.rx, b.ry, 28)
    }))
  };
}

function ellipsePoly(cx, cy, rx, ry, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

class View {
  constructor(cam, W, H) {
    this.cam = cam;
    this.W = W;
    this.H = H;
    this.f = W * 0.95;
    this.horizon = H * cam.horizon;
    this.sin = Math.sin(cam.heading);
    this.cos = Math.cos(cam.heading);
  }
  toCam(x, y, z = 0) {
    const dx = x - this.cam.x;
    const dy = y - this.cam.y;
    return [dx * this.cos - dy * this.sin, dx * this.sin + dy * this.cos, z - this.cam.z];
  }
  project(c) {
    return [this.W / 2 + (c[0] / c[1]) * this.f, this.horizon - (c[2] / c[1]) * this.f];
  }
  point(x, y, z = 0) {
    const c = this.toCam(x, y, z);
    if (c[1] < NEAR) return null;
    const p = this.project(c);
    return { x: p[0], y: p[1], depth: c[1] };
  }
  polygon(poly) {
    const cam = poly.map(([x, y]) => this.toCam(x, y, 0));
    const clipped = clipNear(cam);
    if (clipped.length < 3) return null;
    return clipped.map((c) => this.project(c));
  }
}

function clipNear(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ain = a[1] >= NEAR;
    const bin = b[1] >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, NEAR, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

function fillPoly(ctx, pts, color) {
  if (!pts) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSky(ctx, view, time) {
  const { W, horizon, cam } = view;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, COLORS.skyTop);
  sky.addColorStop(1, COLORS.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon + 1);

  // Clouds drift with heading for a sense of rotation.
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 6; i++) {
    const base = ((i * 0.37 + time * 0.004 - cam.heading / (Math.PI * 2)) % 1 + 1) % 1;
    const cx = base * W * 1.4 - W * 0.2;
    const cy = horizon * (0.18 + (i % 3) * 0.17);
    const s = W * (0.03 + (i % 2) * 0.015);
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 2.2, s * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s, cy - s * 0.35, s * 1.3, s * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hills: two parallax layers.
  for (const [color, amp, freq, shift] of [
    [COLORS.hillFar, 0.06, 3, 0.7],
    [COLORS.hillNear, 0.035, 5, 1.0]
  ]) {
    ctx.beginPath();
    ctx.moveTo(0, horizon + 1);
    for (let x = 0; x <= W; x += W / 60) {
      const a = (x / W) * Math.PI * 2 * 0.25 + cam.heading * shift;
      const h = (Math.sin(a * freq) * 0.6 + Math.sin(a * freq * 2.3 + 1) * 0.4 + 1) * 0.5;
      ctx.lineTo(x, horizon - h * amp * view.H - 2);
    }
    ctx.lineTo(W, horizon + 1);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawTree(ctx, view, t, p) {
  const scale = view.f / p.depth;
  const h = 10 * t.s * scale;
  const r = 2.8 * t.s * scale;
  if (h < 1.5) {
    ctx.fillStyle = "#2f6b33";
    ctx.fillRect(p.x - 1, p.y - 2, 2, 2);
    return;
  }
  ctx.fillStyle = "#6b4a2b";
  ctx.fillRect(p.x - r * 0.12, p.y - h * 0.35, r * 0.24, h * 0.35);
  ctx.fillStyle = "#2f6b33";
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - h);
  ctx.lineTo(p.x + r, p.y - h * 0.25);
  ctx.lineTo(p.x - r, p.y - h * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3d8240";
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - h);
  ctx.lineTo(p.x + r * 0.8, p.y - h * 0.5);
  ctx.lineTo(p.x - r * 0.15, p.y - h * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawFlag(ctx, view, hole, color) {
  const base = view.point(hole.pin.x, hole.pin.y, 0);
  const top = view.point(hole.pin.x, hole.pin.y, 2.4);
  if (!base || !top) return;
  const scale = view.f / base.depth;
  // cup
  ctx.fillStyle = "#1d2b1a";
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, Math.max(1.5, 0.14 * scale), Math.max(0.8, 0.05 * scale), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f4f4f4";
  ctx.lineWidth = Math.max(1, 0.05 * scale);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
  const fw = Math.max(5, 0.9 * scale);
  const fh = Math.max(3.5, 0.6 * scale);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(top.x + fw, top.y + fh * 0.5);
  ctx.lineTo(top.x, top.y + fh);
  ctx.closePath();
  ctx.fill();
  // Make the pin easy to spot from far away.
  if (scale < 6) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(top.x, top.y + 6, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBall(ctx, view, b) {
  const ground = view.point(b.x, b.y, 0);
  const p = view.point(b.x, b.y, b.z + 0.1);
  if (!ground || !p) return;
  const scale = view.f / p.depth;
  const r = Math.max(b.active ? 3.5 : 2.5, Math.min(0.12 * scale, 14));
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = b.color;
  ctx.lineWidth = Math.max(1.5, r * 0.35);
  ctx.beginPath();
  ctx.arc(p.x, p.y - r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (!b.active && r < 8) {
    // marker so stationary balls of other players stay visible
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r * 2 - 4);
    ctx.lineTo(p.x - 5, p.y - r * 2 - 12);
    ctx.lineTo(p.x + 5, p.y - r * 2 - 12);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGroundLine(ctx, view, pts, color, width, dash) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false;
  for (const [x, y, z] of pts) {
    const p = view.point(x, y, z || 0);
    if (!p) {
      started = false;
      continue;
    }
    if (!started) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
    started = true;
  }
  ctx.stroke();
  ctx.restore();
}

// scene: { hole, geo, cam:{x,y,z,heading,horizon}, balls:[{x,y,z,color,active}], target:{from:{x,y}, to:{x,y}}, trail:[[x,y,z]], flagColor, time }
export function renderScene(ctx, W, H, scene) {
  const view = new View(scene.cam, W, H);
  const { hole, geo } = scene;
  drawSky(ctx, view, scene.time);

  const ground = ctx.createLinearGradient(0, view.horizon, 0, H);
  ground.addColorStop(0, COLORS.roughFar);
  ground.addColorStop(0.25, COLORS.rough);
  ground.addColorStop(1, "#457f32");
  ctx.fillStyle = ground;
  ctx.fillRect(0, view.horizon, W, H - view.horizon);

  for (const q of geo.fairwayQuads) fillPoly(ctx, view.polygon(q.poly), q.color);
  fillPoly(ctx, view.polygon(geo.tee), COLORS.tee);
  for (const wtr of geo.water) {
    fillPoly(ctx, view.polygon(wtr.edge), COLORS.waterEdge);
    fillPoly(ctx, view.polygon(wtr.fill), COLORS.water);
  }
  fillPoly(ctx, view.polygon(geo.fringe), COLORS.fringe);
  fillPoly(ctx, view.polygon(geo.green), COLORS.green);
  for (const b of geo.bunkers) {
    fillPoly(ctx, view.polygon(b.edge), COLORS.sandEdge);
    fillPoly(ctx, view.polygon(b.fill), COLORS.sand);
  }

  // Distance haze near the horizon.
  const haze = ctx.createLinearGradient(0, view.horizon, 0, view.horizon + H * 0.08);
  haze.addColorStop(0, "rgba(207,234,247,0.75)");
  haze.addColorStop(1, "rgba(207,234,247,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, view.horizon, W, H * 0.08);

  // Aim line and landing target.
  if (scene.target) {
    const { from, to, radius } = scene.target;
    const line = [];
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      line.push([from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 0.02]);
    }
    drawGroundLine(ctx, view, line, "rgba(255,255,255,0.55)", 2, [6, 8]);
    const ring = ellipsePoly(to.x, to.y, radius, radius, 32).map(([x, y]) => [x, y, 0.02]);
    ring.push(ring[0]);
    drawGroundLine(ctx, view, ring, "rgba(255,255,255,0.9)", 3);
    const inner = ellipsePoly(to.x, to.y, radius * 0.35, radius * 0.35, 20).map(([x, y]) => [x, y, 0.02]);
    inner.push(inner[0]);
    drawGroundLine(ctx, view, inner, "rgba(255,230,90,0.9)", 2);
  }

  if (scene.trail && scene.trail.length > 1) drawGroundLine(ctx, view, scene.trail, "rgba(255,255,255,0.7)", 2);

  // Depth-sorted sprites.
  const sprites = [];
  for (const t of hole.trees) {
    const p = view.point(t.x, t.y, 0);
    if (p && p.depth < FAR && p.x > -200 && p.x < W + 200) sprites.push({ d: p.depth, draw: () => drawTree(ctx, view, t, p) });
  }
  const pinP = view.point(hole.pin.x, hole.pin.y, 0);
  if (pinP) sprites.push({ d: pinP.depth, draw: () => drawFlag(ctx, view, hole, scene.flagColor || "#e53935") });
  for (const b of scene.balls) {
    const p = view.point(b.x, b.y, 0);
    if (p) sprites.push({ d: p.depth - 0.01, draw: () => drawBall(ctx, view, b) });
  }
  sprites.sort((a, b) => b.d - a.d);
  for (const s of sprites) s.draw();
}

// Top-down overview of the whole hole, rotated so the tee is at the bottom.
export function renderMap(ctx, W, H, scene) {
  const { hole, geo } = scene;
  const ang = Math.atan2(hole.green.x, hole.green.y);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const rot = ([x, y]) => [x * c - y * s, x * s + y * c];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const extend = (pt) => {
    const [x, y] = rot(pt);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  hole.path.forEach((p) => extend([p.x - 30, p.y]));
  hole.path.forEach((p) => extend([p.x + 30, p.y]));
  extend([hole.green.x, hole.green.y + hole.green.r + 15]);
  const pad = 10;
  const k = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY));
  const ox = W / 2 - ((minX + maxX) / 2) * k;
  const oy = H / 2 + ((minY + maxY) / 2) * k;
  const tx = (pt) => {
    const [x, y] = rot(pt);
    return [ox + x * k, oy - y * k];
  };
  const poly = (pts, color) => fillPoly(ctx, pts.map(tx), color);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(40,80,35,0.85)";
  ctx.fillRect(0, 0, W, H);
  for (const q of geo.fairwayQuads) poly(q.poly, COLORS.fairwayA);
  poly(geo.tee, COLORS.tee);
  geo.water.forEach((w) => poly(w.fill, COLORS.water));
  poly(geo.green, COLORS.green);
  geo.bunkers.forEach((b) => poly(b.fill, COLORS.sand));
  ctx.fillStyle = "#2a5c2c";
  for (const t of hole.trees) {
    const [x, y] = tx([t.x, t.y]);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, 2.6 * t.s * k), 0, Math.PI * 2);
    ctx.fill();
  }
  if (scene.target) {
    const [ax, ay] = tx([scene.target.from.x, scene.target.from.y]);
    const [bx, by] = tx([scene.target.to.x, scene.target.to.y]);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(3, scene.target.radius * k), 0, Math.PI * 2);
    ctx.stroke();
  }
  const [px, py] = tx([hole.pin.x, hole.pin.y]);
  ctx.fillStyle = "#e53935";
  ctx.fillRect(px - 1, py - 9, 2, 9);
  ctx.beginPath();
  ctx.moveTo(px + 1, py - 9);
  ctx.lineTo(px + 7, py - 6.5);
  ctx.lineTo(px + 1, py - 4);
  ctx.fill();
  for (const b of scene.balls) {
    const [x, y] = tx([b.x, b.y]);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, b.active ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
