/**
 * Tell 1. Ocular-motor deception test, the published EyeDetect method.
 *
 * Cook, Hacker, Webb, Osher, Kristjansson, Woltz, and Kircher (2012),
 * Journal of Experimental Psychology: Applied. Experiment 1 recorded the
 * right eye at 60 Hz. Experiment 2 recorded at 30 Hz and added blink rate.
 *
 * Converus prints the decision as
 *   Pr(Deceptive) = 1 / (1 + exp(b0 + b1 X1 + … + bk Xk))
 * and does not publish the weights. The signs below follow the paper:
 * a larger pupil area pushes toward a lie; more fixations, a longer first
 * pass, a longer re-read, and a slower answer push toward truth.
 * Change the numbers in EYEDETECT_WEIGHTS. Nothing else is tuned.
 *
 * One of their PDFs swaps the words under 0.5. The formula is named
 * Pr(Deceptive), so 0.5 and above is a lie.
 */

export const IRIS_MM = 11.7;
export const EYEBALL_RADIUS_MM = 12;
export const SAMPLE_HZ = 60;
export const PUPIL_WINDOW_MS = 4000;
export const FIXATION_START_MS = 100;
export const FIXATION_END_MS = 50;
export const FIXATION_START_DEG = 0.5;
export const FIXATION_END_DEG = 1;
export const FIXATION_MAX_MS = 1000;

export interface GazeSample {
  t: number;
  /** Degrees of visual angle. Origin is the middle of the screen. */
  xDeg: number;
  yDeg: number;
  pupilMm: number | null;
  blink: boolean;
}

export interface StatementBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The task on the screen: Amara and the question under her. Degrees. */
export const QUESTION_BOX_DEG: StatementBox = { x0: -22, y0: -30, x1: 22, y1: 14 };

export interface OdtMeasures {
  pupilAuc: number | null;
  fixationsPerChar: number | null;
  firstPassMsPerChar: number | null;
  secondPassMsPerChar: number | null;
  responseMsPerChar: number | null;
  blinkRate: number | null;
  nextBlinkRate: number | null;
  /** Share of the read spent off Amara. Not part of the printed EyeDetect equation. */
  lookAway: number | null;
}

export interface EyeBaseline {
  n: number;
  sum: Record<keyof OdtMeasures, number>;
  seen: Record<keyof OdtMeasures, number>;
}

export interface EyeDetectScore {
  measures: OdtMeasures;
  /** Null until this person has a baseline. */
  probability: number | null;
  call: "TRUTH" | "LIE" | null;
}

/**
 * Weights for the printed equation. `scale` puts each measure in a unit
 * the weight can move. Both columns are yours to change.
 */
export const EYEDETECT_WEIGHTS: Record<keyof OdtMeasures | "intercept", { b: number; scale: number }> = {
  intercept: { b: 0.4, scale: 1 },
  pupilAuc: { b: -0.8, scale: 0.02 },
  fixationsPerChar: { b: 0.6, scale: 0.05 },
  firstPassMsPerChar: { b: 0.5, scale: 40 },
  secondPassMsPerChar: { b: 0.5, scale: 40 },
  responseMsPerChar: { b: 0.45, scale: 80 },
  blinkRate: { b: 0, scale: 0.3 },
  nextBlinkRate: { b: 0, scale: 0.3 },
  lookAway: { b: 0, scale: 0.25 },
};

const MEASURE_KEYS: (keyof OdtMeasures)[] = [
  "pupilAuc",
  "fixationsPerChar",
  "firstPassMsPerChar",
  "secondPassMsPerChar",
  "responseMsPerChar",
  "blinkRate",
  "nextBlinkRate",
  "lookAway",
];

export function emptyEyeBaseline(): EyeBaseline {
  const sum = {} as EyeBaseline["sum"];
  const seen = {} as EyeBaseline["seen"];
  for (const key of MEASURE_KEYS) {
    sum[key] = 0;
    seen[key] = 0;
  }
  return { n: 0, sum, seen };
}

export function addEyeBaseline(b: EyeBaseline, m: OdtMeasures): EyeBaseline {
  const sum = { ...b.sum };
  const seen = { ...b.seen };
  for (const key of MEASURE_KEYS) {
    const v = m[key];
    if (v == null || !Number.isFinite(v)) continue;
    sum[key] += v;
    seen[key] += 1;
  }
  return { n: b.n + 1, sum, seen };
}

