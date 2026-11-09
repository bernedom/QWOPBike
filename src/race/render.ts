/**
 * Canvas renderer for the race. Purely visual: reads the sim, never changes it.
 */
import type { Body } from "planck";
import type { PartId } from "../bike";
import { type RaceSim, WHEEL_RADIUS } from "./sim";
import { groundY } from "./track";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

type DebrisKind = "wheel" | "engine" | "link" | "spring" | "bar" | "bolt";

/** A loose piece of bike flying off after a crash (simple ballistic + bounce). */
interface Debris {
  kind: DebrisKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  /** Collision radius above the ground. */
  r: number;
  smoke: boolean;
}

const C = {
  skyTop: "#5aa9e6",
  skyBottom: "#cfe9ff",
  hillFar: "#a7c7a0",
  hillNear: "#7fae76",
  dirt: "#8a5a35",
  dirtDark: "#6b4426",
  dirtTop: "#b07845",
  frame: "#ff7a1a",
  frameDark: "#c25200",
  tyre: "#1d1d1f",
  rim: "#b9bec7",
  rider: "#2e4fd1", // trousers
  coat: "#141414",
  coatEdge: "#3a3a3a",
  hair: "#f2d16b",
  hairDark: "#c9a443",
  helmet: "#e8e8e8",
  visor: "#222",
  skin: "#f2c39b",
};

export class RaceRenderer {
  private particles: Particle[] = [];
  private debris: Debris[] = [];
  /** The part that broke off in this run's crash; it's no longer drawn on the bike. */
  private lost: PartId | null = null;
  private shake = 0;
  private camX = 0;
  private camY = 0;
  private sim: RaceSim;

  constructor(sim: RaceSim) {
    this.sim = sim;
    const p = sim.chassis.getPosition();
    this.camX = p.x + 3;
    this.camY = p.y;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number, overlay?: string) {
    const sim = this.sim;
    // Zoom: ~9.5 m visible vertically, at least 15 m horizontally.
    const scale = Math.min(h / 9.5, w / 15);
    const p = sim.chassis.getPosition();
    const v = sim.chassis.getLinearVelocity();
    // Smooth camera with a little look-ahead.
    const tx = p.x + 3 + Math.max(-2, Math.min(4, v.x * 0.25));
    const ty = p.y + 0.8;
    const k = 1 - Math.exp(-dt * 4);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;

    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * this.shake * scale * 0.5;
    const sy = (Math.random() - 0.5) * this.shake * scale * 0.5;
    const toScreen = (x: number, y: number): [number, number] => [
      w / 2 + (x - this.camX) * scale + sx,
      h * 0.58 - (y - this.camY) * scale + sy,
    ];

    this.drawSky(ctx, w, h);
    this.drawHills(ctx, w, h);

    const viewHalf = w / 2 / scale + 2;
    this.drawGround(ctx, toScreen, scale, this.camX - viewHalf, this.camX + viewHalf, h);
    this.drawSigns(ctx, toScreen, scale, this.camX - viewHalf, this.camX + viewHalf);
    this.drawFinish(ctx, toScreen, scale);

    this.updateParticles(dt);
    this.updateDebris(dt);
    this.drawParticles(ctx, toScreen, scale);
    this.drawBike(ctx, toScreen, scale);
    this.drawDebris(ctx, toScreen, scale);

    this.drawHud(ctx, w, h);
    if (overlay) this.drawBigText(ctx, w, h, overlay);
  }

  // ---------- background ----------

