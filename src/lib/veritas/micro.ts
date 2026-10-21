/**
 * Tell 2. The face chart.
 *
 * Upper face and lower face are read separately. A mismatch is kept as a
 * mismatch. A movement that rises and returns inside 500 ms is a micro.
 * One that stays is a held expression. Yan, Wu, Liang, and Fu (2013) put
 * the micro line at under 500 ms. Matsumoto and Hwang found the flashes
 * that separated truth from lie sat at 400–500 ms, not only the 40 ms ones.
 *
 * Captions are the ones on the chart:
 *   Fear — upper eyelids raised
 *   Disgust — nose wrinkled
 *   Anger — jaw thrust forward
 *   Determination/Anger — lips pressed
 *   Sadness — eyebrows drawn up
 *   Sadness — lip corners down
 * The grid adds the pairs those captions do not cover: joy, surprise, neutral.
 */

export const MICRO_MS = 500;

export const FACE_CUES = [
  "lidRaise",
  "browUp",
  "browDown",
  "noseWrinkle",
  "cheekRaise",
  "jawForward",
  "lipPress",
  "cornerDown",
  "jawDrop",
  "smile",
  "upperLip",
  "lipStretch",
] as const;

export type FaceCue = (typeof FACE_CUES)[number];
export type FaceZone = "Fear" | "Anger" | "Disgust" | "Joy" | "Neutral" | "Sadness" | "Surprise";

export const CUE_CAPTION: Record<FaceCue, string> = {
  lidRaise: "Upper eyelids raised",
  browUp: "Eyebrows drawn up",
  browDown: "Brows pulled down",
  noseWrinkle: "Nose wrinkled",
  cheekRaise: "Cheeks raised",
  jawForward: "Jaw thrust forward",
  lipPress: "Lips pressed",
  cornerDown: "Lip corners down",
  jawDrop: "Jaw dropped",
  smile: "Mouth smiling",
  upperLip: "Upper lip raised",
  lipStretch: "Lips stretched",
};

export interface FaceSample {
  t: number;
  cues: Record<FaceCue, number>;
}

export interface FaceFlash {
  cue: FaceCue;
  t0: number;
  t1: number;
  peak: number;
  micro: boolean;
}

export interface MicroMeasures {
  mean: Record<FaceCue, number>;
  flashes: FaceFlash[];
  upper: FaceZone;
  lower: FaceZone;
}

export interface MicroBaseline {
  n: number;
  sum: Record<FaceCue, number>;
  seen: Record<FaceCue, number>;
}

const emptyCues = (): Record<FaceCue, number> => {
  const cues = {} as Record<FaceCue, number>;
  for (const cue of FACE_CUES) cues[cue] = 0;
  return cues;
};

export function emptyMicroBaseline(): MicroBaseline {
  return { n: 0, sum: emptyCues(), seen: emptyCues() };
}

export function addMicroBaseline(b: MicroBaseline, m: MicroMeasures): MicroBaseline {
  const sum = { ...b.sum };
  const seen = { ...b.seen };
  for (const cue of FACE_CUES) {
    const v = m.mean[cue];
    if (!Number.isFinite(v)) continue;
    sum[cue] += v;
    seen[cue] += 1;
  }
  return { n: b.n + 1, sum, seen };
}

function deltaFrom(b: MicroBaseline, m: MicroMeasures): Record<FaceCue, number> {
  const d = emptyCues();
  for (const cue of FACE_CUES) {
    if (b.seen[cue] < 1) {
      d[cue] = 0;
      continue;
    }
    d[cue] = m.mean[cue] - b.sum[cue] / b.seen[cue];
  }
  return d;
}

/** Change from this person's own face. A straight face stays near zero. */
export function faceDelta(m: MicroMeasures, baseline: MicroBaseline): Record<FaceCue, number> {
  return deltaFrom(baseline, m);
}

/** Surprise is both. Lids alone are fear. Brows alone are sadness. */
export function upperZone(d: Record<FaceCue, number>, t = 0.08): FaceZone {
  if (d.lidRaise > t && d.browUp > t) return "Surprise";
  const ranked: [FaceZone, number][] = [
    ["Fear", d.lidRaise],
    ["Sadness", d.browUp],
    ["Disgust", d.noseWrinkle],
    ["Anger", d.browDown],
    ["Joy", d.cheekRaise],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0]![1] > t ? ranked[0]![0] : "Neutral";
}