function meanOf(b: EyeBaseline, key: keyof OdtMeasures): number | null {
  if (b.seen[key] < 1) return null;
  return b.sum[key] / b.seen[key];
}

/** How far this read sits from this person's own eyes, in weight units. */
export function eyeDelta(
  measures: OdtMeasures,
  baseline: EyeBaseline,
): Partial<Record<keyof OdtMeasures, number>> {
  const out: Partial<Record<keyof OdtMeasures, number>> = {};
  if (baseline.n < 1) return out;
  for (const key of MEASURE_KEYS) {
    const value = measures[key];
    const base = meanOf(baseline, key);
    const scale = EYEDETECT_WEIGHTS[key].scale;
    if (value == null || base == null || !scale) continue;
    out[key] = (value - base) / scale;
  }
  return out;
}

export function pupilMillimeters(pupilPx: number, irisPx: number): number | null {
  if (!(irisPx > 4) || !(pupilPx > 0)) return null;
  return (pupilPx / irisPx) * IRIS_MM;
}

export function gazeDegrees(offsetMm: number): number {
  const x = Math.max(-1, Math.min(1, offsetMm / EYEBALL_RADIUS_MM));
  return (Math.asin(x) * 180) / Math.PI;
}

/**
 * Area under the evoked pupil curve.
 * The curve is this sample minus the first sample, for 4 seconds after the
 * statement appears. The area is the sum of the positive rises above the low
 * point after onset, until the pupil falls back to that low point or 4 seconds
 * ends. The sum is scaled to a 60 Hz track so a 30 Hz camera is not half a lie.
 */
export function pupilArea(samples: GazeSample[], onset: number): number | null {
  const window = samples.filter(
    (s) => s.pupilMm != null && s.t >= onset && s.t <= onset + PUPIL_WINDOW_MS,
  );
  if (window.length < 4) return null;
  let low = window[0]!.pupilMm!;
  let lowAt = 0;
  for (let i = 1; i < window.length; i++) {
    const v = window[i]!.pupilMm!;
    if (v < low) {
      low = v;
      lowAt = i;
    }
  }
  let area = 0;
  let prevT = window[lowAt]!.t;
  for (let i = lowAt; i < window.length; i++) {
    const rise = window[i]!.pupilMm! - low;
    if (i > lowAt && rise <= 0) break;
    const dt = window[i]!.t - prevT;
    area += Math.max(0, rise) * (dt / 1000) * SAMPLE_HZ;
    prevT = window[i]!.t;
  }
  return area;
}

export interface Fixation {
  t0: number;
  t1: number;
  x: number;
  y: number;
}

function centroid(points: GazeSample[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.xDeg;
    y += p.yDeg;
  }
  return { x: x / points.length, y: y / points.length };
}

function withinDeg(points: GazeSample[], deg: number): boolean {
  const origin = points[0]!;
  return points.every(
    (p) => Math.abs(p.xDeg - origin.xDeg) <= deg && Math.abs(p.yDeg - origin.yDeg) <= deg,
  );
}

/** Eyenal rules from the 2012 paper, stated in milliseconds so 30 Hz and 60 Hz match. */
export function findFixations(samples: GazeSample[]): Fixation[] {
  const out: Fixation[] = [];
  let i = 0;
  while (i < samples.length) {
    let j = i;
    while (j < samples.length && samples[j]!.t - samples[i]!.t < FIXATION_START_MS) j += 1;
    if (j >= samples.length || !withinDeg(samples.slice(i, j + 1), FIXATION_START_DEG)) {
      i += 1;
      continue;
    }
    let end = j;
    let mean = centroid(samples.slice(i, end + 1));
    let offAt = -1;
    for (let k = end + 1; k < samples.length; k++) {
      const p = samples[k]!;
      const left = Math.abs(p.xDeg - mean.x) > FIXATION_END_DEG || Math.abs(p.yDeg - mean.y) > FIXATION_END_DEG;
      if (left) {
        if (offAt < 0) offAt = k;
        if (p.t - samples[offAt]!.t >= FIXATION_END_MS) {
          end = offAt - 1;
          break;
        }
      } else {
        offAt = -1;
        end = k;
        mean = centroid(samples.slice(i, end + 1));
      }
    }
    if (end < i) {
      i += 1;
      continue;
    }
    const span = samples.slice(i, end + 1);
    const dur = span[span.length - 1]!.t - span[0]!.t;
    if (dur >= FIXATION_START_MS && dur <= FIXATION_MAX_MS) {
      const cleaned = dropOutliers(span);
      const c = centroid(cleaned);
      out.push({ t0: span[0]!.t, t1: span[span.length - 1]!.t, x: c.x, y: c.y });
    }
    i = end + 1;
  }
  return out;
}

