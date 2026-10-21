import type { OdtMeasures } from "./eyedetect";
import { FACE_CUES, type FaceCue, type MicroMeasures } from "./micro";
import { TELL_IDS, type TellId } from "./types";

/** Column order for the booster. Do not reorder. Add new tells at the end. */
export const BOOST_KEYS = [
  ...TELL_IDS,
  "pupilAuc",
  "fixPerChar",
  "firstPass",
  "secondPass",
  "responsePerChar",
  "blinkRate",
  ...FACE_CUES,
  "micros",
  "lookAway",
] as const;

export type BoostKey = (typeof BOOST_KEYS)[number];

const FACE_SCALE = 0.12;

/**
 * Every column is a change from this person, not a raw camera number.
 * A straight face and a steady voice land near zero.
 */
export function buildVector(args: {
  channels?: Partial<Record<TellId, number>>;
  eye?: Partial<Record<keyof OdtMeasures, number>> | null;
  face?: Partial<Record<FaceCue, number>> | null;
  micros?: number | null;
}): number[] {
  const z = args.channels ?? {};
  const eye = args.eye;
  const face = args.face;
  const raw: Record<string, number | null | undefined> = {
    ...Object.fromEntries(TELL_IDS.map((id) => [id, z[id] ?? null])),
    pupilAuc: eye?.pupilAuc,
    fixPerChar: eye?.fixationsPerChar,
    firstPass: eye?.firstPassMsPerChar,
    secondPass: eye?.secondPassMsPerChar,
    responsePerChar: eye?.responseMsPerChar,
    blinkRate: eye?.blinkRate,
    lookAway: eye?.lookAway,
    micros: args.micros,
  };
  if (face) {
    for (const cue of FACE_CUES) {
      const v = face[cue];
      raw[cue] = v == null ? null : v / FACE_SCALE;
    }
  }
  return BOOST_KEYS.map((key) => {
    const v = raw[key];
    return v == null || !Number.isFinite(v) ? Number.NaN : v;
  });
}