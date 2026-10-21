export interface Seat {
  id: string;
  name: string;
}

export interface PublicTell {
  label: string;
  phrase: string;
  push: number;
  z: number;
}

export type CirclePhase =
  | { t: "lobby" }
  | { t: "ask"; round: number; askerId: string; targetId: string }
  | {
      t: "answer";
      round: number;
      askerId: string;
      targetId: string;
      question: string;
    }
  | {
      t: "reveal";
      round: number;
      askerId: string;
      targetId: string;
      question: string;
      call: "TRUTH" | "LIE";
      confidence: number;
      narration: string;
      tells: PublicTell[];
      transcript: string;
      source: "analyst" | "ensemble";
    }
  | { t: "done" };

export interface CircleState {
  seq: number;
  hostId: string;
  seats: Seat[];
  phase: CirclePhase;
  targetRounds: number;
  history: {
    question: string;
    askerId: string;
    targetId: string;
    call: "TRUTH" | "LIE";
    narration: string;
  }[];
}

export type CircleEvent =
  | { type: "seat"; id: string; name: string }
  | { type: "drop"; id: string }
  | { type: "start" }
  | { type: "question"; from: string; text: string }
  | {
      type: "score";
      from: string;
      call: "TRUTH" | "LIE";
      confidence: number;
      narration: string;
      tells: PublicTell[];
      transcript: string;
      source: "analyst" | "ensemble";
    }
  | { type: "next" }
  | { type: "again" };

export function createCircle(hostId: string, hostName: string): CircleState {
  return {
    seq: 1,
    hostId,
    seats: [{ id: hostId, name: hostName }],
    phase: { t: "lobby" },
    targetRounds: 0,
    history: [],
  };
}

export function seatName(state: CircleState, id: string): string {
  return state.seats.find((s) => s.id === id)?.name ?? "Someone";
}

function leftOf(seats: Seat[], id: string): string {
  const i = Math.max(0, seats.findIndex((s) => s.id === id));
  return seats[(i + 1) % seats.length]!.id;
}

function bump(state: CircleState, patch: Partial<CircleState>): CircleState {
  return { ...state, ...patch, seq: state.seq + 1 };
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function reduceCircle(state: CircleState, event: CircleEvent): CircleState {
  switch (event.type) {
    case "seat": {
      if (state.phase.t !== "lobby") return state;
      const name = clean(event.name).slice(0, 18) || "Friend";
      const i = state.seats.findIndex((s) => s.id === event.id);
      if (i >= 0) {
        if (state.seats[i]!.name === name) return state;
        const seats = state.seats.slice();
        seats[i] = { id: event.id, name };
        return bump(state, { seats });
      }
      if (state.seats.length >= 8) return state;
      return bump(state, { seats: [...state.seats, { id: event.id, name }] });
    }
    case "drop": {
      if (state.phase.t !== "lobby") return state;
      if (event.id === state.hostId) return state;
      const seats = state.seats.filter((s) => s.id !== event.id);
      if (seats.length === state.seats.length) return state;
      return bump(state, { seats });
    }
    case "start": {
      if (state.phase.t !== "lobby" || state.seats.length < 2) return state;
      return bump(state, {
        targetRounds: state.seats.length,
        history: [],
        phase: {
          t: "ask",
          round: 1,
          askerId: state.seats[0]!.id,
          targetId: state.seats[1]!.id,
        },
      });
    }
    case "question": {
      if (state.phase.t !== "ask" || event.from !== state.phase.askerId) return state;
      const text = clean(event.text);
      if (text.length < 3) return state;
      return bump(state, {
        phase: {
          t: "answer",
          round: state.phase.round,
          askerId: state.phase.askerId,
          targetId: state.phase.targetId,
          question: text,
        },
      });
    }
    case "score": {
      if (state.phase.t !== "answer" || event.from !== state.phase.targetId) return state;
      return bump(state, {
        phase: {
          t: "reveal",
          round: state.phase.round,
          askerId: state.phase.askerId,
          targetId: state.phase.targetId,
          question: state.phase.question,
          call: event.call,
          confidence: event.confidence,
          narration: event.narration.slice(0, 500),
          tells: event.tells.slice(0, 6),
          transcript: event.transcript.slice(0, 400),
          source: event.source,
        },
      });
    }
    case "next": {
      if (state.phase.t !== "reveal") return state;
      const history = [
        ...state.history,
        {
          question: state.phase.question,
          askerId: state.phase.askerId,
          targetId: state.phase.targetId,
          call: state.phase.call,
          narration: state.phase.narration,
        },
      ];
      if (history.length >= state.targetRounds) {
        return bump(state, { history, phase: { t: "done" } });
      }
      const askerId = state.phase.targetId;
      const targetId = leftOf(state.seats, askerId);
      return bump(state, {
        history,
        phase: { t: "ask", round: state.phase.round + 1, askerId, targetId },
      });
    }
    case "again": {
      if (state.phase.t !== "done" && state.phase.t !== "lobby") return state;
      if (state.seats.length < 2) return bump(state, { phase: { t: "lobby" }, history: [] });
      return bump(state, {
        history: [],
        targetRounds: state.seats.length,
        phase: {
          t: "ask",
          round: 1,
          askerId: state.seats[0]!.id,
          targetId: state.seats[1]!.id,
        },
      });
    }
    default:
      return state;
  }
}
