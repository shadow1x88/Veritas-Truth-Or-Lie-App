import { useEffect, useRef, useState } from "react";
import { ANCHORS, drawQuestions, rememberQuestions } from "@/lib/questions";
import { addBaseline, emptyBaseline, scoreAnswer } from "@/lib/veritas/model";
import { addEyeBaseline, emptyEyeBaseline, eyeDelta, scoreEyeDetect } from "@/lib/veritas/eyedetect";
import { addMicroBaseline, emptyMicroBaseline, faceDelta, facePhrase } from "@/lib/veritas/micro";
import { recordAnswer } from "@/lib/veritas/rounds";
import { buildVector } from "@/lib/veritas/vector";
import type { BaselineModel, VeritasScore } from "@/lib/veritas/types";
import { useSensors } from "@/lib/veritas/use-sensors";
import { hushAmara, speakAmara } from "@/lib/veritas/amara";
import { CapturePanel } from "./capture-panel";
import { Button, Screen, TopBar } from "./ui";
import { VerdictCard } from "./verdict-card";

type Step =
  | { t: "setup" }
  | { t: "ask"; index: number }
  | { t: "baseline"; index: number; note: string }
  | {
      t: "verdict";
      index: number;
      score: VeritasScore;
      narration: string;
      source: "analyst" | "ensemble";
      transcript: string;
      roundId: string | null;
    }
  | { t: "dossier" };

interface Row {
  question: string;
  call: "TRUTH" | "LIE" | "BASELINE";
  narration?: string;
  transcript: string;
  mark?: "right" | "wrong";
}

function shuffle<T>(list: T[]): T[] {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
  }
  return next;
}

function makeRound(): string[] {
  return [...shuffle(ANCHORS).slice(0, 3), ...drawQuestions("messy", 7)];
}

