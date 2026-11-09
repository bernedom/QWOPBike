import { useCallback, useState } from "react";
import { buildBike, PARTS, type Bike, type PartScores } from "./bike";
import { AssemblyScreen } from "./screens/AssemblyScreen";
import { RaceScreen } from "./screens/RaceScreen";
import { RevealScreen } from "./screens/RevealScreen";
import { TitleScreen } from "./screens/TitleScreen";
import { loadBike, loadStats, resetAll, saveBike, saveStats, type PlayerStats } from "./storage";

type Screen = "title" | "assembly" | "race" | "reveal";

/**
 * Dev-only shortcuts for tuning: ?screen=race|assembly|reveal, ?quality=0..1
 * (e.g. http://localhost:5173/?screen=race&quality=0.5). Stripped from production builds.
 */
const devParams = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
const devScreen = devParams?.get("screen") as Screen | null;
const devQuality = devParams?.get("quality");
const devBike = devQuality
  ? buildBike(Object.fromEntries(PARTS.map((p) => [p, Number(devQuality)])) as PartScores)
  : null;

export function App() {
  const [screen, setScreen] = useState<Screen>(devScreen ?? "title");
  const [bike, setBike] = useState<Bike | null>(() => devBike ?? loadBike() ?? (devScreen === "race" ? buildBike(Object.fromEntries(PARTS.map((p) => [p, 1])) as PartScores) : null));
  const [stats, setStats] = useState<PlayerStats>(() => loadStats());
  /** Bumped on every new race so the RaceScreen remounts with a fresh sim. */
  const [raceId, setRaceId] = useState(0);

  const updateStats = useCallback((f: (s: PlayerStats) => PlayerStats) => {
    setStats((prev) => {
      const next = f(prev);
      saveStats(next);
      return next;
    });
  }, []);

  const startRace = useCallback(() => {
    updateStats((s) => ({ ...s, attempts: s.attempts + 1 }));
    setRaceId((id) => id + 1);
    setScreen("race");
  }, [updateStats]);

  const toTitle = useCallback(() => setScreen("title"), []);
  const toAssembly = useCallback(() => setScreen("assembly"), []);

  // The latest assembled bike is always the one you ride.
  const onBuilt = useCallback(
    (b: Bike) => {
      setBike(b);
      saveBike(b);
      updateStats((s) => ({ ...s, bikesBuilt: s.bikesBuilt + 1 }));
    },
    [updateStats],
  );

  const onCrash = useCallback(
    (distance: number) => updateStats((s) => ({ ...s, bestDistance: Math.max(s.bestDistance, distance) })),
    [updateStats],
  );

  const onFinish = useCallback(
    (time: number) => {
      updateStats((s) => ({
        ...s,
        finished: true,
        bestTime: s.bestTime === null ? time : Math.min(s.bestTime, time),
      }));
      window.setTimeout(() => setScreen("reveal"), 1500);
    },
    [updateStats],
  );

  const onReset = useCallback(() => {
    if (!window.confirm("Forget your bike, attempts and progress?")) return;
    resetAll();
    setBike(null);
    setStats(loadStats());
  }, []);

  switch (screen) {
    case "title":
      return (
        <TitleScreen
          bike={bike}
          stats={stats}
          onAssemble={toAssembly}
          onRace={startRace}
          onReveal={() => setScreen("reveal")}
          onReset={onReset}
        />
      );
    case "assembly":
      return <AssemblyScreen onBuilt={onBuilt} onRide={startRace} onMenu={toTitle} />;
    case "race":
      if (!bike) return <AssemblyScreen onBuilt={onBuilt} onRide={startRace} onMenu={toTitle} />;
      return (
        <RaceScreen
          key={raceId}
          bike={bike}
          attempt={stats.attempts}
          onCrash={onCrash}
          onFinish={onFinish}
          onRetry={startRace}
          onRebuild={toAssembly}
          onMenu={toTitle}
        />
      );
    case "reveal":
      return <RevealScreen stats={stats} onMenu={toTitle} />;
  }
}