/** Drop a run of one or two samples sitting more than 1.5 sd off the mean. */
function dropOutliers(span: GazeSample[]): GazeSample[] {
  if (span.length < 4) return span;
  const c = centroid(span);
  const sd = Math.sqrt(
    span.reduce((a, p) => a + (p.xDeg - c.x) ** 2 + (p.yDeg - c.y) ** 2, 0) / span.length,
  );
  if (sd === 0) return span;
  const far = span.map((p) => Math.hypot(p.xDeg - c.x, p.yDeg - c.y) > 1.5 * sd);
  const keep = span.filter((_, idx) => {
    if (!far[idx]) return true;
    const prev = idx > 0 && far[idx - 1];
    const next = idx + 1 < far.length && far[idx + 1];
    const run = 1 + (prev ? 1 : 0) + (next ? 1 : 0);
    return run > 2;
  });
  return keep.length ? keep : span;
}

function onStatement(f: Fixation, box: StatementBox): boolean {
  return f.x >= box.x0 && f.x <= box.x1 && f.y >= box.y0 && f.y <= box.y1;
}

export function readingTimes(
  fixations: Fixation[],
  box: StatementBox,
): { firstPassMs: number; secondPassMs: number; onStatement: number } {
  const hits = fixations.filter((f) => onStatement(f, box));
  if (!hits.length) return { firstPassMs: 0, secondPassMs: 0, onStatement: 0 };
  let left = false;
  let first = 0;
  let second = 0;
  for (const f of fixations) {
    const inside = onStatement(f, box);
    const dur = f.t1 - f.t0;
    if (!left) {
      if (inside) first += dur;
      else if (first > 0) left = true;
    } else if (inside) {
      second += dur;
    }
  }
  return { firstPassMs: first, secondPassMs: second, onStatement: hits.length };
}

export function blinkRate(samples: GazeSample[], t0: number, t1: number): number | null {
  if (!(t1 > t0)) return null;
  let blinks = 0;
  let down = false;
  for (const s of samples) {
    if (s.t < t0 || s.t > t1) continue;
    if (s.blink && !down) blinks += 1;
    down = s.blink;
  }
  return blinks / ((t1 - t0) / 1000);
}

export function lookAwayFraction(samples: GazeSample[], t0: number, t1: number): number | null {
  const span = samples.filter((s) => s.t >= t0 && s.t <= t1 && !s.blink);
  if (span.length < 4) return null;
  let off = 0;
  for (const s of span) {
    const inside =
      s.xDeg >= QUESTION_BOX_DEG.x0 &&
      s.xDeg <= QUESTION_BOX_DEG.x1 &&
      s.yDeg >= QUESTION_BOX_DEG.y0 &&
      s.yDeg <= QUESTION_BOX_DEG.y1;
    if (!inside) off += 1;
  }
  return off / span.length;
}

export function measureStatement(args: {
  samples: GazeSample[];
  onset: number;
  responseAt: number;
  characters: number;
  box?: StatementBox;
  nextBlinkRate?: number | null;
}): OdtMeasures {
  const box = args.box ?? QUESTION_BOX_DEG;
  const chars = Math.max(1, args.characters);
  const fixations = findFixations(args.samples.filter((s) => s.t >= args.onset));
  const reading = readingTimes(fixations, box);
  const responseMs = Math.max(0, args.responseAt - args.onset);
  return {
    pupilAuc: pupilArea(args.samples, args.onset),
    fixationsPerChar: reading.onStatement / chars,
    firstPassMsPerChar: reading.firstPassMs / chars,
    secondPassMsPerChar: reading.secondPassMs / chars,
    responseMsPerChar: responseMs / chars,
    blinkRate: blinkRate(args.samples, args.onset, args.responseAt),
    nextBlinkRate: args.nextBlinkRate ?? null,
    lookAway: lookAwayFraction(args.samples, args.onset, args.responseAt),
  };
}

