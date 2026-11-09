import { useEffect } from "react";
import { isWrecked, type Bike } from "../bike";
import { CONFIG } from "../config";
import type { PlayerStats } from "../storage";

interface Props {
  bike: Bike | null;
  stats: PlayerStats;
  onAssemble: () => void;
  onRace: () => void;
  onReveal: () => void;
  onReset: () => void;
}

export function TitleScreen({ bike: savedBike, stats, onAssemble, onRace, onReveal, onReset }: Props) {
  const wrecked = savedBike !== null && isWrecked(savedBike);
  const bike = wrecked ? null : savedBike;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") (bike ? onRace : onAssemble)();
      if (e.code === "KeyB") onAssemble();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bike, onRace, onAssemble]);

  return (
    <div className="screen title">
      <h1 className="logo">
        QWOP<span>-</span>Bike
      </h1>
      <p className="tagline">
        Hey {CONFIG.playerName}! {CONFIG.tagline}
      </p>

      <div className="controls-help">
        <div>
          <kbd>Q</kbd> gas
        </div>
        <div>
          <kbd>W</kbd> brake
        </div>
        <div>
          <kbd>O</kbd> lean back
        </div>
        <div>
          <kbd>P</kbd> lean forward
        </div>
      </div>
      <p className="muted small">
        Build your bike first. The better you put it together, the less it fights you.
        <br />
        Hit your head or flip over and you start again from the beginning, and every crash knocks a part
        loose. Once everything is broken, you need a new bike.
        <br />
        Reach the finish within <b>{CONFIG.timeLimit} seconds</b> to unlock your present.
      </p>

      {wrecked && <p className="warn">Your bike is a wreck. Build a new one!</p>}
      <div className="row">
        {bike ? (
          <>
            <button className="primary" onClick={onRace}>
              Ride (bike grade {bike.grade}) <kbd>Space</kbd>
            </button>
            <button onClick={onAssemble}>
              Build a new bike <kbd>B</kbd>
            </button>
          </>
        ) : (
          <button className="primary" onClick={onAssemble}>
            To the garage <kbd>Space</kbd>
          </button>
        )}
        {stats.finished && (
          <button onClick={onReveal}>🎁 Show my present</button>
        )}
      </div>

      {stats.attempts > 0 && (
        <p className="muted small stats-line">
          Attempts: {stats.attempts} · bikes built: {stats.bikesBuilt} · best: {stats.bestDistance.toFixed(0)} m
          {stats.bestTime !== null && ` · best time ${stats.bestTime.toFixed(1)} s`}
          {" · "}
          <button className="link" onClick={onReset}>
            reset
          </button>
        </p>
      )}
    </div>
  );
}
