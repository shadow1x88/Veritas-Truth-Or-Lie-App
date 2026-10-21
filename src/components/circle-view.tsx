import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCircle,
  reduceCircle,
  seatName,
  type CircleEvent,
  type CircleState,
} from "@/lib/circle";
import { useP2PRoom } from "@/lib/multiplayer/use-p2p-room";
import { suggestQuestion, type Heat } from "@/lib/questions";
import { emptyBaseline, scoreAnswer } from "@/lib/veritas/model";
import { recordAnswer } from "@/lib/veritas/rounds";
import { buildVector } from "@/lib/veritas/vector";
import { useSensors } from "@/lib/veritas/use-sensors";
import { speakAmara } from "@/lib/veritas/amara";
import { CapturePanel } from "./capture-panel";
import { Button, Field, Screen, TopBar } from "./ui";
import { VerdictCard } from "./verdict-card";

type Wire = { k: "state"; state: CircleState } | { k: "event"; event: CircleEvent };

function makeCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join("");
}

function stampFrom(event: CircleEvent, from: string): CircleEvent {
  if (event.type === "question" || event.type === "score") return { ...event, from };
  return event;
}

function isCircleState(value: unknown): value is CircleState {
  if (!value || typeof value !== "object") return false;
  const row = value as CircleState;
  return typeof row.seq === "number" && Array.isArray(row.seats) && !!row.phase;
}