export function lowerZone(d: Record<FaceCue, number>, t = 0.08): FaceZone {
  const ranked: [FaceZone, number][] = [
    ["Surprise", d.jawDrop],
    ["Joy", d.smile],
    ["Sadness", d.cornerDown],
    ["Anger", Math.max(d.lipPress, d.jawForward)],
    ["Disgust", d.upperLip],
    ["Fear", d.lipStretch],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0]![1] > t ? ranked[0]![0] : "Neutral";
}

/**
 * A cue that climbs off its own slow line and comes back.
 * Back inside 500 ms: micro. Still up after that: held.
 */
export function findFlashes(samples: FaceSample[], cue: FaceCue, rise = 0.12): FaceFlash[] {
  if (samples.length < 4) return [];
  const out: FaceFlash[] = [];
  let slow = samples[0]!.cues[cue];
  let active = false;
  let t0 = 0;
  let peak = 0;
  let lastT = samples[0]!.t;
  const close = (t1: number) => {
    const dur = t1 - t0;
    if (dur >= 40) out.push({ cue, t0, t1, peak, micro: dur <= MICRO_MS });
    active = false;
  };
  for (const s of samples) {
    const v = s.cues[cue];
    const dt = Math.max(16, s.t - lastT);
    lastT = s.t;
    const alpha = 1 - Math.exp(-dt / 800);
    const spike = v - slow;
    slow = slow + alpha * (v - slow);
    if (!active && spike > rise) {
      active = true;
      t0 = s.t;
      peak = spike;
    } else if (active) {
      peak = Math.max(peak, spike);
      if (spike < rise * 0.4) close(s.t);
    }
  }
  if (active) close(samples[samples.length - 1]!.t);
  return out;
}

export function measureFace(samples: FaceSample[], baseline?: MicroBaseline): MicroMeasures {
  const mean = emptyCues();
  if (!samples.length) return { mean, flashes: [], upper: "Neutral", lower: "Neutral" };
  for (const s of samples) {
    for (const cue of FACE_CUES) mean[cue] += s.cues[cue];
  }
  for (const cue of FACE_CUES) mean[cue] /= samples.length;
  const flashes = FACE_CUES.flatMap((cue) => findFlashes(samples, cue));
  const d = baseline && baseline.n > 0 ? deltaFrom(baseline, { mean, flashes, upper: "Neutral", lower: "Neutral" }) : mean;
  return { mean, flashes, upper: upperZone(d), lower: lowerZone(d) };
}

export function facePhrase(m: MicroMeasures, baseline: MicroBaseline): string {
  const d = baseline.n > 0 ? deltaFrom(baseline, m) : m.mean;
  const hit = FACE_CUES.filter((cue) => d[cue] > 0.08 || m.flashes.some((f) => f.cue === cue));
  const micros = m.flashes.filter((f) => f.micro).length;
  const names = hit.map((cue) => CUE_CAPTION[cue]);
  const pair = `Upper ${upperZone(d).toLowerCase()}, lower ${lowerZone(d).toLowerCase()}`;
  if (!names.length) return pair;
  const flash = micros ? ` · ${micros} micro` : "";
  return `${names.join(" · ")} · ${pair}${flash}`;
}

function lumaAt(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  const i = (y * w + x) * 4;
  return 0.3 * (data[i] ?? 0) + 0.59 * (data[i + 1] ?? 0) + 0.11 * (data[i + 2] ?? 0);
}

