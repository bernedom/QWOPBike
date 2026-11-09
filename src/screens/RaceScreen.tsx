import { useEffect, useRef, useState } from "react";
import { EngineSound, playCrash, playHappyBirthday } from "../audio";
import {
  bikeIssues,
  damageBike,
  isWrecked,
  PART_INFO,
  PARTS,
  verdict,
  type Bike,
  type CrashDamage,
} from "../bike";
import { RaceRenderer } from "../race/render";
import { DT, RaceSim, type CrashReason, type RaceInput } from "../race/sim";

interface Props {
  bike: Bike;
  attempt: number;
  /** Called after a crash with the (now damaged) bike. */
  onCrash: (distance: number, damage: CrashDamage) => void;
  onFinish: (time: number) => void;
  onRetry: () => void;
  onRebuild: () => void;
  onMenu: () => void;
}

type Phase = "countdown" | "racing" | "crashed" | "finished";

const KEYS: Record<string, keyof RaceInput> = {
  KeyQ: "throttle",
  KeyW: "brake",
  KeyO: "leanBack",
  KeyP: "leanForward",
};

const BUTTONS: { key: string; field: keyof RaceInput; label: string; side: "left" | "right" }[] = [
  { key: "Q", field: "throttle", label: "gas", side: "left" },
  { key: "W", field: "brake", label: "brake", side: "left" },
  { key: "O", field: "leanBack", label: "lean back", side: "right" },
  { key: "P", field: "leanForward", label: "lean fwd", side: "right" },
];

const CRASH_LINES: Record<CrashReason, string[]> = {
  head: [
    "Faceplant!",
    "Helmet tested. It works.",
    "That's not how you dismount.",
    "The dirt says hi.",
  ],
  flipped: ["Upside down!", "Backflip: not landed.", "Wrong side up.", "Gravity 1, you 0."],
  fell: ["Where did the ground go?", "Into the void…"],
};

const COUNTDOWN = 2.4;