export function SoloView({ onExit }: { onExit: () => void }) {
  const sensors = useSensors();
  const name = "";
  const [questions, setQuestions] = useState<string[]>(makeRound);
  const [step, setStep] = useState<Step>({ t: "ask", index: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const baselineRef = useRef<BaselineModel>(emptyBaseline());
  const eyeBaseRef = useRef(emptyEyeBaseline());
  const microBaseRef = useRef(emptyMicroBaseline());
  const shownAt = useRef(0);
  const latencyRef = useRef<number | null>(null);
  const watchRef = useRef(sensors.watchStatement);
  watchRef.current = sensors.watchStatement;
  const index = step.t === "ask" || step.t === "baseline" || step.t === "verdict" ? step.index : 0;

  const started = useRef(false);
  const gen = useRef(0);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const mine = ++gen.current;
    rememberQuestions(questions.slice(3));
    speakAmara(questions[0] ?? "");
    void arm(mine);
  }, []);

  useEffect(() => {
    shownAt.current = performance.now();
    latencyRef.current = null;
    setTyped("");
    setHint(null);
    if (step.t === "ask") watchRef.current(questions[index] ?? "");
  }, [index, step.t, questions]);

  const indexRef = useRef(0);
  indexRef.current = index;

  async function arm(mine: number) {
    const ok = await sensors.arm("face");
    if (mine !== gen.current) return;
    if (ok || indexRef.current > 0) return;
    const voice = await sensors.arm("voice");
    if (mine !== gen.current || indexRef.current > 0) return;
    if (!voice) await sensors.arm("off");
  }

  function begin() {
    const mine = ++gen.current;
    const round = makeRound();
    rememberQuestions(round.slice(3));
    baselineRef.current = emptyBaseline();
    eyeBaseRef.current = emptyEyeBaseline();
    microBaseRef.current = emptyMicroBaseline();
    setRows([]);
    setTyped("");
    setHint(null);
    setQuestions(round);
    setStep({ t: "ask", index: 0 });
    speakAmara(round[0] ?? "");
    void arm(mine);
  }

  async function onToggle() {
    if (!sensors.recording) {
      hushAmara();
      if (latencyRef.current == null) latencyRef.current = performance.now() - shownAt.current;
      sensors.start();
      setHint(null);
      return;
    }
    const result = sensors.finish(latencyRef.current ?? 0, typed);
    if (!result) {
      setHint("Once more.");
      return;
    }
    const transcript = result.transcript || typed;
    if (!result.heard && !transcript) {
      setHint("Once more.");
      return;
    }
    const question = questions[index] ?? "";
    if (index < 3) {
      baselineRef.current = addBaseline(baselineRef.current, result.features);
      if (result.eye) eyeBaseRef.current = addEyeBaseline(eyeBaseRef.current, result.eye);
      if (result.micro) microBaseRef.current = addMicroBaseline(microBaseRef.current, result.micro);
      setRows((prev) => [...prev, { question, call: "BASELINE", transcript }]);
      const next = index + 1;
      setStep({ t: "ask", index: next });
      speakAmara(questions[next] ?? "");
      return;
    }
    let score: VeritasScore;
    try {
      score = scoreAnswer(baselineRef.current, result.features);
      const odt = result.eye ? scoreEyeDetect(result.eye, eyeBaseRef.current) : null;
      if (odt?.probability != null && odt.probability >= 0.58) {
        score.lieProbability = Math.max(score.lieProbability, odt.probability);
        score.call = "LIE";
        score.confidence = Math.max(score.confidence, odt.probability);
      }
      if (odt?.probability != null) {
        score.tells = [
          {
            id: "pupil",
            label: "Eyes",
            phrase: `EyeDetect ${Math.round(odt.probability * 100)}% deceptive`,
            z: (odt.probability - 0.5) * 4,
            push: Math.max(0, (odt.probability - 0.5) * 2),
          },
          ...score.tells.filter((tell) => tell.id !== "pupil"),
        ];
      }
      if (result.micro && microBaseRef.current.n > 0) {
        score.tells = [
          {
            id: "face",
            label: "Face",
            phrase: facePhrase(result.micro, microBaseRef.current),
            z: result.micro.flashes.some((f) => f.micro) ? 1.2 : 0.4,
            push: result.micro.flashes.length ? 0.5 : 0.2,
          },
          ...score.tells,
        ];
      }
    } catch {
      setHint("That read failed. Answer it once more.");
      return;
    }
    const narration = "";
    setRows((prev) => [...prev, { question, call: score.call, narration, transcript }]);
    setStep({ t: "verdict", index, score, narration, source: "ensemble", transcript, roundId: null });

    const asked = index;
    const eye = result.eye ? eyeDelta(result.eye, eyeBaseRef.current) : null;
    const face = result.micro && microBaseRef.current.n > 0 ? faceDelta(result.micro, microBaseRef.current) : null;
    const features = buildVector({
      channels: score.channels,
      eye,
      face,
      micros: result.micro?.flashes.filter((f) => f.micro).length ?? null,
    });
    void recordAnswer({
      data: { features, call: score.call, question, confidence: score.confidence },
    })
      .then((saved) => {
        if (
          (saved.call !== "TRUTH" && saved.call !== "LIE") ||
          typeof saved.probability !== "number" ||
          !Number.isFinite(saved.probability) ||
          typeof saved.id !== "string"
        ) {
          return;
        }
        setRows((prev) => prev.map((row) => (row.question === question ? { ...row, call: saved.call } : row)));
        setStep((current) => {
          if (current.t !== "verdict" || current.index !== asked) return current;
          const confidence = saved.call === "LIE" ? saved.probability : 1 - saved.probability;
          return {
            ...current,
            roundId: saved.id,
            score: { ...current.score, call: saved.call, lieProbability: saved.probability, confidence },
          };
        });
      })
      .catch(() => {
        /* the call on screen stands */
      });
  }

  function advance() {
    const next = index + 1;
    if (next >= questions.length) {
      hushAmara();
      setStep({ t: "dossier" });
      return;
    }
    setStep({ t: "ask", index: next });
    speakAmara(questions[next] ?? "");
  }

  function leave() {
    hushAmara();
    onExit();
  }

  const scored = rows.filter((r) => r.call !== "BASELINE");
  const called = scored.filter((r) => r.call === "LIE").length;

  if (step.t === "ask") {
    return (
      <CapturePanel
        withAmara
        sensors={sensors}
        eyebrow=""
        question={questions[index] ?? ""}
        index={index}
        total={10}
        typed={typed}
        onTyped={setTyped}
        hint={hint}
        onToggle={() => void onToggle()}
        onBack={leave}
        onReplay={() => speakAmara(questions[index] ?? "")}
      />
    );
  }

  return (
    <Screen>
      {step.t === "verdict" ? (
        <div className="flex flex-1 flex-col">
          <TopBar onBack={leave} />
          <VerdictCard
            score={step.score}
            narration={step.narration}
            source={step.source}
            question={questions[step.index] ?? ""}
            transcript={step.transcript}
            player={name.trim() || undefined}
            onNext={advance}
            nextLabel={step.index === questions.length - 1 ? "Finish" : "Next"}
          />
        </div>
      ) : null}

      {step.t === "dossier" ? (
        <div className="flex flex-1 flex-col">
          <TopBar onBack={leave} />
          <h2 className="mt-2 font-display text-4xl">
            {scored.length ? `She called ${called} false.` : "That's the round."}
          </h2>
          <ul className="mt-6 flex flex-col gap-3">
            {scored.map((row) => (
              <li key={row.question} className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">{row.question}</p>
                  <span className={row.call === "LIE" ? "text-sm text-lie" : "text-sm text-brass"}>
                    {row.call === "LIE" ? "FALSE" : "TRUE"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <Button className="mt-6" full onClick={() => void begin()}>
            Again
          </Button>
        </div>
      ) : null}
    </Screen>
  );
}
