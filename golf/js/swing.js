// Turns raw phone motion into a golf swing: { power, face }.
//
// Power: peak angular speed during the downswing (gyroscope), relative to a "full swing" speed.
// Face:  how far the phone has twisted around its long axis (gyro gamma, integrated) at the moment of
//        peak speed, relative to where it was when you pressed the button. Twist = open/closed club face.
//
// The backswing and downswing rotate in opposite directions, so we learn the backswing direction from the
// first movement and then only count speed in the opposite direction as the real swing.

export class SwingDetector {
  constructor({ onSwing, onLevel }) {
    this.onSwing = onSwing;
    this.onLevel = onLevel;
    this.full = 1100; // deg/s that counts as 100% power
    this.flip = false;
    this.state = "idle";
  }

  arm() {
    this.state = "ready";
    this.face = 0;
    this.lastT = null;
    this.u = null;
    this.backPeak = 0;
    this.downPeak = 0;
    this.faceAtPeak = 0;
    this.tPeak = 0;
    this.accelPeak = 0;
  }

  disarm() {
    this.state = "idle";
  }

  get armed() {
    return this.state !== "idle" && this.state !== "done";
  }

  // rr: { alpha, beta, gamma } in deg/s. t: ms timestamp.
  feed(rr, t) {
    if (!this.armed) return;
    const dt = this.lastT === null ? 0 : Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    const v = [rr.alpha || 0, rr.beta || 0, rr.gamma || 0];
    const mag = Math.hypot(v[0], v[1], v[2]);
    this.face += (rr.gamma || 0) * dt;
    const start = this.full * 0.12;

    if (this.state === "ready") {
      this.onLevel?.(0);
      if (mag > start) {
        this.u = v.map((x) => x / mag);
        this.state = "back";
        this.backPeak = mag;
        this.faceAtBackPeak = this.face;
        this.tStart = t;
      }
      return;
    }

    const s = v[0] * this.u[0] + v[1] * this.u[1] + v[2] * this.u[2];

    if (this.state === "back") {
      if (s > this.backPeak) {
        this.backPeak = s;
        this.faceAtBackPeak = this.face;
      }
      if (s < -start) {
        this.state = "down";
        this.downPeak = -s;
        this.faceAtPeak = this.face;
        this.tPeak = t;
      } else if (this.backPeak > this.full * 0.9 && s < this.backPeak * 0.3) {
        // One fast motion with no backswing (or the phone was already at the top): treat it as the swing.
        this.finish(this.backPeak, this.faceAtBackPeak);
      } else if (t - this.tStart > 6000) {
        this.arm();
      }
      return;
    }

    if (this.state === "down") {
      const d = -s;
      if (d > this.downPeak) {
        this.downPeak = d;
        this.faceAtPeak = this.face;
        this.tPeak = t;
      }
      this.onLevel?.(this.downPeak / this.full);
      if ((d < this.downPeak * 0.35 && t - this.tPeak > 40) || t - this.tPeak > 500) {
        this.finish(this.downPeak, this.faceAtPeak);
      }
    }
  }

  // Fallback for devices without a gyroscope: use linear acceleration (m/s^2, gravity removed).
  feedAccel(acc, t) {
    if (!this.armed) return;
    const mag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
    const full = (this.full / 1100) * 45;
    if (mag > this.accelPeak) {
      this.accelPeak = mag;
      this.tPeak = t;
    }
    this.onLevel?.(this.accelPeak / full);
    if (this.accelPeak > full * 0.15 && mag < this.accelPeak * 0.3 && t - this.tPeak > 60) {
      this.finish((this.accelPeak / full) * this.full, 0);
    }
  }

  finish(peak, face) {
    this.state = "done";
    const f = (this.flip ? -1 : 1) * face;
    this.onSwing?.({ power: Math.min(1.2, peak / this.full), face: Math.max(-45, Math.min(45, f)) });
  }
}
