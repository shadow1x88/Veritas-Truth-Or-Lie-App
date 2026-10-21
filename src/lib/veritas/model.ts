import {
  PRIORS,
  TELL_IDS,
  type BaselineModel,
  type FeatureSet,
  type TellId,
  type TellReading,
  type VeritasScore,
} from "./types";

export const TELL_LABEL: Record<TellId, string> = {
  pitch: "Pitch",
  jitter: "Pitch shake",
  rate: "Speech rate",
  pause: "Pauses",
  gap: "Space between words",
  gapCv: "Uneven gaps",
  energy: "Tone",
  tone: "Tone color",
  breath: "Breathing",
  pulse: "Pulse",
  blush: "Blush",
  pupil: "Pupils",
  dental: "Teeth-light",
  hedge: "Hedges",
  fill: "Um / uh",
  latency: "Hesitation",
  tremor: "Unsteady hands",
};

/**
 * Additive boosted stumps — the Veritas ensemble.
 * Same scoring shape as a tiny gradient-boosted model (XGBoost family):
 * each stump votes, the votes sum, a sigmoid turns that into a lie probability.
 * Thresholds are deception cues, not a medical or forensic instrument.
 */
const TREES: { id: TellId; mode: "high" | "low" | "abs"; z: number; gain: number }[] = [
  { id: "pitch", mode: "high", z: 0.55, gain: 1.05 },
  { id: "pitch", mode: "low", z: -1.2, gain: 0.28 },
  { id: "jitter", mode: "high", z: 0.7, gain: 0.7 },
  { id: "pause", mode: "high", z: 1.15, gain: 0.28 },
  { id: "gap", mode: "high", z: 1.1, gain: 0.28 },
  { id: "gapCv", mode: "high", z: 0.9, gain: 0.34 },
  { id: "breath", mode: "high", z: 0.75, gain: 0.7 },
  { id: "pulse", mode: "high", z: 0.7, gain: 0.95 },
  { id: "blush", mode: "high", z: 0.65, gain: 0.85 },
  { id: "pupil", mode: "high", z: 0.5, gain: 1.2 },
  { id: "dental", mode: "high", z: 0.65, gain: 0.9 },
  { id: "hedge", mode: "high", z: 0.65, gain: 0.7 },
  { id: "fill", mode: "high", z: 0.65, gain: 0.4 },
  { id: "latency", mode: "high", z: 1.25, gain: 0.22 },
  { id: "tremor", mode: "high", z: 0.9, gain: 0.55 },
  { id: "rate", mode: "abs", z: 1.05, gain: 0.4 },
  { id: "energy", mode: "abs", z: 1.05, gain: 0.45 },
  { id: "tone", mode: "high", z: 0.75, gain: 0.6 },
];

export function emptyBaseline(): BaselineModel {
  return { n: 0, sum: {}, sumSq: {}, seen: {} };
}

export function addBaseline(b: BaselineModel, f: FeatureSet): BaselineModel {
  const sum = { ...b.sum };
  const sumSq = { ...b.sumSq };
  const seen = { ...b.seen };
  for (const id of TELL_IDS) {
    const v = f[id];
    if (v == null || !Number.isFinite(v)) continue;
    sum[id] = (sum[id] ?? 0) + v;
    sumSq[id] = (sumSq[id] ?? 0) + v * v;
    seen[id] = (seen[id] ?? 0) + 1;
  }
  return { n: b.n + 1, sum, sumSq, seen };
}

function zOf(b: BaselineModel, id: TellId, value: number): number | null {
  const seen = b.seen[id] ?? 0;
  if (seen < 1) return null;
  const mean = (b.sum[id] ?? 0) / seen;
  let sd = PRIORS[id];
  if (seen >= 2) {
    const variance = (b.sumSq[id] ?? 0) / seen - mean * mean;
    sd = Math.max(Math.sqrt(Math.max(0, variance)), PRIORS[id] * 0.45);
  }
  return (value - mean) / sd;
}

