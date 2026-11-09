/**
 * Track builder. The track is a polyline of ground points (metres, y up),
 * assembled from small segment helpers so it's easy to edit the layout.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Track {
  points: Pt[];
  startX: number;
  finishX: number;
  /** Signs drawn along the track for flavour. */
  signs: { x: number; text: string }[];
}

class Builder {
  points: Pt[] = [];
  signs: { x: number; text: string }[] = [];
  private x = 0;
  private y = 0;
  private readonly step = 0.5;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.points.push({ x, y });
  }

  get pos() {
    return { x: this.x, y: this.y };
  }

  /** Follow a curve f(t) (t in 0..1) returning a height offset, over `len` metres. */
  private curve(len: number, f: (t: number) => number) {
    const x0 = this.x;
    const y0 = this.y;
    const n = Math.max(1, Math.round(len / this.step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.points.push({ x: x0 + len * t, y: y0 + f(t) });
    }
    this.x = x0 + len;
    this.y = y0 + f(1);
    return this;
  }

  flat(len: number) {
    return this.curve(len, () => 0);
  }

  /** Smooth slope (ease in/out) rising by dy (negative = descent). */
  slope(len: number, dy: number) {
    return this.curve(len, (t) => dy * (0.5 - 0.5 * Math.cos(Math.PI * t)));
  }

  /** Straight line, for kickers / sharp edges. */
  line(len: number, dy: number) {
    return this.curve(len, (t) => dy * t);
  }

  /** Rolling bumps (whoops). */
  bumps(count: number, width: number, height: number) {
    return this.curve(count * width, (t) => height * 0.5 * (1 - Math.cos(2 * Math.PI * count * t)));
  }

  /** Kicker: ramp up, then a sharp lip and drop back down. */
  kicker(len: number, height: number, dropLen = 1.5) {
    this.curve(len, (t) => height * t * t);
    return this.line(dropLen, -height);
  }

  /** Tabletop jump: ramp up, flat top, landing slope. */
  tabletop(up: number, top: number, down: number, height: number) {
    this.slope(up, height).flat(top);
    return this.slope(down, -height);
  }

  /** Step-down: a drop-off with a landing ramp. */
  drop(height: number, landing: number) {
    this.line(0.6, -height * 0.6);
    return this.slope(landing, -height * 0.4);
  }

  sign(text: string) {
    this.signs.push({ x: this.x, text });
    return this;
  }
}

export function buildTrack(): Track {
  const b = new Builder(-20, 0);
  const startX = 0;

  b.flat(32) // start straight
    .sign("Warm-up")
    .bumps(3, 4, 0.35)
    .flat(10)
    .slope(14, 3)
    .flat(6)
    .slope(14, -3)
    .flat(10)
    .sign("First jump")
    .kicker(8, 1.6)
    .flat(18)
    .sign("Whoops!")
    .bumps(6, 3, 0.55)
    .flat(10)
    .sign("Big hill")
    .slope(22, 7)
    .flat(5)
    .drop(3, 8)
    .slope(18, -4)
    .flat(12)
    .sign("Tabletop")
    .tabletop(9, 6, 12, 2.2)
    .flat(12)
    .kicker(7, 1.4)
    .flat(5)
    .kicker(7, 1.8)
    .flat(16)
    .sign("Rollercoaster")
    .bumps(4, 7, 1.6)
    .flat(10)
    .slope(16, 4)
    .flat(3)
    .slope(10, -5)
    .flat(14)
    .sign("Almost there…")
    .kicker(9, 2.2)
    .flat(10)
    .bumps(5, 3.2, 0.7)
    .flat(10);

  const finishX = b.pos.x;
  b.sign("FINISH").flat(60); // run-out after the finish line

  return { points: b.points, startX, finishX, signs: b.signs };
}

/** Ground height at x (linear interpolation), used for rendering & checks. */
export function groundY(track: Track, x: number): number {
  const pts = track.points;
  if (x <= pts[0].x) return pts[0].y;
  // Binary search for the segment.
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const c = pts[hi];
  if (c.x === a.x) return a.y;
  return a.y + ((x - a.x) / (c.x - a.x)) * (c.y - a.y);
}