/** Close frontal face. Each cue is 0–1 from the chart, not an emotion label. */
export function readFace(data: Uint8ClampedArray, w: number, h: number): Record<FaceCue, number> {
  const cues = emptyCues();
  const band = (x0: number, y0: number, x1: number, y1: number) => {
    const xa = Math.max(0, Math.floor(x0));
    const ya = Math.max(0, Math.floor(y0));
    const xb = Math.min(w - 1, Math.ceil(x1));
    const yb = Math.min(h - 1, Math.ceil(y1));
    let dark = 0;
    let darkY = 0;
    let brightRows = 0;
    let grad = 0;
    let gradN = 0;
    let n = 0;
    const rowDark: number[] = [];
    for (let y = ya; y <= yb; y++) {
      let row = 0;
      let prev = lumaAt(data, w, xa, y);
      for (let x = xa; x <= xb; x++) {
        const luma = lumaAt(data, w, x, y);
        n += 1;
        if (luma < 90) {
          dark += 1;
          darkY += y;
          row += 1;
        }
        grad += Math.abs(luma - prev);
        gradN += 1;
        prev = luma;
      }
      rowDark.push(row);
      if (row > (xb - xa) * 0.25) brightRows += 0;
      if (row < (xb - xa) * 0.15 && row > 2) brightRows += 1;
    }
    return {
      darkFrac: dark / Math.max(1, n),
      darkY: dark ? darkY / dark : (ya + yb) / 2,
      openFrac: brightRows / Math.max(1, yb - ya),
      crease: gradN ? grad / gradN / 255 : 0,
      height: Math.max(1, yb - ya),
      top: ya,
    };
  };

  const leftEye = band(w * 0.22, h * 0.32, w * 0.46, h * 0.48);
  const rightEye = band(w * 0.54, h * 0.32, w * 0.78, h * 0.48);
  const brows = band(w * 0.22, h * 0.18, w * 0.78, h * 0.34);
  const nose = band(w * 0.4, h * 0.46, w * 0.6, h * 0.64);
  const mouth = band(w * 0.3, h * 0.64, w * 0.7, h * 0.86);

  cues.lidRaise = 1 - (leftEye.darkFrac + rightEye.darkFrac) / 2;
  const browFromEye = (brows.top + brows.height - brows.darkY) / brows.height;
  cues.browUp = Math.max(0, Math.min(1, browFromEye));
  cues.browDown = Math.max(0, Math.min(1, 1 - browFromEye));
  cues.noseWrinkle = Math.max(0, Math.min(1, nose.crease * 4));
  cues.cheekRaise = Math.max(0, Math.min(1, (band(w * 0.12, h * 0.48, w * 0.32, h * 0.64).darkFrac + band(w * 0.68, h * 0.48, w * 0.88, h * 0.64).darkFrac) * 3));

  let leftX = w;
  let rightX = 0;
  let leftY = 0;
  let rightY = 0;
  let midY = 0;
  let midN = 0;
  let darkRows = 0;
  const ya = Math.floor(h * 0.64);
  const yb = Math.min(h - 1, Math.ceil(h * 0.86));
  const xa = Math.floor(w * 0.3);
  const xb = Math.min(w - 1, Math.ceil(w * 0.7));
  const mid = (xa + xb) / 2;
  for (let y = ya; y <= yb; y++) {
    let row = 0;
    for (let x = xa; x <= xb; x++) {
      if (lumaAt(data, w, x, y) > 80) continue;
      row += 1;
      if (x < leftX) {
        leftX = x;
        leftY = y;
      }
      if (x > rightX) {
        rightX = x;
        rightY = y;
      }
      if (Math.abs(x - mid) < (xb - xa) * 0.12) {
        midY += y;
        midN += 1;
      }
    }
    if (row > 4) darkRows += 1;
  }
  const mouthH = Math.max(1, yb - ya);
  const mouthW = Math.max(1, xb - xa);
  const width = rightX > leftX ? (rightX - leftX) / mouthW : 0;
  const open = darkRows / mouthH;
  const centerY = midN ? midY / midN : (ya + yb) / 2;
  const cornerDelta = ((leftY + rightY) / 2 - centerY) / mouthH;
  cues.jawForward = Math.max(0, Math.min(1, width));
  cues.lipPress = Math.max(0, Math.min(1, width * (1 - open)));
  cues.jawDrop = Math.max(0, Math.min(1, open));
  cues.cornerDown = Math.max(0, Math.min(1, cornerDelta + 0.5));
  cues.smile = Math.max(0, Math.min(1, -cornerDelta));
  cues.upperLip = Math.max(0, Math.min(1, mouth.darkFrac * 2));
  cues.lipStretch = Math.max(0, Math.min(1, width * open));
  return cues;
}
