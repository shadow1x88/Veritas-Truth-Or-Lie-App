import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { hushAmara } from "@/lib/veritas/amara";
import type { useSensors } from "@/lib/veritas/use-sensors";
import { Button, TopBar, useMute } from "./ui";

type Sensors = ReturnType<typeof useSensors>;

export function CapturePanel({
  sensors,
  eyebrow,
  question,
  index,
  total,
  baselineCount = 0,
  typed,
  onTyped,
  hint,
  onToggle,
  onBack,
  withAmara = false,
  onReplay,
}: {
  sensors: Sensors;
  eyebrow: string;
  question: string;
  index: number;
  total: number;
  baselineCount?: number;
  typed: string;
  onTyped: (value: string) => void;
  hint: string | null;
  onToggle: () => void;
  onBack?: () => void;
  onSwitch?: (mode: "face" | "finger") => void;
  withAmara?: boolean;
  onReplay?: () => void;
}) {
  const showType = sensors.mode === "off" || !sensors.speechAvailable;
  const { muted } = useMute();

  useEffect(() => {
    if (muted) hushAmara();
  }, [muted]);

  const ticks = (
    <div className="mb-4 flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="contents">
          {baselineCount > 0 && i === baselineCount ? <span className="w-2" /> : null}
          <span
            className={cn(
              "h-1.5 flex-1 rounded-pill",
              i < index ? "bg-brass" : i === index ? "bg-fg" : "bg-line",
            )}
          />
        </span>
      ))}
    </div>
  );

  const answer = (
    <div className="mt-auto pt-6">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "press flex min-h-16 w-full items-center justify-center rounded-pill text-base font-medium",
          sensors.recording ? "pulse-ring bg-lie text-bg" : "bg-brass text-bg",
        )}
      >
        {sensors.recording ? "Done" : "Answer"}
      </button>
    </div>
  );

  if (withAmara) {
    return (
      <section aria-label="Amara" className="relative mx-auto min-h-screen w-full max-w-lg overflow-hidden bg-bg">
        <img src="/genie/face.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/80 via-transparent to-bg" />
        <div className="safe-pad relative z-10 flex min-h-screen flex-col px-4 pt-3">
          {onBack ? <TopBar onBack={onBack} /> : <TopBar />}
          {ticks}
          {(sensors.mode === "face" || sensors.mode === "finger") ? (
            <video
              ref={sensors.bindVideo}
              playsInline
              muted
              autoPlay
              className="pointer-events-none absolute size-16 opacity-0"
            />
          ) : null}
          <div className="mt-auto">
            <div className="rounded-card border border-line bg-bg/85 p-4">
              {eyebrow ? <p className="text-xs tracking-widest text-brass uppercase">{eyebrow}</p> : null}
              <h2 className="mt-2 font-display text-3xl leading-tight">{question}</h2>
              {showType ? (
                <textarea
                  value={typed}
                  onChange={(e) => onTyped(e.target.value)}
                  rows={2}
                  placeholder="Answer"
                  className="mt-4 w-full resize-none rounded-card border border-line bg-surface px-4 py-3 text-fg outline-none"
                />
              ) : null}
              {hint ? <p className="mt-3 text-sm text-lie">{hint}</p> : null}
              {onReplay && !sensors.recording ? (
                <Button kind="ghost" className="mt-4" onClick={onReplay}>
                  Again
                </Button>
              ) : null}
              {answer}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {onBack ? <TopBar onBack={onBack} /> : <TopBar />}
      {ticks}
      <p className="text-xs tracking-widest text-brass uppercase">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl leading-tight">{question}</h2>
      {(sensors.mode === "face" || sensors.mode === "finger") ? (
        <video
          ref={sensors.bindVideo}
          playsInline
          muted
          autoPlay
          className="pointer-events-none absolute size-16 opacity-0"
        />
      ) : null}
      {showType ? (
        <textarea
          value={typed}
          onChange={(e) => onTyped(e.target.value)}
          rows={3}
          placeholder="Answer"
          className="mt-4 w-full resize-none rounded-card border border-line bg-surface px-4 py-3 text-fg outline-none"
        />
      ) : null}
      {hint ? <p className="mt-3 text-sm text-lie">{hint}</p> : null}
      {answer}
    </div>
  );
}