  private drawSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(1, C.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawHills(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const layers = [
      { color: C.hillFar, parallax: 0.1, base: 0.55, amp: 0.08, freq: 0.004 },
      { color: C.hillNear, parallax: 0.25, base: 0.65, amp: 0.06, freq: 0.007 },
    ];
    for (const l of layers) {
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let sx = 0; sx <= w + 10; sx += 10) {
        const wx = sx + this.camX * 40 * l.parallax;
        const y =
          h * l.base -
          h * l.amp * (Math.sin(wx * l.freq) + 0.5 * Math.sin(wx * l.freq * 2.7 + 1.3));
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawGround(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, y: number) => [number, number],
    scale: number,
    x0: number,
    x1: number,
    h: number,
  ) {
    const pts = this.sim.track.points.filter((p) => p.x >= x0 - 1 && p.x <= x1 + 1);
    if (pts.length < 2) return;
    ctx.beginPath();
    const [fx] = toScreen(pts[0].x, pts[0].y);
    ctx.moveTo(fx, h + 10);
    for (const p of pts) ctx.lineTo(...toScreen(p.x, p.y));
    const [lx] = toScreen(pts[pts.length - 1].x, 0);
    ctx.lineTo(lx, h + 10);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, toScreen(0, this.camY)[1], 0, h);
    g.addColorStop(0, C.dirt);
    g.addColorStop(1, C.dirtDark);
    ctx.fillStyle = g;
    ctx.fill();

    // Top crust
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...toScreen(p.x, p.y)) : ctx.moveTo(...toScreen(p.x, p.y))));
    ctx.strokeStyle = C.dirtTop;
    ctx.lineWidth = Math.max(3, scale * 0.15);
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  private drawSigns(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, y: number) => [number, number],
    scale: number,
    x0: number,
    x1: number,
  ) {
    for (const s of this.sim.track.signs) {
      if (s.x < x0 || s.x > x1 || s.text === "FINISH") continue;
      const gy = groundY(this.sim.track, s.x);
      const [bx, by] = toScreen(s.x, gy);
      const postH = scale * 1.6;
      ctx.fillStyle = "#5b3b1f";
      ctx.fillRect(bx - scale * 0.05, by - postH, scale * 0.1, postH);
      ctx.font = `bold ${Math.round(scale * 0.32)}px system-ui, sans-serif`;
      const tw = ctx.measureText(s.text).width + scale * 0.4;
      ctx.fillStyle = "#fff6d6";
      ctx.strokeStyle = "#5b3b1f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bx - tw / 2, by - postH - scale * 0.55, tw, scale * 0.55, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#3a2410";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.text, bx, by - postH - scale * 0.27);
    }
  }

  private drawFinish(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, y: number) => [number, number],
    scale: number,
  ) {
    const fx = this.sim.track.finishX;
    const gy = groundY(this.sim.track, fx);
    const [x, y] = toScreen(fx, gy);
    const poleH = scale * 3.2;
    ctx.fillStyle = "#333";
    ctx.fillRect(x - scale * 0.06, y - poleH, scale * 0.12, poleH);
    // Checkered flag
    const cell = scale * 0.22;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 6; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#111" : "#fff";
        ctx.fillRect(x + c * cell, y - poleH + r * cell, cell, cell);
      }
    // Checkered stripe on the ground
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? "#111" : "#fff";
      ctx.fillRect(x - scale * 0.15, y + i * scale * 0.12, scale * 0.3, scale * 0.12);
    }
  }

  // ---------- bike ----------

  private drawBike(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, y: number) => [number, number],
    scale: number,
  ) {
    const sim = this.sim;
    const ch = sim.chassis;
    const local = (lx: number, ly: number) => {
      const wp = ch.getWorldPoint({ x: lx, y: ly });
      return toScreen(wp.x, wp.y);
    };
    const line = (a: [number, number], b: [number, number], width: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.stroke();
    };

    const rear = sim.rearWheel.getPosition();
    const front = sim.frontWheel.getPosition();

    // Swingarm & fork (drawn under the frame)
    line(local(-0.15, -0.05), toScreen(rear.x, rear.y), scale * 0.09, "#555");
    if (this.lost !== "suspension" && this.lost !== "wheels") {
      line(local(0.62, 0.3), toScreen(front.x, front.y), scale * 0.08, "#888");
    }

    this.drawWheel(ctx, sim.rearWheel, toScreen, scale);
    if (this.lost !== "wheels") this.drawWheel(ctx, sim.frontWheel, toScreen, scale);

    // Frame body
    ctx.fillStyle = C.frame;
    ctx.strokeStyle = C.frameDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const body: [number, number][] = [
      [-0.85, 0.32],
      [-0.4, 0.25],
      [0.2, 0.3],
      [0.55, 0.38],
      [0.5, 0.05],
      [0.1, -0.12],
      [-0.45, -0.08],
    ];
    body.forEach(([x, y], i) => (i ? ctx.lineTo(...local(x, y)) : ctx.moveTo(...local(x, y))));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Engine block
    if (this.lost !== "engine") {
      ctx.fillStyle = "#3b3b3b";
      ctx.beginPath();
      [
        [-0.1, 0.12],
        [0.3, 0.14],
        [0.25, -0.12],
        [-0.08, -0.1],
      ].forEach(([x, y], i) => (i ? ctx.lineTo(...local(x, y)) : ctx.moveTo(...local(x, y))));
      ctx.closePath();
      ctx.fill();
    }
    // Seat
    line(local(-0.7, 0.36), local(0.05, 0.36), scale * 0.1, "#222");
    // Handlebar
    if (this.lost !== "handlebar") line(local(0.58, 0.38), local(0.5, 0.58), scale * 0.05, "#333");

    // Rider (posture follows the lean input)
    const lean = sim.lean * 0.12;
    const hip = local(-0.2, 0.45);
    const shoulder = local(-0.02 - lean, 0.88);
    const head = local(0.04 - lean * 1.2, 1.08);
    // Without a handlebar the rider flails instead of holding on.
    const hand = this.lost === "handlebar" ? local(0.35, 1.0 + Math.sin(sim.time * 20) * 0.1) : local(0.5, 0.58);
    const knee = local(0.22, 0.55);
    const foot = local(0.05, 0.05);
    const limb = scale * 0.11;
    line(hip, knee, limb, C.rider);
    line(knee, foot, limb, C.rider);
    // Black coat: torso with a tail flapping over the seat, plus sleeves.
    // A slightly lighter edge keeps it readable against dark backgrounds.
    const coatTail = local(-0.42, 0.38 + Math.sin(sim.time * 14) * 0.03 * sim.throttle);
    line(hip, coatTail, scale * 0.13, C.coatEdge);
    line(hip, shoulder, scale * 0.24, C.coatEdge);
    line(hip, coatTail, scale * 0.09, C.coat);
    line(hip, shoulder, scale * 0.2, C.coat);
    const elbow: [number, number] = [
      (shoulder[0] + hand[0]) / 2,
      (shoulder[1] + hand[1]) / 2 + scale * 0.06,
    ];
    line(shoulder, elbow, scale * 0.11, C.coatEdge);
    line(elbow, hand, scale * 0.11, C.coatEdge);
    line(shoulder, elbow, scale * 0.08, C.coat);
    line(elbow, hand, scale * 0.08, C.coat);
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.arc(hand[0], hand[1], scale * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // Blond hair sticking out the back of the helmet, blowing in the wind.
    const flutter = Math.sin(sim.time * 18) * 0.03;
    for (const [dy, len, w, col] of [
      [-0.02, 0.26, 0.07, C.hairDark],
      [0.03, 0.3, 0.06, C.hair],
      [-0.07, 0.22, 0.05, C.hair],
    ] as const) {
      line(
        local(-0.06 - lean * 1.2, 1.05 + dy),
        local(-0.06 - lean * 1.2 - len, 1.0 + dy + flutter * (1 + dy * 10)),
        scale * w,
        col,
      );
    }
    // Helmet
    ctx.fillStyle = C.helmet;
    ctx.strokeStyle = "#999";
    ctx.beginPath();
    ctx.arc(head[0], head[1], scale * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.visor;
    const visor = local(0.14 - lean * 1.2, 1.09);
    ctx.beginPath();
    ctx.arc(visor[0], visor[1], scale * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Exhaust & dirt particles
    if (sim.status === "racing") {
      const ex = ch.getWorldPoint({ x: -0.8, y: 0.15 });
      if (sim.sputtering && Math.random() < 0.5) {
        this.emit(ex.x, ex.y, -1.5, 0.6, "#222", 0.18, 0.8);
      } else if (sim.throttle > 0.3 && Math.random() < sim.throttle * 0.6) {
        this.emit(ex.x, ex.y, -1, 0.4, "rgba(200,200,200,0.8)", 0.1, 0.5);
      }
      const rp = sim.rearWheel.getPosition();
      if (sim.throttle > 0.4 && groundY(sim.track, rp.x) > rp.y - WHEEL_RADIUS - 0.08 && Math.random() < 0.7) {
        this.emit(rp.x - 0.3, rp.y - WHEEL_RADIUS + 0.05, -3 - Math.random() * 2, 1.5, C.dirtTop, 0.07, 0.6);
      }
    }
  }

  private drawWheel(
    ctx: CanvasRenderingContext2D,
    wheel: Body,
    toScreen: (x: number, y: number) => [number, number],
    scale: number,
  ) {
    const p = wheel.getPosition();
    const [x, y] = toScreen(p.x, p.y);
    const r = WHEEL_RADIUS * scale;
    ctx.fillStyle = C.tyre;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // Knobbly tread
    const a0 = -wheel.getAngle();
    ctx.fillStyle = "#2c2c2f";
    for (let i = 0; i < 14; i++) {
      const a = a0 + (i / 14) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = C.rim;
    ctx.lineWidth = Math.max(1, scale * 0.03);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = a0 + (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
      ctx.stroke();
    }
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- crash debris ----------

  /** Crash effect: `part` flies off the bike, together with bolts, sparks and dirt. */
  breakOff(part: PartId | null) {
    const sim = this.sim;
    const ch = sim.chassis;
    const v = ch.getLinearVelocity();
    const at = (lx: number, ly: number) => ch.getWorldPoint({ x: lx, y: ly });
    const fling = (kind: DebrisKind, p: { x: number; y: number }, r: number, smoke = false, power = 1) => {
      this.debris.push({
        kind,
        x: p.x,
        y: p.y,
        vx: v.x * 0.6 + (Math.random() - 0.3) * 5 * power,
        vy: 3 + Math.random() * 4 * power,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 18,
        r,
        smoke,
      });
    };

    this.lost = part;
    this.shake = 1;
    switch (part) {
      case "wheels":
        fling("wheel", sim.frontWheel.getPosition(), WHEEL_RADIUS);
        break;
      case "engine":
        fling("engine", at(0.1, 0), 0.15, true);
        break;
      case "chain":
        for (let i = 0; i < 9; i++) fling("link", at(-0.6 + i * 0.08, 0.05), 0.03, false, 1.4);
        break;
      case "suspension":
        fling("spring", at(0.65, 0.15), 0.1);
        fling("spring", at(-0.3, 0), 0.1);
        break;
      case "handlebar":
        fling("bar", at(0.55, 0.5), 0.06);
        break;
    }
    for (let i = 0; i < 6; i++) fling("bolt", at((Math.random() - 0.5) * 1.2, 0.1), 0.03, false, 1.5);

    const c = at(0, 0);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      this.emit(c.x, c.y, Math.cos(a) * sp, Math.abs(Math.sin(a)) * sp, i % 3 ? "#ffd23f" : "#ff7a1a", 0.04, 0.5);
    }
    for (let i = 0; i < 18; i++) {
      this.emit(c.x, c.y - 0.3, (Math.random() - 0.5) * 6, Math.random() * 2.5, C.dirtTop, 0.12, 1.1);
    }
  }

  private updateDebris(dt: number) {
    const track = this.sim.track;
    for (const d of this.debris) {
      d.vy -= 10 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.angle += d.spin * dt;
      const g = groundY(track, d.x);
      if (d.y - d.r < g) {
        d.y = g + d.r;
        if (d.vy < 0) d.vy = Math.abs(d.vy) < 1 ? 0 : -d.vy * 0.4;
        d.vx *= 0.8;
        d.spin *= 0.7;
        if (d.kind === "wheel") d.spin = -d.vx / d.r; // roll
      }
      if (d.smoke && Math.random() < 0.4) this.emit(d.x, d.y, -0.3, 1.2, "#333", 0.15, 1.2);
    }
    // Hard cap so a long wait after a crash doesn't pile up.
    if (this.debris.length > 80) this.debris.splice(0, this.debris.length - 80);
  }

  private drawDebris(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, y: number) => [number, number],
    scale: number,
  ) {
    for (const d of this.debris) {
      const [x, y] = toScreen(d.x, d.y);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-d.angle);
      const u = scale;
      switch (d.kind) {
        case "wheel": {
          const r = WHEEL_RADIUS * u;
          ctx.fillStyle = C.tyre;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = C.rim;
          ctx.lineWidth = Math.max(1, u * 0.03);
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
          }
          ctx.stroke();
          break;
        }
        case "engine":
          ctx.fillStyle = "#3b3b3b";
          ctx.fillRect(-0.2 * u, -0.13 * u, 0.4 * u, 0.26 * u);
          ctx.fillStyle = "#555";
          for (let i = 0; i < 4; i++) ctx.fillRect((-0.17 + i * 0.09) * u, -0.2 * u, 0.05 * u, 0.08 * u);
          break;
        case "link":
          ctx.strokeStyle = "#777";
          ctx.lineWidth = Math.max(1, u * 0.02);
          ctx.beginPath();
          ctx.ellipse(0, 0, 0.05 * u, 0.025 * u, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "spring": {
          ctx.strokeStyle = "#e8c340";
          ctx.lineWidth = Math.max(1.5, u * 0.03);
          ctx.beginPath();
          for (let i = 0; i <= 8; i++) {
            const px = (-0.18 + i * 0.045) * u;
            const py = (i % 2 ? 0.06 : -0.06) * u;
            if (i) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          }
          ctx.stroke();
          break;
        }
        case "bar":
          ctx.strokeStyle = "#333";
          ctx.lineCap = "round";
          ctx.lineWidth = u * 0.05;
          ctx.beginPath();
          ctx.moveTo(-0.25 * u, 0);
          ctx.lineTo(0.25 * u, 0);
          ctx.stroke();
          ctx.strokeStyle = "#111";
          ctx.lineWidth = u * 0.08;
          ctx.beginPath();
          ctx.moveTo(-0.25 * u, 0);
          ctx.lineTo(-0.17 * u, 0);
          ctx.moveTo(0.17 * u, 0);
          ctx.lineTo(0.25 * u, 0);
          ctx.stroke();
          break;
        case "bolt":
          ctx.fillStyle = "#aaa";
          ctx.fillRect(-0.03 * u, -0.03 * u, 0.06 * u, 0.06 * u);
          break;
      }
      ctx.restore();
    }
  }

  // ---------- particles ----------

  private emit(x: number, y: number, vx: number, vy: number, color: string, size: number, life: number) {
    if (this.particles.length > 300) return;
    this.particles.push({
      x,
      y,
      vx: vx + (Math.random() - 0.5),
      vy: vy + Math.random() * 0.5,
      life,
      max: life,
      size,
      color,
    });
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 3 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private drawParticles(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, y: number) => [number, number],
    scale: number,
  ) {
    for (const p of this.particles) {
      const [x, y] = toScreen(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.size * scale * (1.5 - p.life / p.max), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- HUD ----------

  private drawHud(ctx: CanvasRenderingContext2D, w: number, _h: number) {
    const sim = this.sim;
    const pad = 16;
    const barW = Math.min(420, w - pad * 2);
    const bx = (w - barW) / 2;
    const progress = Math.min(1, sim.distance / sim.trackLength);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.roundRect(bx, pad, barW, 12, 6);
    ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.roundRect(bx, pad, Math.max(12, barW * progress), 12, 6);
    ctx.fill();
    ctx.font = "16px system-ui";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText("🎁", bx + barW + 4 + 16, pad + 6);

    ctx.font = "bold 18px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 4;
    ctx.fillText(`${sim.time.toFixed(1)} s`, pad, pad + 22);
    ctx.fillText(`${sim.distance.toFixed(0)} / ${sim.trackLength.toFixed(0)} m`, pad, pad + 44);
    ctx.textAlign = "right";
    ctx.fillText(`${(sim.speed * 3.6).toFixed(0)} km/h`, w - pad, pad + 22);
    if (sim.sputtering) {
      ctx.fillStyle = "#ff5b5b";
      ctx.fillText("*sputter*", w - pad, pad + 44);
    }
    ctx.shadowBlur = 0;
  }

  private drawBigText(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
    ctx.font = `900 ${Math.round(Math.min(w, h) * 0.2)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#1b1b1b";
    ctx.strokeText(text, w / 2, h * 0.4);
    ctx.fillStyle = "#ffd23f";
    ctx.fillText(text, w / 2, h * 0.4);
  }
}
