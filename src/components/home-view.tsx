import { useEffect, useRef, useState } from "react";
import { Button, Screen } from "./ui";

const OPENED = "tol-open";

type Game = "solo" | "circle" | "join";

function cutWhenDone(video: HTMLVideoElement, fallbackSec: number, finish: () => void) {
  let closed = false;
  let timer = 0;
  const end = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    video.removeEventListener("timeupdate", onTime);
    video.removeEventListener("ended", end);
    video.removeEventListener("error", end);
    video.pause();
    finish();
  };
  const onTime = () => {
    const d = video.duration;
    if (Number.isFinite(d) && d > 0 && video.currentTime >= d - 0.2) end();
  };
  const arm = () => {
    const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : fallbackSec;
    window.clearTimeout(timer);
    timer = window.setTimeout(end, (Math.min(d, fallbackSec) + 0.25) * 1000);
  };
  video.addEventListener("timeupdate", onTime);
  video.addEventListener("ended", end);
  video.addEventListener("error", end);
  if (!video.paused && video.currentTime > 0) arm();
  else video.addEventListener("playing", arm, { once: true });
}

function alreadyOpened(): boolean {
  try {
    return sessionStorage.getItem(OPENED) === "1";
  } catch {
    return false;
  }
}

export function HomeView({
  onSolo,
  onCircle,
  onJoin,
}: {
  onSolo: () => void;
  onCircle: () => void;
  onJoin: () => void;
}) {
  const openRef = useRef<HTMLVideoElement>(null);
  const enterRef = useRef<HTMLVideoElement>(null);
  const pending = useRef<Game | null>(null);
  const [ready, setReady] = useState(alreadyOpened);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (ready) return;
    const video = openRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    cutWhenDone(video, 12, done);
    void video.play().catch(() => {});
  }, [ready]);

  function done() {
    try {
      sessionStorage.setItem(OPENED, "1");
    } catch {
      /* private mode */
    }
    setReady(true);
  }

  function kick() {
    const video = openRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    void video.play();
  }

  function go() {
    const mode = pending.current;
    pending.current = null;
    if (mode === "solo") onSolo();
    else if (mode === "circle") onCircle();
    else if (mode === "join") onJoin();
  }

  function begin(mode: "solo" | "circle") {
    pending.current = mode;
    setEntering(true);
    const video = enterRef.current;
    if (!video) {
      go();
      return;
    }
    video.currentTime = 0;
    video.muted = false;
    video.volume = 1;
    cutWhenDone(video, 10.1, go);
    void video.play().catch(() => go());
  }

  if (!ready) {
    return (
      <video
        ref={openRef}
        src="/genie/open.mp4"
        poster="/genie/face.jpg"
        playsInline
        preload="auto"
        onEnded={done}
        onError={done}
        onClick={kick}
        className="fixed inset-0 z-40 h-dvh w-full bg-bg object-cover"
      />
    );
  }

  return (
    <Screen>
      <video
        ref={enterRef}
        src="/genie/enter.mp4"
        poster="/genie/face.jpg"
        playsInline
        preload="auto"
        onEnded={go}
        onError={go}
        className={
          entering
            ? "fixed inset-0 z-40 h-dvh w-full bg-bg object-cover"
            : "pointer-events-none invisible fixed inset-0"
        }
      />
      <div className="flex flex-1 flex-col items-center justify-end gap-3 pb-6">
        <img
          src="/genie/face.jpg"
          alt=""
          className="mb-auto mt-8 aspect-3/4 w-40 rounded-card border border-line object-cover"
        />
        <h1 className="font-display text-5xl leading-none">
          Truth <span className="text-brass">or Lie</span>
        </h1>
        <Button full onClick={() => begin("solo")}>
          Truth or Lie
        </Button>
        <Button kind="surface" full onClick={() => begin("circle")}>
          Circle of Truth
        </Button>
        <Button kind="ghost" full onClick={onJoin}>
          Join
        </Button>
      </div>
    </Screen>
  );
}