export function CircleView({ onExit, start = "pick" }: { onExit: () => void; start?: "pick" | "join" }) {
  const [mode, setMode] = useState<"pick" | "phone" | "host" | "join">(start);
  const [heat, setHeat] = useState<Heat>("messy");
  const [names, setNames] = useState(["", ""]);
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [myName, setMyName] = useState("");
  const [local, setLocal] = useState<CircleState | null>(null);

  if (mode === "phone" && local) {
    return (
      <Screen>
        <LocalTable
          state={local}
          heat={heat}
          onState={setLocal}
          onLeave={() => {
            setLocal(null);
            setMode("pick");
          }}
        />
      </Screen>
    );
  }

  if ((mode === "host" || mode === "join") && code && myName.trim()) {
    return (
      <Screen>
        <NetTable
          code={code}
          name={myName.trim()}
          isHost={mode === "host"}
          heat={heat}
          onLeave={() => {
            setCode("");
            setMode("pick");
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar onBack={onExit} />
      {mode === "pick" ? (
        <>
          <h2 className="mt-2 font-display text-4xl">Circle of Truth</h2>
          <div className="mt-6 flex flex-col gap-2">
            <Button full onClick={() => setMode("phone")}>
              Pass this phone
            </Button>
            <Button kind="ghost" full onClick={() => setMode("host")}>
              Create a code
            </Button>
            <Button kind="surface" full onClick={() => setMode("join")}>
              Join with a code
            </Button>
          </div>
        </>
      ) : null}

      {mode === "phone" ? (
        <>
          <p className="text-xs tracking-widest text-brass uppercase">Who's sitting here</p>
          <div className="mt-4 flex flex-col gap-3">
            {names.map((name, i) => (
              <Field
                key={i}
                label={`Seat ${i + 1}`}
                value={name}
                placeholder="Name"
                onChange={(value) => setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)))}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              kind="ghost"
              onClick={() => setNames((prev) => (prev.length < 8 ? [...prev, ""] : prev))}
              disabled={names.length >= 8}
            >
              Add a seat
            </Button>
            {names.length > 2 ? (
              <Button kind="ghost" onClick={() => setNames((prev) => prev.slice(0, -1))}>
                Remove
              </Button>
            ) : null}
          </div>
          <p className="mt-4 text-xs tracking-widest text-muted uppercase">Heat for suggestions</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["mild", "messy", "sharp"] as Heat[]).map((id) => (
              <Button key={id} kind={heat === id ? "primary" : "ghost"} onClick={() => setHeat(id)}>
                {id}
              </Button>
            ))}
          </div>
          <Button
            className="mt-6"
            full
            disabled={names.filter((n) => n.trim()).length < 2}
            onClick={() => {
              const clean = names.map((n) => n.trim()).filter(Boolean).slice(0, 8);
              let state = createCircle("s0", clean[0] ?? "One");
              clean.slice(1).forEach((name, i) => {
                state = reduceCircle(state, { type: "seat", id: `s${i + 1}`, name });
              });
              setLocal(reduceCircle(state, { type: "start" }));
            }}
          >
            Sit down
          </Button>
        </>
      ) : null}

      {mode === "host" ? (
        <>
          <Field label="Your name" value={myName} onChange={setMyName} placeholder="Alex" />
          <Button
            className="mt-4"
            full
            disabled={!myName.trim()}
            onClick={() => setCode(makeCode())}
          >
            Open the circle
          </Button>
        </>
      ) : null}

      {mode === "join" ? (
        <>
          <Field label="Your name" value={myName} onChange={setMyName} placeholder="Jordan" />
          <div className="mt-3">
            <Field
              label="Circle code"
              value={joinCode}
              onChange={(v) => setJoinCode(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
              placeholder="K7QP"
            />
          </div>
          <Button
            className="mt-4"
            full
            disabled={!myName.trim() || joinCode.length < 4}
            onClick={() => setCode(joinCode)}
          >
            Take a seat
          </Button>
        </>
      ) : null}
    </Screen>
  );
}

function SeatRing({ state }: { state: CircleState }) {
  const asker = state.phase.t === "lobby" || state.phase.t === "done" ? "" : state.phase.askerId;
  const target = state.phase.t === "lobby" || state.phase.t === "done" ? "" : state.phase.targetId;
  return (
    <div className="relative mx-auto mt-4 h-64 w-full max-w-xs">
      {state.seats.map((seat, i) => {
        const ang = (i / state.seats.length) * Math.PI * 2 - Math.PI / 2;
        const left = 50 + Math.cos(ang) * 40;
        const top = 50 + Math.sin(ang) * 40;
        const role = seat.id === target ? "Answering" : seat.id === asker ? "Asking" : "Seat";
        return (
          <div
            key={seat.id}
            className="absolute w-20 -translate-x-1/2 -translate-y-1/2 text-center"
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            <div
              className={
                seat.id === target
                  ? "mx-auto grid size-12 place-items-center rounded-pill bg-lie text-xs font-medium text-bg"
                  : seat.id === asker
                    ? "mx-auto grid size-12 place-items-center rounded-pill bg-brass text-xs font-medium text-bg"
                    : "mx-auto grid size-12 place-items-center rounded-pill border border-line text-xs text-muted"
              }
            >
              {seat.name.slice(0, 1).toUpperCase()}
            </div>
            <p className="mt-1 truncate text-xs">{seat.name}</p>
            <p className="text-xs text-muted">{role}</p>
          </div>
        );
      })}
    </div>
  );
}

function LocalTable({
  state,
  heat,
  onState,
  onLeave,
}: {
  state: CircleState;
  heat: Heat;
  onState: (state: CircleState) => void;
  onLeave: () => void;
}) {
  return (
    <TablePlay
      state={state}
      heat={heat}
      me="all"
      onEvent={(event) => onState(reduceCircle(state, event))}
      onLeave={onLeave}
      localPass
    />
  );
}

function NetTable({
  code,
  name,
  isHost,
  heat,
  onLeave,
}: {
  code: string;
  name: string;
  isHost: boolean;
  heat: Heat;
  onLeave: () => void;
}) {
  const p2p = useP2PRoom({ room: `c${code.toLowerCase()}`, name, fast: true });
  const [state, setState] = useState<CircleState | null>(() => (isHost ? createCircle(p2p.selfId, name) : null));
  const stateRef = useRef(state);
  stateRef.current = state;

  const commit = useCallback(
    (next: CircleState) => {
      stateRef.current = next;
      setState(next);
      p2p.relay({ k: "state", state: next });
    },
    [p2p.relay],
  );

  useEffect(() => {
    return p2p.onMessage((from, data) => {
      const msg = data as Wire;
      if (!msg || typeof msg !== "object") return;
      if (msg.k === "state" && !isHost && isCircleState(msg.state)) {
        setState((prev) => (!prev || msg.state.seq >= prev.seq ? msg.state : prev));
      }
      if (msg.k === "event" && isHost && stateRef.current) {
        const next = reduceCircle(stateRef.current, stampFrom(msg.event, from));
        if (next !== stateRef.current) commit(next);
      }
    });
  }, [p2p.onMessage, isHost, commit]);

  useEffect(() => {
    if (!isHost || !stateRef.current) return;
    let next = stateRef.current;
    const ids = new Set(p2p.peers.map((p) => p.id));
    for (const peer of p2p.peers) {
      next = reduceCircle(next, { type: "seat", id: peer.id, name: peer.name || "Friend" });
    }
    if (next.phase.t === "lobby") {
      for (const seat of [...next.seats]) {
        if (seat.id !== next.hostId && !ids.has(seat.id)) next = reduceCircle(next, { type: "drop", id: seat.id });
      }
    }
    if (next !== stateRef.current) commit(next);
  }, [p2p.peers, isHost, commit]);

  useEffect(() => {
    if (!isHost) return;
    const id = window.setInterval(() => {
      if (stateRef.current) p2p.relay({ k: "state", state: stateRef.current });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isHost, p2p.relay]);

  function onEvent(event: CircleEvent) {
    if (!stateRef.current) return;
    if (isHost) {
      const next = reduceCircle(stateRef.current, event);
      if (next !== stateRef.current) commit(next);
    } else {
      p2p.relay({ k: "event", event });
    }
  }

  if (!state) {
    return (
      <>
        <TopBar onBack={onLeave} />
        <h2 className="font-display text-3xl">Taking your seat…</h2>
        <p className="mt-3 text-sm text-muted">
          {p2p.joined ? "Connected. Waiting for the host to see you." : "Opening the circle."}
        </p>
        <p className="mt-6 font-display text-5xl tracking-widest">{code}</p>
      </>
    );
  }

  return (
    <>
      <TablePlay
        state={state}
        heat={heat}
        me={p2p.selfId}
        onEvent={onEvent}
        onLeave={onLeave}
        localPass={false}
        code={code}
        canStart={isHost}
      />
    </>
  );
}

function TablePlay({
  state,
  heat,
  me,
  onEvent,
  onLeave,
  localPass,
  code,
  canStart = false,
}: {
  state: CircleState;
  heat: Heat;
  me: string;
  onEvent: (event: CircleEvent) => void;
  onLeave: () => void;
  localPass: boolean;
  code?: string;
  canStart?: boolean;
}) {
  const sensors = useSensors();
  const [draft, setDraft] = useState("");
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ round: number; id: string; call: "TRUTH" | "LIE" } | null>(null);
  const [gate, setGate] = useState(true);
  const shownAt = useRef(0);
  const latencyRef = useRef<number | null>(null);

  const phase = state.phase;
  const phaseKey =
    state.phase.t === "ask" || state.phase.t === "answer" || state.phase.t === "reveal"
      ? `${state.phase.t}-${state.phase.round}`
      : state.phase.t;

  useEffect(() => {
    if (localPass) setGate(true);
    setDraft("");
    setTyped("");
    setHint(null);
    shownAt.current = performance.now();
    latencyRef.current = null;
    if (phase.t === "answer" && (localPass || me === phase.targetId)) {
      speakAmara(phase.question);
    }
  }, [phaseKey, localPass]);

  const mine = (id: string) => localPass || me === id;

  async function onToggle() {
    if (phase.t !== "answer" || !mine(phase.targetId)) return;
    if (sensors.status === "idle") {
      let ok = await sensors.arm("face");
      if (!ok) ok = await sensors.arm("voice");
      if (!ok) await sensors.arm("off");
    }
    if (!sensors.recording) {
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
    if (!transcript.trim() && !result.heard) {
      setHint("Once more.");
      return;
    }
    const score = scoreAnswer(emptyBaseline(), result.features);
    const round = phase.round;
    onEvent({
      type: "score",
      from: phase.targetId,
      call: score.call,
      confidence: score.confidence,
      narration: "",
      source: "ensemble",
      tells: [],
      transcript,
    });
    void recordAnswer({
      data: {
        features: buildVector({
          channels: score.channels,
          micros: result.micro?.flashes.filter((f) => f.micro).length ?? null,
        }),
        call: score.call,
        question: phase.question,
        confidence: score.confidence,
      },
    })
      .then((row) => {
        if ((row.call !== "TRUTH" && row.call !== "LIE") || typeof row.id !== "string") return;
        setSaved({ round, id: row.id, call: row.call });
      })
      .catch(() => {
        /* the call on screen stands */
      });
  }

  if (phase.t === "lobby") {
    return (
      <>
        <TopBar onBack={onLeave} />
        <p className="text-xs tracking-widest text-brass uppercase">Circle code</p>
        <h2 className="mt-2 font-display text-5xl tracking-widest">{code}</h2>
        <p className="mt-3 text-sm text-muted">They tap Join and enter this.</p>
        <SeatRing state={state} />
        {canStart ? (
          <Button className="mt-4" full disabled={state.seats.length < 2} onClick={() => onEvent({ type: "start" })}>
            {state.seats.length < 2 ? "Waiting for one more" : "Start the circle"}
          </Button>
        ) : (
          <p className="mt-4 text-sm text-muted">Waiting for the host to start.</p>
        )}
      </>
    );
  }

  if (localPass && gate && (phase.t === "ask" || phase.t === "answer")) {
    const who = phase.t === "ask" ? seatName(state, phase.askerId) : seatName(state, phase.targetId);
    const detail =
      phase.t === "ask"
        ? `${who}, you ask ${seatName(state, phase.targetId)}.`
        : `${who}, the question is yours to answer.`;
    return (
      <>
        <TopBar onBack={onLeave} />
        <SeatRing state={state} />
        <h2 className="mt-4 font-display text-4xl">Hand the phone to {who}.</h2>
        <p className="mt-3 text-sm text-muted">{detail}</p>
        <Button className="mt-6" full onClick={() => setGate(false)}>
          I'm {who}
        </Button>
      </>
    );
  }

  if (phase.t === "ask") {
    const asker = seatName(state, phase.askerId);
    const target = seatName(state, phase.targetId);
    if (!mine(phase.askerId)) {
      return (
        <>
          <TopBar onBack={onLeave} />
          <SeatRing state={state} />
          <h2 className="mt-4 font-display text-3xl">{asker} is writing for {target}.</h2>
        </>
      );
    }
    return (
      <>
        <TopBar onBack={onLeave} />
        <p className="text-xs tracking-widest text-brass uppercase">
          Round {phase.round} · {asker} asks {target}
        </p>
        <h2 className="mt-2 font-display text-3xl">Ask the person on your left.</h2>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="Have you talked about someone here behind their back?"
          className="mt-4 w-full resize-none rounded-card border border-line bg-surface px-4 py-3 text-fg outline-none"
        />
        <div className="mt-3 flex flex-col gap-2">
          <Button kind="ghost" onClick={() => setDraft(suggestQuestion(heat, true))}>
            Suggest one
          </Button>
          <Button
            full
            disabled={draft.trim().length < 3}
            onClick={() => onEvent({ type: "question", from: phase.askerId, text: draft })}
          >
            Ask {target}
          </Button>
        </div>
      </>
    );
  }

  if (phase.t === "answer") {
    const target = seatName(state, phase.targetId);
    if (!mine(phase.targetId)) {
      return (
        <>
          <TopBar onBack={onLeave} />
          <SeatRing state={state} />
          <h2 className="mt-4 font-display text-3xl">{target} is on the spot.</h2>
          <p className="mt-3 text-sm text-muted">{phase.question}</p>
        </>
      );
    }
    return (
      <CapturePanel
        withAmara
        sensors={sensors}
        eyebrow=""
        question={phase.question}
        index={Math.max(0, phase.round - 1)}
        total={Math.max(state.targetRounds, 1)}
        typed={typed}
        onTyped={setTyped}
        hint={hint}
        onToggle={() => void onToggle()}
        onBack={onLeave}
        onReplay={() => speakAmara(phase.question)}
      />
    );
  }

  if (phase.t === "reveal") {
    const call = saved && saved.round === phase.round ? saved.call : phase.call;
    return (
      <>
        <TopBar onBack={onLeave} />
        <VerdictCard
          score={{
            call,
            lieProbability: phase.confidence,
            confidence: phase.confidence,
            active: 0,
            channels: {},
            tells: [],
          }}
          narration=""
          source={phase.source}
          question={phase.question}
          transcript=""
          player={seatName(state, phase.targetId)}
          onNext={() => onEvent({ type: "next" })}
          nextLabel={state.history.length + 1 >= state.targetRounds ? "Close the circle" : "Next"}
        />
      </>
    );
  }

  const lies = state.history.filter((h) => h.call === "LIE").length;
  return (
    <>
      <TopBar onBack={onLeave} />
      <p className="text-xs tracking-widest text-brass uppercase">The circle</p>
      <h2 className="mt-2 font-display text-4xl">{lies} called lie{lies === 1 ? "" : "s"}.</h2>
      <ul className="mt-5 flex flex-col gap-3">
        {state.history.map((row) => (
          <li key={`${row.askerId}-${row.question}`} className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm">
                <span className="text-muted">{seatName(state, row.askerId)} → {seatName(state, row.targetId)}. </span>
                {row.question}
              </p>
              <span className={row.call === "LIE" ? "text-sm text-lie" : "text-sm text-brass"}>
                {row.call === "LIE" ? "FALSE" : "TRUE"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{row.narration}</p>
          </li>
        ))}
      </ul>
      <Button className="mt-6" full onClick={() => onEvent({ type: "again" })}>
        Another round
      </Button>
    </>
  );
}
