import { useEffect } from "react";
import type { VeritasScore } from "@/lib/veritas/types";
import { Button, Seal, playCall } from "./ui";

export function VerdictCard({
  score,
  question,
  player,
  onNext,
  nextLabel = "Next",
}: {
  score: VeritasScore;
  narration: string;
  source: "analyst" | "ensemble";
  question: string;
  transcript: string;
  player?: string;
  onNext: () => void;
  nextLabel?: string;
}) {
  const word = score.call === "LIE" ? "FALSE" : "TRUE";
  useEffect(() => {
    playCall(score.call);
  }, [score.call]);

  const hot = score.call === "LIE";
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center pt-6 text-center">
        <Seal word={word} hot={hot} stamp />
        <p className="mt-6 font-display text-5xl">{word}</p>
        {player ? <p className="mt-2 text-sm text-muted">{player}</p> : null}
        <p className="mt-6 text-sm text-muted">{question}</p>
      </div>
      <Button className="mt-4" full onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}