export function scoreEyeDetect(
  measures: OdtMeasures,
  baseline: EyeBaseline,
  weights: typeof EYEDETECT_WEIGHTS = EYEDETECT_WEIGHTS,
): EyeDetectScore {
  if (baseline.n < 1) return { measures, probability: null, call: null };
  let linear = weights.intercept.b;
  let used = 0;
  for (const key of MEASURE_KEYS) {
    const value = measures[key];
    const base = meanOf(baseline, key);
    const w = weights[key];
    if (value == null || base == null || w.b === 0 || w.scale === 0) continue;
    linear += w.b * ((value - base) / w.scale);
    used += 1;
  }
  if (used === 0) return { measures, probability: null, call: null };
  const probability = 1 / (1 + Math.exp(linear));
  return { measures, probability, call: probability >= 0.5 ? "LIE" : "TRUTH" };
}

interface EyeRead {
  pupilMm: number | null;
  xDeg: number;
  yDeg: number;
  blink: boolean;
}

function boxStats(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(w - 1, Math.ceil(x1));
  const yb = Math.min(h - 1, Math.ceil(y1));
  let min = 255;
  let n = 0;
  const lumaAt = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return 0.3 * (data[i] ?? 0) + 0.59 * (data[i + 1] ?? 0) + 0.11 * (data[i + 2] ?? 0);
  };
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const luma = lumaAt(x, y);
      n += 1;
      if (luma < min) min = luma;
    }
  }
  if (!n || min > 90) return null;
  const pupilLimit = Math.min(70, min + 25);
  const irisLimit = Math.min(165, Math.max(pupilLimit + 40, min + 100));
  let pupilN = 0;
  let irisN = 0;
  let pupilX = 0;
  let pupilY = 0;
  let irisX = 0;
  let irisY = 0;
  let openRows = 0;
  for (let y = ya; y <= yb; y++) {
    let dark = 0;
    for (let x = xa; x <= xb; x++) {
      const luma = lumaAt(x, y);
      if (luma <= irisLimit) {
        irisN += 1;
        irisX += x;
        irisY += y;
      }
      if (luma <= pupilLimit) {
        pupilN += 1;
        pupilX += x;
        pupilY += y;
        dark += 1;
      }
    }
    if (dark > (xb - xa) * 0.08) openRows += 1;
  }
  if (pupilN < 4 || irisN <= pupilN) return null;
  return {
    pupilPx: 2 * Math.sqrt(pupilN / Math.PI),
    irisPx: 2 * Math.sqrt(irisN / Math.PI),
    offsetX: pupilX / pupilN - irisX / irisN,
    offsetY: pupilY / pupilN - irisY / irisN,
    open: openRows / Math.max(1, yb - ya),
  };
}

/** Pupil diameter in millimeters from the iris, which stays near 11.7 mm. */
export function readEyes(data: Uint8ClampedArray, w: number, h: number): EyeRead {
  const regions = [
    [w * 0.16, h * 0.16, w * 0.46, h * 0.5],
    [w * 0.54, h * 0.16, w * 0.84, h * 0.5],
  ];
  const found = regions
    .map(([x0, y0, x1, y1]) => boxStats(data, w, h, x0!, y0!, x1!, y1!))
    .filter((r): r is NonNullable<typeof r> => r != null && r.irisPx > 5);
  if (!found.length) return { pupilMm: null, xDeg: 0, yDeg: 0, blink: false };
  let pupil = 0;
  let pupilN = 0;
  let ox = 0;
  let oy = 0;
  let open = 0;
  for (const eye of found) {
    const mm = pupilMillimeters(eye.pupilPx, eye.irisPx);
    if (mm != null) {
      pupil += mm;
      pupilN += 1;
    }
    const mmPerPx = IRIS_MM / eye.irisPx;
    ox += eye.offsetX * mmPerPx;
    oy += eye.offsetY * mmPerPx;
    open += eye.open;
  }
  const n = found.length;
  return {
    pupilMm: pupilN ? pupil / pupilN : null,
    xDeg: gazeDegrees(ox / n),
    yDeg: -gazeDegrees(oy / n),
    blink: open / n < 0.16,
  };
}
