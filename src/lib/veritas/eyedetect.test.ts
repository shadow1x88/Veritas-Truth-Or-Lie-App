import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addEyeBaseline,
  emptyEyeBaseline,
  findFixations,
  measureStatement,
  pupilArea,
  pupilMillimeters,
  readEyes,
  scoreEyeDetect,
  type GazeSample,
} from "./eyedetect.ts";

function sample(t: number, pupil: number, x = 0, y = 0, blink = false): GazeSample {
  return { t, xDeg: x, yDeg: y, pupilMm: pupil, blink };
}

describe("pupil area", () => {
  it("sums the rise above the low point at a 60 Hz equivalent", () => {
    const flat = [0, 16, 32, 48, 64].map((t) => sample(t, 4));
    assert.equal(pupilArea(flat, 0), 0);
    const rise = [0, 16, 32, 48, 64].map((t, i) => sample(t, 4 + i * 0.05));
    const area = pupilArea(rise, 0);
    assert.ok(area != null && area > 0);
  });
});

describe("fixations", () => {
  it("starts after 100 ms inside half a degree and drops a fixation longer than a second", () => {
    const held: GazeSample[] = [];
    for (let t = 0; t <= 200; t += 16) held.push(sample(t, 4, 0, 0));
    const found = findFixations(held);
    assert.equal(found.length, 1);
    const long: GazeSample[] = [];
    for (let t = 0; t <= 1200; t += 16) long.push(sample(t, 4, 0, 0));
    assert.equal(findFixations(long).length, 0);
  });

  it("ends when the eye stays more than a degree off", () => {
    const points: GazeSample[] = [];
    for (let t = 0; t <= 180; t += 16) points.push(sample(t, 4, 0, 0));
    for (let t = 196; t <= 280; t += 16) points.push(sample(t, 4, 3, 0));
    const found = findFixations(points);
    assert.equal(found.length, 1);
    assert.ok(found[0]!.t1 < 196);
  });
});

describe("statement", () => {
  it("counts a first pass on the question and a re-read after leaving it", () => {
    const points: GazeSample[] = [];
    for (let t = 0; t <= 200; t += 16) points.push(sample(t, 3.5 + t * 0.001, 0, 0));
    for (let t = 216; t <= 360; t += 16) points.push(sample(t, 4, 40, 0));
    for (let t = 376; t <= 560; t += 16) points.push(sample(t, 4, 0, 0));
    const measures = measureStatement({ samples: points, onset: 0, responseAt: 560, characters: 20 });
    assert.ok((measures.firstPassMsPerChar ?? 0) > 0);
    assert.ok((measures.secondPassMsPerChar ?? 0) > 0);
    assert.equal(pupilMillimeters(8, 16), 5.85);
  });
});

describe("logistic", () => {
  it("uses the printed equation: a bigger pupil than baseline raises Pr(deceptive)", () => {
    const calm = measureStatement({
      samples: [0, 16, 32, 48, 64, 80].map((t) => sample(t, 4, 0, 0)),
      onset: 0,
      responseAt: 800,
      characters: 10,
    });
    let base = emptyEyeBaseline();
    base = addEyeBaseline(base, calm);
    const loaded = { ...calm, pupilAuc: (calm.pupilAuc ?? 0) + 0.2 };
    const lie = scoreEyeDetect(loaded, base);
    const same = scoreEyeDetect(calm, base);
    assert.ok(lie.probability != null && same.probability != null);
    assert.ok(lie.probability > same.probability);
    assert.equal(lie.call, "LIE");
  });
});

describe("iris scale", () => {
  it("reads a drawn pupil in millimeters", () => {
    const w = 80;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 250;
      data[i + 1] = 250;
      data[i + 2] = 250;
      data[i + 3] = 255;
    }
    const paint = (cx: number, cy: number, r: number, shade: number) => {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const i = (y * w + x) * 4;
          data[i] = shade;
          data[i + 1] = shade;
          data[i + 2] = shade;
        }
      }
    };
    paint(24, 13, 6, 90);
    paint(24, 13, 3, 8);
    const eye = readEyes(data, w, h);
    assert.ok(eye.pupilMm != null);
    assert.ok(Math.abs(eye.pupilMm - 5.85) < 1.5);
  });
});
