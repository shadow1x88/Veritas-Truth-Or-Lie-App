import { createServerFn } from "@tanstack/react-start";
import { priorSet } from "./prior";
import { BOOST_KEYS } from "./vector";

const PRIOR_KIND = "prior-z5";
const MARKED_KIND = "marked-z3";
const MIN_MARKS = 8;

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function asVector(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length !== BOOST_KEYS.length) return null;
  return input.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0));
}

async function booster() {
  const { XGBModel } = await import("@wlearn/xgboost");
  return XGBModel;
}

async function fitRows(x: number[][], y: number[]) {
  const XGBModel = await booster();
  const model = await XGBModel.create({
    objective: "binary:logistic",
    max_depth: 3,
    eta: 0.25,
    numRound: 40,
    lambda: 2,
    subsample: 0.9,
  });
  model.fit(x, y);
  return model;
}

async function loadModel(kind: "prior" | "marked") {
  const db = await sql();
  const id = kind === "prior" ? 1 : 2;
  const expected = kind === "prior" ? PRIOR_KIND : MARKED_KIND;
  const rows = await db<{ model: string; kind: string }>`
    select model, kind from veritas_model where id = ${id}
  `;
  const saved = rows[0];
  if (!saved || saved.kind !== expected) return null;
  const XGBModel = await booster();
  return XGBModel.load(Buffer.from(saved.model, "base64"));
}

async function saveModel(kind: "prior" | "marked", bytes: Uint8Array, samples: number) {
  const db = await sql();
  const id = kind === "prior" ? 1 : 2;
  const kindName = kind === "prior" ? PRIOR_KIND : MARKED_KIND;
  const model = Buffer.from(bytes).toString("base64");
  await db`
    insert into veritas_model (id, updated_at, samples, kind, model)
    values (${id}, now(), ${samples}, ${kindName}, ${model})
    on conflict (id) do update set
      updated_at = now(),
      samples = ${samples},
      kind = ${kindName},
      model = ${model}
  `;
}

async function readyModel() {
  const marked = await loadModel("marked");
  if (marked) return marked;
  const prior = await loadModel("prior");
  if (prior) return prior;
  const set = priorSet();
  const model = await fitRows(set.x, set.y);
  await saveModel("prior", model.save(), 0);
  return model;
}

function lieProbability(model: { predictProba: (x: number[][]) => Float64Array }, vector: number[]): number {
  const probs = model.predictProba([vector]);
  if (probs.length === 1) return probs[0] ?? 0.5;
  return probs[probs.length - 1] ?? probs[0] ?? 0.5;
}

export const recordAnswer = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Bad round");
    const o = input as Record<string, unknown>;
    const features = asVector(o.features);
    if (!features) throw new Error("Bad feature row");
    if (o.call !== "TRUTH" && o.call !== "LIE") throw new Error("Bad call");
    if (typeof o.question !== "string") throw new Error("Bad question");
    const confidence = typeof o.confidence === "number" ? o.confidence : 0.5;
    return {
      features,
      call: o.call as "TRUTH" | "LIE",
      question: o.question.slice(0, 400),
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  })
  .handler(async ({ data }) => {
    let probability = data.confidence;
    let call = data.call;
    try {
      const model = await readyModel();
      probability = lieProbability(model, data.features);
      if (data.call === "LIE" && probability >= 0.35) {
        call = "LIE";
        probability = Math.max(probability, 0.56);
      } else {
        call = probability > 0.5 ? "LIE" : "TRUTH";
      }
    } catch {
      /* the row is still stored, on the call the phone already made */
    }
    const id = crypto.randomUUID();
    const db = await sql();
    await db`
      insert into veritas_rounds (id, question, call, confidence, features)
      values (${id}, ${data.question}, ${call}, ${probability}, ${JSON.stringify(data.features)}::jsonb)
    `;
    return { id, call, probability };
  });

export const markAnswer = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Bad mark");
    const o = input as Record<string, unknown>;
    if (typeof o.id !== "string" || (o.mark !== "right" && o.mark !== "wrong")) throw new Error("Bad mark");
    return { id: o.id, mark: o.mark as "right" | "wrong" };
  })
  .handler(async ({ data }) => {
    const db = await sql();
    const found = await db<{ call: string }>`select call from veritas_rounds where id = ${data.id}`;
    const call = found[0]?.call;
    if (call !== "TRUTH" && call !== "LIE") return { stored: false, trained: 0 };
    const label = (call === "LIE") === (data.mark === "right") ? 1 : 0;
    await db`
      update veritas_rounds set mark = ${data.mark}, label = ${label} where id = ${data.id}
    `;
    const marked = await db<{ features: unknown; label: number }>`
      select features, label from veritas_rounds where label is not null
    `;
    if (marked.length < MIN_MARKS) return { stored: true, trained: marked.length };
    const x: number[][] = [];
    const y: number[] = [];
    for (const row of marked) {
      const raw = typeof row.features === "string" ? JSON.parse(row.features) : row.features;
      const vector = asVector(raw);
      if (!vector || (row.label !== 0 && row.label !== 1)) continue;
      x.push(vector);
      y.push(row.label);
    }
    if (x.length < MIN_MARKS || new Set(y).size < 2) return { stored: true, trained: x.length };
    const model = await fitRows(x, y);
    await saveModel("marked", model.save(), x.length);
    return { stored: true, trained: x.length };
  });