export function RaceScreen({ bike: bikeProp, attempt, onCrash, onFinish, onRetry, onRebuild, onMenu }: Props) {
  // The bike this run started with. The parent swaps in the damaged bike after
  // a crash; that must not restart the running race.
  const [bike] = useState(bikeProp);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const input = useRef<RaceInput>({ throttle: false, brake: false, leanBack: false, leanForward: false });
  const [phase, setPhase] = useState<Phase>("countdown");
  const [result, setResult] = useState<{
    line: string;
    distance: number;
    time: number;
    damage?: CrashDamage;
  } | null>(null);
  const wrecked = result?.damage ? isWrecked(result.damage.bike) : false;

  // Callbacks change identity every render; keep the latest in a ref for the game loop.
  const cb = useRef({ onCrash, onFinish });
  cb.current = { onCrash, onFinish };

  // ---- Game loop ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const sim = new RaceSim(bike.stats);
    const renderer = new RaceRenderer(sim);
    const engine = new EngineSound();
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let countdown = COUNTDOWN;
    let endTimer = 0;
    let reported = false;
    let damage: CrashDamage | null = null;
    let ended = false;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      let overlay: string | undefined;

      if (countdown > 0) {
        countdown -= dt;
        overlay = countdown > 0 ? String(Math.ceil(countdown / (COUNTDOWN / 3))) : undefined;
        if (countdown <= 0) setPhase("racing");
      } else {
        acc += dt;
        while (acc >= DT) {
          sim.step(input.current);
          acc -= DT;
        }
        if (sim.status !== "racing") {
          if (!ended) {
            // First frame after the run ended.
            ended = true;
            if (sim.status === "crashed") {
              damage = damageBike(bike);
              renderer.breakOff(damage.part);
              playCrash();
            } else {
              playHappyBirthday();
            }
          }
          endTimer += dt;
          if (sim.status === "finished") overlay = "🏁";
          if (!reported && endTimer > (sim.status === "crashed" ? 1.2 : 0.6)) {
            reported = true;
            if (sim.status === "crashed") {
              const lines = CRASH_LINES[sim.crashReason ?? "head"];
              setResult({
                line: lines[Math.floor(Math.random() * lines.length)],
                distance: sim.distance,
                time: sim.time,
                damage: damage!,
              });
              setPhase("crashed");
              cb.current.onCrash(sim.distance, damage!);
            } else {
              setResult({ line: "You made it!", distance: sim.trackLength, time: sim.time });
              setPhase("finished");
              cb.current.onFinish(sim.time);
            }
          }
        }
      }

      if (sim.status === "racing") {
        engine.update({
          throttle: sim.throttle,
          rpm: Math.abs(sim.rearWheel.getAngularVelocity()) / sim.stats.maxWheelSpeed,
          sputtering: sim.sputtering,
          running: sim.engineRunning,
          kicks: sim.kicks,
        });
      } else {
        engine.stop();
      }

      renderer.draw(ctx, canvas.clientWidth, canvas.clientHeight, dt, overlay);
      // Light up pressed keys without re-rendering React.
      for (const b of BUTTONS) {
        buttonsRef.current[b.key]?.classList.toggle("active", input.current[b.field]);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      engine.stop();
      window.removeEventListener("resize", resize);
    };
  }, [bike]);

  // ---- Keyboard ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const field = KEYS[e.code];
      if (field) {
        input.current[field] = true;
        e.preventDefault();
        return;
      }
      if (phase === "crashed" || phase === "finished") {
        const go = e.code === "Space" || e.code === "KeyR" || e.code === "Enter";
        if (phase === "crashed" && go) (wrecked ? onRebuild : onRetry)();
        if (phase === "crashed" && e.code === "KeyB") onRebuild();
      }
      if (e.code === "Escape") onMenu();
    };
    const up = (e: KeyboardEvent) => {
      const field = KEYS[e.code];
      if (field) input.current[field] = false;
    };
    const blur = () => {
      for (const k of Object.keys(input.current) as (keyof RaceInput)[]) input.current[k] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [phase, wrecked, onRetry, onRebuild, onMenu]);

  const touch = (field: keyof RaceInput, on: boolean) => (e: React.PointerEvent) => {
    e.preventDefault();
    input.current[field] = on;
  };

  return (
    <div className="race">
      <canvas ref={canvasRef} className="race-canvas" />

      <div className="race-topbar">
        <span>
          Attempt #{attempt} · Bike {bike.grade}
        </span>
        <button className="ghost" onClick={onMenu}>
          Menu
        </button>
      </div>

      <BikePanel bike={bike} />

      {(["left", "right"] as const).map((side) => (
        <div key={side} className={`pad pad-${side}`}>
          {BUTTONS.filter((b) => b.side === side).map((b) => (
            <button
              key={b.key}
              ref={(el) => {
                buttonsRef.current[b.key] = el;
              }}
              className="key"
              onPointerDown={touch(b.field, true)}
              onPointerUp={touch(b.field, false)}
              onPointerLeave={touch(b.field, false)}
              onPointerCancel={touch(b.field, false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="key-letter">{b.key}</span>
              <span className="key-label">{b.label}</span>
            </button>
          ))}
        </div>
      ))}

      {phase === "crashed" && result && (
        <div className="overlay">
          <div className="card">
            <h2>{result.line}</h2>
            <p>
              You made it <b>{result.distance.toFixed(0)} m</b> in {result.time.toFixed(1)} s.
            </p>
            {result.damage?.part && (
              <p className="damage">
                💥 Your <b>{PART_INFO[result.damage.part].name.toLowerCase()}</b> came loose:{" "}
                {verdict(result.damage.before)} → <span className="warn">{verdict(result.damage.after)}</span>
              </p>
            )}
            {wrecked ? (
              <>
                <p className="warn">Your bike is completely wrecked. Time to build a new one!</p>
                <div className="row">
                  <button className="primary" onClick={onRebuild}>
                    Build a new bike <kbd>Space</kbd>
                  </button>
                </div>
              </>
            ) : (
              <div className="row">
                <button className="primary" onClick={onRetry}>
                  Ride again <kbd>Space</kbd>
                </button>
                <button onClick={onRebuild}>
                  Build a new bike <kbd>B</kbd>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Top-right overlay: part condition + the bike's quirks. */
function BikePanel({ bike }: { bike: Bike }) {
  const issues = bikeIssues(bike.stats);
  return (
    <div className="bike-panel">
      <div className="bike-panel-head">
        Bike <span className={`grade-${bike.grade}`}>{bike.grade}</span>
      </div>
      {PARTS.map((p) => {
        const s = bike.scores[p];
        return (
          <div key={p} className="bike-panel-row">
            <span>{PART_INFO[p].name}</span>
            <div className="meter">
              <div style={{ width: `${Math.max(3, s * 100)}%` }} />
            </div>
          </div>
        );
      })}
      {issues.length > 0 && (
        <ul className="bike-panel-issues">
          {issues.map((i) => (
            <li key={i}>⚠ {i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
