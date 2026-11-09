import { buildBike, type Bike } from "./bike";

const BIKE_KEY = "qwop-bike/bike";
const STATS_KEY = "qwop-bike/stats";

export interface PlayerStats {
  attempts: number;
  bikesBuilt: number;
  bestDistance: number;
  bestTime: number | null;
  finished: boolean;
}

const DEFAULT_STATS: PlayerStats = {
  attempts: 0,
  bikesBuilt: 0,
  bestDistance: 0,
  bestTime: null,
  finished: false,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode etc.) — the game still works, it just forgets.
  }
}

export function loadBike(): Bike | null {
  const saved = read<Bike>(BIKE_KEY);
  // Re-derive stats so tuning changes apply to previously saved bikes.
  return saved?.scores ? { ...buildBike(saved.scores), builtAt: saved.builtAt } : null;
}

export function saveBike(bike: Bike) {
  write(BIKE_KEY, bike);
}

export function loadStats(): PlayerStats {
  return { ...DEFAULT_STATS, ...read<PlayerStats>(STATS_KEY) };
}

export function saveStats(stats: PlayerStats) {
  write(STATS_KEY, stats);
}

export function resetAll() {
  try {
    localStorage.removeItem(BIKE_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch {
    // ignore
  }
}
