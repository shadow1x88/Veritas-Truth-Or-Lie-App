import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findFlashes, lowerZone, measureFace, upperZone, type FaceCue, type FaceSample } from "./micro.ts";

function cues(over: Partial<Record<FaceCue, number>>): FaceSample["cues"] {
  return {
    lidRaise: 0,
    browUp: 0,
    browDown: 0,
    noseWrinkle: 0,
    cheekRaise: 0,
    jawForward: 0,
    lipPress: 0,
    cornerDown: 0,
    jawDrop: 0,
    smile: 0,
    upperLip: 0,
    lipStretch: 0,
    ...over,
  };
}

function flat(ms: number, over: Partial<Record<FaceCue, number>>): FaceSample[] {
  const out: FaceSample[] = [];
  for (let t = 0; t <= ms; t += 16) out.push({ t, cues: cues(over) });
  return out;
}

describe("chart zones", () => {
  it("reads the captions as upper and lower, and keeps a mismatch", () => {
    assert.equal(upperZone(cues({ lidRaise: 0.2 })), "Fear");
    assert.equal(upperZone(cues({ browUp: 0.2 })), "Sadness");
    assert.equal(upperZone(cues({ lidRaise: 0.2, browUp: 0.2 })), "Surprise");
    assert.equal(upperZone(cues({ noseWrinkle: 0.2 })), "Disgust");
    assert.equal(lowerZone(cues({ lipPress: 0.2 })), "Anger");
    assert.equal(lowerZone(cues({ jawForward: 0.2 })), "Anger");
    assert.equal(lowerZone(cues({ cornerDown: 0.2 })), "Sadness");
    const mixed = measureFace(flat(400, { browUp: 0.3, smile: 0.3 }));
    assert.equal(mixed.upper, "Sadness");
    assert.equal(mixed.lower, "Joy");
  });
});

describe("micros", () => {
  it("marks a flash that returns inside 500 ms as a micro and a long one as held", () => {
    const micro: FaceSample[] = [];
    for (let t = 0; t <= 800; t += 16) {
      const on = t >= 200 && t <= 400;
      micro.push({ t, cues: cues({ lipPress: on ? 0.5 : 0 }) });
    }
    const flashes = findFlashes(micro, "lipPress");
    assert.equal(flashes.length, 1);
    assert.equal(flashes[0]!.micro, true);
    const held: FaceSample[] = [];
    for (let t = 0; t <= 900; t += 16) {
      held.push({ t, cues: cues({ lipPress: t >= 100 ? 0.5 : 0 }) });
    }
    const long = findFlashes(held, "lipPress");
    assert.equal(long.length, 1);
    assert.equal(long[0]!.micro, false);
  });
});
