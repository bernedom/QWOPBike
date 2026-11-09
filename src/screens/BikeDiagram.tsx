import type { ReactNode } from "react";
import type { PartId, PartScores } from "../bike";

interface Props {
  scores: Partial<PartScores>;
  active?: PartId;
}

/** Centre of each part, used as the pivot for the "crooked" rotation. */
const PIVOT: Record<PartId, [number, number]> = {
  wheels: [200, 150],
  engine: [190, 115],
  chain: [150, 140],
  suspension: [285, 100],
  handlebar: [272, 48],
};

/** Side view of a dirt bike; each part tilts in proportion to how badly it was fitted. */
export function BikeDiagram({ scores, active }: Props) {
  const part = (id: PartId, children: ReactNode) => {
    const s = scores[id];
    const done = s !== undefined;
    const bad = done ? 1 - s : 0;
    const [cx, cy] = PIVOT[id];
    // Alternate the tilt direction per part so it looks properly botched.
    const dir = ["wheels", "chain", "handlebar"].includes(id) ? 1 : -1;
    const cls = done ? (s >= 0.8 ? "good" : s >= 0.4 ? "meh" : "bad") : id === active ? "active" : "ghost";
    return (
      <g
        className={`part part-${cls}`}
        transform={`rotate(${dir * bad * 18} ${cx} ${cy}) translate(0 ${bad * 6})`}
      >
        {children}
      </g>
    );
  };

  return (
    <svg className="bike-diagram" viewBox="0 0 400 210" role="img" aria-label="Bike being assembled">
      <line x1="10" y1="196" x2="390" y2="196" className="floor" />
      {/* Frame is always there */}
      <path className="frame" d="M110 150 L175 85 L255 70 L230 130 Z M175 85 L150 70 L95 75" />
      <path className="seat" d="M95 72 L175 78" />

      {part(
        "wheels",
        <>
          <circle cx="110" cy="150" r="42" className="tyre" />
          <circle cx="110" cy="150" r="26" className="rim" />
          <circle cx="300" cy="150" r="42" className="tyre" />
          <circle cx="300" cy="150" r="26" className="rim" />
        </>,
      )}
      {part("engine", <rect x="165" y="95" width="55" height="42" rx="6" className="engine" />)}
      {part(
        "chain",
        <>
          <circle cx="190" cy="132" r="8" className="sprocket" />
          <circle cx="110" cy="150" r="13" className="sprocket" />
          <path className="chain" d="M190 124 L110 137 M190 140 L110 163" />
        </>,
      )}
      {part(
        "suspension",
        <>
          <path className="fork" d="M262 55 L300 150" />
          <path className="shock" d="M150 72 L160 120" />
        </>,
      )}
      {part("handlebar", <path className="bar" d="M262 55 L268 38 L290 34" />)}
    </svg>
  );
}
