import type { FeatureSet } from "./types";

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

/** YIN-style pitch on a short frame. Returns Hz or null if unvoiced. */
export function estimatePitch(frame: Float32Array, sampleRate: number): number | null {
  const factor = 3;
  const n = Math.floor(frame.length / factor);
  if (n < 64) return null;
  const rate = sampleRate / factor;
  let energy = 0;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = frame[i * factor] ?? 0;
    buf[i] = v;
    energy += v * v;
  }
  if (Math.sqrt(energy / n) < 0.012) return null;

  const minLag = Math.max(2, Math.floor(rate / 420));
  const maxLag = Math.min(n - 2, Math.floor(rate / 75));
  const diff = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    const limit = n - tau;
    for (let i = 0; i < limit; i += 2) {
      const d = buf[i]! - buf[i + tau]!;
      sum += d * d;
    }
    diff[tau] = sum;
  }
  let run = 0;
  let bestLag = -1;
  let best = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += diff[tau]!;
    const cmnd = (diff[tau]! * tau) / (run || 1);
    if (tau >= minLag && cmnd < 0.2 && cmnd < best) {
      best = cmnd;
      bestLag = tau;
    }
  }
  if (bestLag < 0) return null;
  const hz = rate / bestLag;
  if (hz < 70 || hz > 460) return null;
  return hz;
}

export function spectralCentroid(frame: Float32Array, sampleRate: number): number {
  const N = 48;
  let num = 0;
  let den = 0;
  for (let k = 1; k < N / 2; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const x = frame[n] ?? 0;
      const ang = (2 * Math.PI * k * n) / N;
      re += x * Math.cos(ang);
      im -= x * Math.sin(ang);
    }
    const mag = Math.hypot(re, im);
    num += (k * sampleRate) / N * mag;
    den += mag;
  }
  return den > 0 ? num / den : 0;
}

const HEDGES = new Set([
  "honestly",
  "basically",
  "actually",
  "kinda",
  "kind",
  "sorta",
  "maybe",
  "probably",
  "guess",
  "literally",
  "obviously",
  "whatever",
]);
const FILLS = new Set(["um", "uh", "er", "erm", "hmm", "uhh", "umm", "ah"]);
const HEDGE_PHRASES = ["kind of", "sort of", "i mean", "you know", "i swear", "to be honest", "not gonna lie"];

export function linguistic(text: string): { hedge: number; fill: number } | null {
  const words = text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return null;
  let h = 0;
  let f = 0;
  for (const w of words) {
    if (HEDGES.has(w)) h += 1;
    if (FILLS.has(w)) f += 1;
  }
  const blob = words.join(" ");
  for (const p of HEDGE_PHRASES) {
    if (blob.includes(p)) h += 1;
  }
  return { hedge: h / words.length, fill: f / words.length };
}

export interface VideoSample {
  t: number;
  cheekRG: number;
  pupil: number;
  green: number;
  dental: number | null;
  finger: number | null;
}

export interface CaptureAccum {
  pitches: number[];
  rms: number[];
  centroids: number[];
  video: VideoSample[];
  voicedOnsets: number;
  lastVoiced: boolean;
  lastOnsetAt: number;
}

export function emptyAccum(): CaptureAccum {
  return {
    pitches: [],
    rms: [],
    centroids: [],
    video: [],
    voicedOnsets: 0,
    lastVoiced: false,
    lastOnsetAt: -1,
  };
}

const VOICE_RMS = 0.018;

export function pushAudio(acc: CaptureAccum, frame: Float32Array, sampleRate: number, nowMs: number) {
  let e = 0;
  for (let i = 0; i < frame.length; i++) e += frame[i]! * frame[i]!;
  const rms = Math.sqrt(e / frame.length);
  acc.rms.push(rms);
  const voiced = rms >= VOICE_RMS;
  if (voiced && !acc.lastVoiced && nowMs - acc.lastOnsetAt > 120) {
    acc.voicedOnsets += 1;
    acc.lastOnsetAt = nowMs;
  }
  acc.lastVoiced = voiced;
  if (voiced) {
    const pitch = estimatePitch(frame, sampleRate);
    if (pitch) acc.pitches.push(pitch);
  }
  if (acc.rms.length % 2 === 0) acc.centroids.push(spectralCentroid(frame, sampleRate));
}

