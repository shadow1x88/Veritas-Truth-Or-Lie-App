import { BOOST_KEYS, type BoostKey } from "./vector";

function row(over: Partial<Record<BoostKey, number>>): number[] {
  return BOOST_KEYS.map((key) => over[key] ?? 0);
}

function noise(base: number[], amount: number, salt: number): number[] {
  return base.map((v, i) => v + Math.sin(salt * 12.9898 + i * 78.233) * amount);
}

/**
 * Starting booster, in baseline-change units.
 * A squint or a laugh alone is labeled both ways, so one of those cannot
 * decide. Someone holding a straight face and still leaking on the eyes,
 * the wait, or the voice is a lie.
 */
export function priorSet(): { x: number[][]; y: number[] } {
  const x: number[][] = [];
  const y: number[] = [];
  const calm = row({});
  const eyes = row({ pupil: 1.5, pupilAuc: 1.6, lookAway: 0.8, pitch: 1.1 });
  const voice = row({ pitch: 1.3, jitter: 0.8, energy: 0.7 });
  const both = row({ pupilAuc: 1.3, pitch: 0.9, pupil: 1.1 });
  const pupilOnly = row({ pupilAuc: 1.6, pupil: 1.4 });
  const pitchOnly = row({ pitch: 1.4 });
  const froze = row({ latency: 1.9 });
  const pauseOnly = row({ pause: 1.4, gap: 0.6 });
  const squint = row({ browDown: 1 });
  const laugh = row({ smile: 1, cheekRaise: 0.8 });
  const oneWobble = row({ pitch: 0.35 });
  const patterns: [number[], number][] = [
    [calm, 0],
    [eyes, 1],
    [voice, 1],
    [both, 1],
    [pupilOnly, 1],
    [pitchOnly, 1],
    [froze, 0],
    [pauseOnly, 0],
    [squint, 0],
    [laugh, 0],
    [oneWobble, 0],
  ];
  for (let i = 0; i < 14; i++) {
    for (const [base, label] of patterns) {
      x.push(noise(base, 0.06, i * 17 + x.length));
      y.push(label < 0 ? i % 2 : label);
    }
  }
  return { x, y };
}