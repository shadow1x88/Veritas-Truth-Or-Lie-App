/** Behavioral channels Veritas reads. Missing keys mean that sensor had no read. */
export const TELL_IDS = [
  "pitch",
  "jitter",
  "rate",
  "pause",
  "gap",
  "gapCv",
  "energy",
  "tone",
  "breath",
  "pulse",
  "blush",
  "pupil",
  "dental",
  "hedge",
  "fill",
  "latency",
  "tremor",
] as const;

export type TellId = (typeof TELL_IDS)[number];

/** Absolute measurements for one answer, before baseline comparison. */
export type FeatureSet = Partial<Record<TellId, number>>;

export interface TellReading {
  id: TellId | "face";
  label: string;
  phrase: string;
  /** Signed z-score versus this player's baseline. */
  z: number;
  /** How hard this tell pushed the ensemble toward a lie, 0–1. */
  push: number;
}

export interface VeritasScore {
  call: "TRUTH" | "LIE";
  lieProbability: number;
  confidence: number;
  tells: TellReading[];
  active: number;
  channels: Partial<Record<TellId, number>>;
}

export interface BaselineModel {
  n: number;
  sum: Partial<Record<TellId, number>>;
  sumSq: Partial<Record<TellId, number>>;
  seen: Partial<Record<TellId, number>>;
}

/**
 * Expected within-person noise. Stops a rock-steady baseline from turning
 * a 2 Hz pitch wobble into a ten-sigma "lie".
 */
export const PRIORS: Record<TellId, number> = {
  pitch: 14,
  jitter: 8,
  rate: 0.7,
  pause: 0.07,
  gap: 90,
  gapCv: 0.18,
  energy: 0.025,
  tone: 180,
  breath: 0.012,
  pulse: 7,
  blush: 0.035,
  pupil: 0.04,
  dental: 0.02,
  hedge: 0.06,
  fill: 0.04,
  latency: 450,
  tremor: 0.08,
};