export function phraseFor(id: TellId, z: number): string {
  const up = z > 0.35;
  const down = z < -0.35;
  switch (id) {
    case "pitch":
      if (up) return "Pitch went up";
      if (down) return "Pitch dropped";
      return "Pitch stayed level";
    case "jitter":
      if (up) return "The voice shook";
      return "The voice stayed steady";
    case "rate":
      if (up) return "They talked faster";
      if (down) return "They slowed down";
      return "Speech rate held";
    case "pause":
      if (up) return "The pauses got longer";
      if (down) return "The pauses disappeared";
      return "The pauses matched baseline";
    case "gap":
      if (up) return "The space between words stretched";
      if (down) return "The words packed tighter";
      return "The space between words held";
    case "gapCv":
      if (up) return "The gaps turned uneven";
      return "The rhythm of the gaps held";
    case "energy":
      if (up) return "Tone pushed harder";
      if (down) return "Tone went thin";
      return "Tone held";
    case "tone":
      if (up) return "The voice went brighter";
      if (down) return "The voice went darker";
      return "Tone color held";
    case "breath":
      if (up) return "Breathing went uneven";
      return "Breathing stayed even";
    case "pulse":
      if (up) return "Pulse jumped";
      if (down) return "Pulse dropped";
      return "Pulse held";
    case "blush":
      if (up) return "Color rose in the face";
      if (down) return "Color left the face";
      return "No blush shift";
    case "pupil":
      if (up) return "The pupils dilated";
      if (down) return "The pupils constricted";
      return "The pupils held";
    case "dental":
      if (up) return "Teeth-light pressure climbed";
      if (down) return "Teeth-light pressure fell";
      return "Teeth-light pressure held";
    case "hedge":
      if (up) return "The answer filled with hedges";
      return "The wording stayed direct";
    case "fill":
      if (up) return "More ums and uhs than usual";
      return "Few filler sounds";
    case "latency":
      if (up) return "They waited before answering";
      if (down) return "They answered almost too fast";
      return "They started when they usually do";
    case "tremor":
      if (up) return "The hands got unsteady";
      return "The hands stayed still";
    default:
      return TELL_LABEL[id];
  }
}

export function scoreAnswer(baseline: BaselineModel, features: FeatureSet): VeritasScore {
  const zs: Partial<Record<TellId, number>> = {};
  for (const id of TELL_IDS) {
    const value = features[id];
    if (value == null || !Number.isFinite(value)) continue;
    const z = zOf(baseline, id, value);
    if (z == null || !Number.isFinite(z)) continue;
    zs[id] = Math.max(-4, Math.min(4, z));
  }

  const active = Object.keys(zs).length;
  let logit = -0.45;
  const contrib: Partial<Record<TellId, number>> = {};

  if (active > 0) {
    for (const tree of TREES) {
      const z = zs[tree.id];
      if (z == null) continue;
      const hit =
        tree.mode === "high" ? z >= tree.z : tree.mode === "low" ? z <= tree.z : Math.abs(z) >= tree.z;
      if (hit) {
        logit += tree.gain;
        contrib[tree.id] = (contrib[tree.id] ?? 0) + tree.gain;
      }
    }
  }

  const lieProbability = 1 / (1 + Math.exp(-logit));
  const call: "TRUTH" | "LIE" = lieProbability > 0.5 ? "LIE" : "TRUTH";
  let confidence = call === "LIE" ? lieProbability : 1 - lieProbability;
  if (active < 4) confidence *= 0.88;
  if (active < 2) confidence = Math.min(confidence, 0.56);
  confidence = Math.max(0.5, Math.min(0.96, confidence));

  const tells: TellReading[] = TELL_IDS.filter((id) => zs[id] != null)
    .map((id) => {
      const z = zs[id] ?? 0;
      const push = Math.max(0, Math.min(1, (contrib[id] ?? 0) / 0.74));
      return {
        id,
        label: TELL_LABEL[id],
        phrase: phraseFor(id, z),
        z,
        push,
      };
    })
    .sort((a, b) => b.push - a.push || Math.abs(b.z) - Math.abs(a.z));

  const notable = tells.filter((t) => t.push > 0 || Math.abs(t.z) >= 0.45);
  const shown = (notable.length ? notable : tells).slice(0, 6);

  return { call, lieProbability, confidence, tells: shown, active, channels: zs };
}

export function baselineNote(features: FeatureSet): string {
  const bits: string[] = [];
  if (features.pitch) bits.push(`Pitch ${Math.round(features.pitch)} Hz`);
  if (features.pulse) bits.push(`Pulse ${Math.round(features.pulse)}`);
  if (features.blush != null) bits.push("Face locked");
  if (features.dental != null) bits.push("Teeth-light locked");
  if (!bits.length) bits.push(features.latency != null ? "Timing locked" : "Sample locked");
  return bits.join(" · ");
}