export function sampleFrame(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  mode: "face" | "finger",
  t: number,
): VideoSample {
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let dark = 0;
    let n = 0;
    const xa = Math.max(0, Math.floor(x0));
    const ya = Math.max(0, Math.floor(y0));
    const xb = Math.min(w, Math.ceil(x1));
    const yb = Math.min(h, Math.ceil(y1));
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * w + x) * 4;
        const pr = data[i] ?? 0;
        const pg = data[i + 1] ?? 0;
        const pb = data[i + 2] ?? 0;
        r += pr;
        g += pg;
        b += pb;
        const luma = 0.3 * pr + 0.5 * pg + 0.2 * pb;
        if (luma < 48) dark += 1;
        n += 1;
      }
    }
    return { r: r / (n || 1), g: g / (n || 1), b: b / (n || 1), dark: dark / (n || 1) };
  };

  if (mode === "finger") {
    const c = box(w * 0.3, h * 0.3, w * 0.7, h * 0.7);
    return { t, cheekRG: 0, pupil: 0, green: c.g, dental: null, finger: c.r };
  }

  const eye = box(w * 0.22, h * 0.12, w * 0.78, h * 0.42);
  const cheekL = box(w * 0.08, h * 0.4, w * 0.4, h * 0.72);
  const cheekR = box(w * 0.6, h * 0.4, w * 0.92, h * 0.72);
  const cheekRmean = (cheekL.r + cheekR.r) / 2;
  const cheekG = (cheekL.g + cheekR.g) / 2;
  const cheekDark = (cheekL.dark + cheekR.dark) / 2;
  const cheekRG = (cheekRmean - cheekG) / (cheekRmean + cheekG + 1);
  const pupil = eye.dark - cheekDark;

  let dentalSum = 0;
  let dentalN = 0;
  for (let i = 0; i < data.length; i += 16) {
    const pr = data[i] ?? 0;
    const pg = data[i + 1] ?? 0;
    const pb = data[i + 2] ?? 0;
    if (pr > 200 && pg > 188 && pb > 176 && Math.abs(pr - pg) < 28) {
      dentalSum += pr;
      dentalN += 1;
    }
  }
  return {
    t,
    cheekRG,
    pupil,
    green: cheekG,
    dental: dentalN >= 6 ? dentalSum / dentalN : null,
    finger: null,
  };
}

export function dominantBpm(times: number[], values: number[]): { bpm: number; amp: number } | null {
  const n = values.length;
  if (n < 16) return null;
  const dur = (times[n - 1]! - times[0]!) / 1000;
  if (dur < 3.2) return null;
  const fs = 30;
  const m = Math.floor(dur * fs);
  if (m < 48 || m > 2000) return null;
  const sig = new Float32Array(m);
  let j = 0;
  for (let i = 0; i < m; i++) {
    const want = times[0]! + (i / fs) * 1000;
    while (j < n - 2 && times[j + 1]! < want) j += 1;
    const t0 = times[j]!;
    const t1 = times[j + 1] ?? t0 + 1;
    const u = t1 === t0 ? 0 : (want - t0) / (t1 - t0);
    sig[i] = values[j]! * (1 - u) + (values[j + 1] ?? values[j]!) * u;
  }
  let mean = 0;
  for (let i = 0; i < m; i++) mean += sig[i]!;
  mean /= m;
  let energy = 0;
  for (let i = 0; i < m; i++) {
    sig[i] = sig[i]! - mean;
    energy += sig[i]! * sig[i]!;
  }
  if (energy < 1e-4) return null;
  const minLag = Math.floor((fs * 60) / 168);
  const maxLag = Math.min(m - 2, Math.floor((fs * 60) / 48));
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < m - lag; i++) c += sig[i]! * sig[i + lag]!;
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  if (best / energy < 0.12) return null;
  let v = 0;
  for (let i = 0; i < m; i++) v += sig[i]! * sig[i]!;
  return { bpm: (60 * fs) / bestLag, amp: Math.sqrt(v / m) };
}

