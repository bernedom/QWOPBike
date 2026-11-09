import { useEffect, useRef, useState } from "react";
import {
  buildBike,
  HANDLEBAR_SWAP_THRESHOLD,
  isWrecked,
  PART_INFO,
  PARTS,
  verdict,
  type Bike,
  type PartId,
  type PartScores,
} from "../bike";
import { BikeDiagram } from "./BikeDiagram";

/**
 * Assembly mini-game v1: "Torque wrench".
 * For every part a needle sweeps across a gauge; stop it in the green zone.
 * The green zone drifts back and forth and breathes (grows/shrinks), and each
 * part gets faster, with a narrower, livelier zone. The score per part feeds the
 * bike's handling (see bike.ts).
 */

interface Props {
  onBuilt: (bike: Bike) => void;
  onRide: () => void;
  onMenu: () => void;
}

interface Level {
  /** Needle sweep speed. */
  speed: number;
  /** Average zone width (fraction of the gauge). */
  zone: number;
  /** How fast the zone drifts sideways. */
  drift: number;
  /** How fast the zone grows/shrinks, and by how much (fraction of `zone`). */
  pulse: number;
  pulseAmount: number;
  hint: string;
}

const LEVELS: Record<PartId, Level> = {
  wheels: { speed: 2.4, zone: 0.11, drift: 0.7, pulse: 1.6, pulseAmount: 0.4, hint: "Tighten the axle nuts" },
  engine: { speed: 3.0, zone: 0.095, drift: 0.9, pulse: 2.0, pulseAmount: 0.45, hint: "Bolt the engine into the frame" },
  chain: { speed: 3.6, zone: 0.085, drift: 1.1, pulse: 2.4, pulseAmount: 0.5, hint: "Tension the chain" },
  suspension: { speed: 4.2, zone: 0.075, drift: 1.3, pulse: 2.9, pulseAmount: 0.55, hint: "Set the spring preload" },
  handlebar: {
    speed: 5.0,
    zone: 0.07,
    drift: 1.6,
    pulse: 3.4,
    pulseAmount: 0.6,
    hint: "Clamp the handlebar (the right way round!)",
  },
};

/** Score for stopping the needle at `pos` with the zone centred at `center`. */
function scoreFor(pos: number, center: number, half: number): number {
  const d = Math.abs(pos - center);
  if (d <= half) return 1 - 0.1 * (d / half); // inside: 0.9..1
  return Math.max(0, 0.9 - (d - half) / 0.3);
}

export function AssemblyScreen({ onBuilt, onRide, onMenu }: Props) {
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<Partial<PartScores>>({});
  const [lastHit, setLastHit] = useState<{ part: PartId; score: number } | null>(null);
  const [bike, setBike] = useState<Bike | null>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0.5);
  /** Current zone centre and width; animated together with the needle. */
  const zoneState = useRef({ center: 0.5, width: 0.1 });
  const lockedRef = useRef(false);

  const part = PARTS[index] as PartId | undefined;
  const level = part ? LEVELS[part] : null;

  // Animate the needle (direct DOM writes, no React re-render per frame).
  useEffect(() => {
    if (!level) return;
    lockedRef.current = false;
    let raf = 0;
    let phase = Math.random() * Math.PI * 2;
    let zonePhase = Math.random() * Math.PI * 2;
    let pulsePhase = Math.random() * Math.PI * 2;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      if (!lockedRef.current) {
        phase += dt * level.speed;
        // Sine sweep, slightly irregular so it can't be timed by rhythm alone.
        posRef.current = 0.5 + 0.5 * Math.sin(phase + 0.25 * Math.sin(phase * 0.37));
        if (needleRef.current) needleRef.current.style.left = `${posRef.current * 100}%`;

        zonePhase += dt * level.drift;
        pulsePhase += dt * level.pulse;
        const width = level.zone * (1 + level.pulseAmount * Math.sin(pulsePhase));
        // Two mixed sines so the drift doesn't settle into a predictable rhythm.
        const wander = 0.75 * Math.sin(zonePhase) + 0.25 * Math.sin(zonePhase * 2.3 + 1);
        const range = 0.5 - width / 2 - 0.02;
        const center = 0.5 + wander * range;
        zoneState.current = { center, width };
        if (zoneRef.current) {
          zoneRef.current.style.left = `${(center - width / 2) * 100}%`;
          zoneRef.current.style.width = `${width * 100}%`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level]);

  const lock = () => {
    if (!part || !level || lockedRef.current) return;
    lockedRef.current = true;
    const { center, width } = zoneState.current;
    const score = scoreFor(posRef.current, center, width / 2);
    const next = { ...scores, [part]: score };
    setScores(next);
    setLastHit({ part, score });
    window.setTimeout(() => {
      if (index + 1 >= PARTS.length) {
        const built = buildBike(next as PartScores);
        setBike(built);
        onBuilt(built);
      }
      setIndex(index + 1);
    }, 650);
  };

  const restart = () => {
    setIndex(0);
    setScores({});
    setLastHit(null);
    setBike(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Escape") return onMenu();
      if (bike) {
        if (e.code === "Space" || e.code === "Enter") (isWrecked(bike) ? restart : onRide)();
        if (e.code === "KeyB") restart();
      } else if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        lock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="screen assembly">
      <header className="screen-head">
        <h1>Garage</h1>
        <button className="ghost" onClick={onMenu}>
          Menu
        </button>
      </header>

      <BikeDiagram scores={scores} active={bike ? undefined : part} />

      {!bike && part && level && (
        <div className="wrench">
          <p className="step">
            Part {index + 1}/{PARTS.length}: <b>{PART_INFO[part].name}</b> — {level.hint}
          </p>
          <div className="gauge" onPointerDown={lock}>
            <div className="gauge-zone" ref={zoneRef} />
            <div className="gauge-needle" ref={needleRef} />
          </div>
          <p className="muted">
            Press <kbd>Space</kbd> or tap the gauge to tighten.
          </p>
          <p className={`hit ${lastHit ? "show" : ""}`}>
            {lastHit && `${PART_INFO[lastHit.part].name}: ${verdict(lastHit.score)}`}
          </p>
        </div>
      )}

      {bike && (
        <div className="summary">
          <div className="grade">
            Bike grade <span className={`grade-${bike.grade}`}>{bike.grade}</span>
          </div>
          <table>
            <tbody>
              {PARTS.map((p) => (
                <tr key={p}>
                  <td>{PART_INFO[p].name}</td>
                  <td>
                    <div className="meter">
                      <div style={{ width: `${bike.scores[p] * 100}%` }} />
                    </div>
                  </td>
                  <td>{verdict(bike.scores[p])}</td>
                  <td className="muted">{PART_INFO[p].effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {bike.scores.handlebar < HANDLEBAR_SWAP_THRESHOLD && (
            <p className="warn">⚠ The handlebar is on backwards: O and P are swapped!</p>
          )}
          {isWrecked(bike) && <p className="warn">Nothing holds together. This bike won't ride, try again!</p>}
          <div className="row">
            {!isWrecked(bike) && (
              <button className="primary" onClick={onRide}>
                Ride it! <kbd>Space</kbd>
              </button>
            )}
            <button onClick={restart}>
              Rebuild <kbd>B</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
