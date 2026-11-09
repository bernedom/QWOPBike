import { useMemo } from "react";
import { CONFIG, revealMessage } from "../config";
import type { PlayerStats } from "../storage";

interface Props {
  stats: PlayerStats;
  onMenu: () => void;
}

const CONFETTI_COLORS = ["#ffd23f", "#ff7a1a", "#3bceac", "#ee4266", "#540d6e", "#5aa9e6"];

export function RevealScreen({ stats, onMenu }: Props) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 3 + Math.random() * 3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
      })),
    [],
  );

  return (
    <div className="screen reveal">
      <div className="confetti" aria-hidden>
        {confetti.map((c, i) => (
          <i
            key={i}
            style={{
              left: `${c.left}%`,
              background: c.color,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              transform: `rotate(${c.rotate}deg)`,
            }}
          />
        ))}
      </div>
      <h1 className="logo">{CONFIG.revealTitle}</h1>
      <div className="card present">
        <div className="present-icon">🎁</div>
        <p className="present-message">{revealMessage()}</p>
      </div>
      <p className="muted small">
        It only took {stats.attempts} attempt{stats.attempts === 1 ? "" : "s"} and {stats.bikesBuilt} bike
        {stats.bikesBuilt === 1 ? "" : "s"}
        {stats.bestTime !== null && ` · best time ${stats.bestTime.toFixed(1)} s`}.
      </p>
      <button onClick={onMenu}>Back to the menu (ride again for a better time)</button>
    </div>
  );
}