export function summarize(args: {
  acc: CaptureAccum;
  durationMs: number;
  transcript: string;
  latencyMs: number;
  tremor: number;
  mode: "face" | "finger" | "voice" | "off";
}): FeatureSet {
  const { acc, durationMs, transcript, latencyMs, tremor, mode } = args;
  const features: FeatureSet = {};
  const seconds = Math.max(0.4, durationMs / 1000);
  const pitch = median(acc.pitches);
  if (pitch) features.pitch = pitch;
  if (acc.pitches.length >= 4) features.jitter = stdev(acc.pitches);

  const pauses: number[] = [];
  let run = 0;
  let pauseMs = 0;
  const frameMs = 50;
  for (const rms of acc.rms) {
    if (rms < 0.012) {
      run += 1;
    } else if (run > 0) {
      const ms = run * frameMs;
      if (ms >= 180) {
        pauses.push(ms);
        pauseMs += ms;
      }
      run = 0;
    }
  }
  if (acc.rms.length > 4 && mode !== "off") {
    features.pause = Math.min(1, pauseMs / durationMs);
    features.rate = acc.voicedOnsets / seconds;
    if (pauses.length) {
      features.gap = pauses.reduce((a, b) => a + b, 0) / pauses.length;
      const mean = features.gap;
      const variance = pauses.reduce((a, b) => a + (b - mean) ** 2, 0) / pauses.length;
      features.gapCv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    } else {
      features.gap = 80;
      features.gapCv = 0.05;
    }
    const voiced = acc.rms.filter((r) => r >= VOICE_RMS);
    const pool = voiced.length ? voiced : acc.rms;
    features.energy = pool.reduce((a, b) => a + b, 0) / pool.length;
    if (acc.centroids.length) {
      features.tone = acc.centroids.reduce((a, b) => a + b, 0) / acc.centroids.length;
    }
    let slow = acc.rms[0] ?? 0;
    const env: number[] = [];
    for (const rms of acc.rms) {
      slow = slow * 0.82 + rms * 0.18;
      env.push(slow);
    }
    if (env.length > 4) {
      const deltas: number[] = [];
      for (let i = 1; i < env.length; i++) deltas.push(Math.abs(env[i]! - env[i - 1]!));
      features.breath = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    }
  }

  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (mode === "off" && words.length && durationMs > 0) {
    features.rate = words.length / seconds;
  }
  const ling = linguistic(transcript);
  if (ling) {
    features.hedge = ling.hedge;
    features.fill = ling.fill;
  }
  if (Number.isFinite(latencyMs)) features.latency = Math.max(0, latencyMs);
  if (Number.isFinite(tremor)) features.tremor = Math.max(0, Math.min(1.5, tremor));

  if (mode !== "off" && acc.video.length >= 8) {
    const blush = median(acc.video.map((v) => v.cheekRG));
    if (mode === "face" && blush != null) features.blush = blush;
    if (mode === "face") {
      const pupil = median(acc.video.map((v) => v.pupil));
      if (pupil != null) features.pupil = pupil;
      const dentalSeries = acc.video.filter((v) => v.dental != null);
      if (dentalSeries.length >= 8) {
        const beat = dominantBpm(
          dentalSeries.map((v) => v.t),
          dentalSeries.map((v) => v.dental ?? 0),
        );
        const level = median(dentalSeries.map((v) => v.dental ?? 0));
        if (beat && level) features.dental = beat.amp / (level || 1);
        else if (level) features.dental = 0.01;
      }
    }
    const pulseSeries =
      mode === "finger"
        ? acc.video.filter((v) => v.finger != null).map((v) => ({ t: v.t, v: v.finger ?? 0 }))
        : acc.video.map((v) => ({ t: v.t, v: v.green }));
    const beat = dominantBpm(
      pulseSeries.map((p) => p.t),
      pulseSeries.map((p) => p.v),
    );
    if (beat && beat.bpm > 45 && beat.bpm < 180) features.pulse = beat.bpm;
  }

  return features;
}

/** Share of audio frames that actually contained a voice. */
export function voicedRatio(acc: CaptureAccum): number {
  if (!acc.rms.length) return 0;
  return acc.rms.filter((r) => r >= VOICE_RMS).length / acc.rms.length;
}
