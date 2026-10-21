import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyAccum,
  pushAudio,
  sampleFrame,
  summarize,
  voicedRatio,
  type CaptureAccum,
} from "./dsp";
import {
  measureStatement,
  readEyes,
  type GazeSample,
  type OdtMeasures,
} from "./eyedetect";
import { measureFace, readFace, type FaceSample, type MicroMeasures } from "./micro";
import { bindAmaraMic } from "./amara";
import type { FeatureSet } from "./types";

export type SensorMode = "face" | "finger" | "voice" | "off";

export interface Meter {
  level: number;
  pitch: number | null;
  hearing: boolean;
  seeing: boolean;
}

export interface CaptureResult {
  features: FeatureSet;
  transcript: string;
  heard: boolean;
  durationMs: number;
  /** Tell 1. Null when the face camera was not watching the statement. */
  eye: OdtMeasures | null;
  /** Tell 2. Upper face and lower face, from the expression chart. */
  micro: MicroMeasures | null;
}

interface Recog {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
}

interface RecogCtor {
  new (): Recog;
}

function getRecog(): RecogCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecogCtor;
    webkitSpeechRecognition?: RecogCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSensors() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const accRef = useRef<CaptureAccum>(emptyAccum());
  const recRef = useRef(false);
  const modeRef = useRef<SensorMode>("off");
  const startedRef = useRef(0);
  const speechRef = useRef("");
  const recogRef = useRef<Recog | null>(null);
  const tremorRef = useRef({ n: 0, mean: 0, m2: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eyeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eyeTimerRef = useRef<number | null>(null);
  const eyeRunRef = useRef(false);
  const eyeSamplesRef = useRef<GazeSample[]>([]);
  const faceSamplesRef = useRef<FaceSample[]>([]);
  const eyeWatchRef = useRef(false);
  const statementRef = useRef({ onset: 0, chars: 0 });
  const responseAtRef = useRef<number | null>(null);
  const meterTick = useRef(0);

  const [mode, setMode] = useState<SensorMode>("off");
  const [status, setStatus] = useState<"idle" | "live" | "denied">("idle");
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [meter, setMeter] = useState<Meter>({ level: 0, pitch: null, hearing: false, seeing: false });
  const [error, setError] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(false);

  const bindVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    const stream = streamRef.current;
    if (node && stream) {
      node.srcObject = stream;
      void node.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    setSpeechAvailable(!!getRecog());
  }, []);

  const stopLoops = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (eyeTimerRef.current != null) window.clearTimeout(eyeTimerRef.current);
    eyeTimerRef.current = null;
    eyeRunRef.current = false;
    eyeWatchRef.current = false;
    recogRef.current?.stop();
    recogRef.current = null;
  }, []);

  const release = useCallback(() => {
    recRef.current = false;
    setRecording(false);
    stopLoops();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    modeRef.current = "off";
    setMode("off");
    setStatus("idle");
  }, [stopLoops]);

  useEffect(() => {
    const el = videoRef.current;
    const stream = streamRef.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => {});
  }, [status, mode]);

  useEffect(() => {
    bindAmaraMic(
      () => {
        streamRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        void ctxRef.current?.suspend();
      },
      () => {
        streamRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        void ctxRef.current?.resume();
      },
    );
    return () => bindAmaraMic(() => {}, () => {});
  }, []);

  useEffect(() => () => release(), [release]);

  const arm = useCallback(
    async (next: SensorMode): Promise<boolean> => {
      release();
      setError(null);
      modeRef.current = next;
      setMode(next);
      if (next === "off") {
        setStatus("idle");
        return true;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("denied");
        setError("This browser can't open the camera or mic.");
        modeRef.current = "off";
        setMode("off");
        return false;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
          video:
            next === "voice"
              ? false
              : {
                  facingMode: next === "finger" ? "environment" : "user",
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                },
        });
        streamRef.current = stream;
        if (next === "finger") {
          const track = stream.getVideoTracks()[0];
          try {
            await track?.applyConstraints({ advanced: [{ torch: true }] } as unknown as MediaTrackConstraints);
          } catch {
            /* torch is optional */
          }
        }
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) throw new Error("no audio");
        const ctx = new Ctx();
        ctxRef.current = ctx;
        await ctx.resume();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const frame = new Float32Array(analyser.fftSize);
        if (!canvasRef.current) {
          const canvas = document.createElement("canvas");
          canvas.width = 96;
          canvas.height = 72;
          canvasRef.current = canvas;
        }
        timerRef.current = window.setInterval(() => {
          analyser.getFloatTimeDomainData(frame);
          let e = 0;
          for (let i = 0; i < frame.length; i++) e += frame[i]! * frame[i]!;
          const level = Math.min(1, Math.sqrt(e / frame.length) * 4);
          const now = performance.now();
          if (recRef.current) {
            try {
              pushAudio(accRef.current, frame, ctx.sampleRate, now);
              if (responseAtRef.current == null && level > 0.08) responseAtRef.current = now;
              const video = videoRef.current;
              const canvas = canvasRef.current;
              if (video && canvas && video.readyState >= 2) {
                const g = canvas.getContext("2d", { willReadFrequently: true });
                if (g) {
                  g.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const pixels = g.getImageData(0, 0, canvas.width, canvas.height);
                  const shots = accRef.current.video;
                  shots.push(
                    sampleFrame(pixels.data, canvas.width, canvas.height, modeRef.current === "finger" ? "finger" : "face", now),
                  );
                  if (shots.length > 240) shots.splice(0, shots.length - 240);
                }
              }
              if (accRef.current.rms.length > 400) {
                accRef.current.rms.splice(0, accRef.current.rms.length - 400);
              }
            } catch {
              /* a bad frame does not restart the round */
            }
          }
          if (now - meterTick.current > 180) {
            meterTick.current = now;
            const hearing = level > 0.08;
            setMeter({
              level,
              pitch: accRef.current.pitches.at(-1) ?? null,
              hearing,
              seeing: !!streamRef.current?.getVideoTracks().some((t) => t.readyState === "live"),
            });
          }
        }, 50);
        if (next === "face") {
        eyeRunRef.current = true;
        const sampleEyes = () => {
          if (!eyeRunRef.current) return;
          const started = performance.now();
          if (eyeWatchRef.current && modeRef.current === "face") {
            try {
            const video = videoRef.current;
            if (video && video.readyState >= 2) {
              if (!eyeCanvasRef.current) {
                const canvas = document.createElement("canvas");
                canvas.width = 160;
                canvas.height = 120;
                eyeCanvasRef.current = canvas;
              }
              const canvas = eyeCanvasRef.current;
              const g = canvas.getContext("2d", { willReadFrequently: true });
              if (g) {
                g.drawImage(video, 0, 0, canvas.width, canvas.height);
                const frame = g.getImageData(0, 0, canvas.width, canvas.height);
                const eye = readEyes(frame.data, canvas.width, canvas.height);
                const now = performance.now();
                const eyes = eyeSamplesRef.current;
                eyes.push({ t: now, xDeg: eye.xDeg, yDeg: eye.yDeg, pupilMm: eye.pupilMm, blink: eye.blink });
                if (eyes.length > 500) eyes.splice(0, eyes.length - 500);
                const faces = faceSamplesRef.current;
                faces.push({ t: now, cues: readFace(frame.data, canvas.width, canvas.height) });
                if (faces.length > 500) faces.splice(0, faces.length - 500);
              }
            }
            } catch {
              /* a bad frame does not restart the round */
            }
          }
          const wait = Math.max(40, 80 - (performance.now() - started));
          if (!eyeRunRef.current) return;
          eyeTimerRef.current = window.setTimeout(sampleEyes, wait);
        };
        eyeTimerRef.current = window.setTimeout(sampleEyes, 80);
        }
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          void el.play().catch(() => {});
        }
        setStatus("live");
        return true;
      } catch {
        setStatus("denied");
        setError("Camera or mic was blocked. You can still play a rehearsal read from timing and words.");
        modeRef.current = "off";
        setMode("off");
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return false;
      }
    },
    [release],
  );

  useEffect(() => {
    const onMotion = (e: DeviceMotionEvent) => {
      if (!recRef.current) return;
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null) return;
      const mag = Math.hypot(a.x, a.y, a.z ?? 0);
      const t = tremorRef.current;
      t.n += 1;
      const d = mag - t.mean;
      t.mean += d / t.n;
      t.m2 += d * (mag - t.mean);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);

  const watchStatement = useCallback((text: string) => {
    eyeSamplesRef.current = [];
    faceSamplesRef.current = [];
    eyeWatchRef.current = modeRef.current === "face";
    statementRef.current = { onset: performance.now(), chars: text.trim().length };
    responseAtRef.current = null;
  }, []);

  const start = useCallback(() => {
    accRef.current = emptyAccum();
    speechRef.current = "";
    setTranscript("");
    tremorRef.current = { n: 0, mean: 0, m2: 0 };
    startedRef.current = performance.now();
    recRef.current = true;
    setRecording(true);
    const Ctor = getRecog();
    if (Ctor && modeRef.current !== "off") {
      try {
        const rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        rec.onresult = (ev) => {
          let text = "";
          for (let i = 0; i < ev.results.length; i++) {
            text += `${ev.results[i]?.[0]?.transcript ?? ""} `;
          }
          speechRef.current = text.trim();
          setTranscript(speechRef.current);
        };
        rec.start();
        recogRef.current = rec;
      } catch {
        recogRef.current = null;
      }
    }
  }, []);

  const finish = useCallback(
    (latencyMs: number, typed: string): CaptureResult | null => {
      const durationMs = performance.now() - startedRef.current;
      if (!recRef.current) return null;
      if (durationMs < 700 && !(speechRef.current || typed).trim()) return null;
      recRef.current = false;
      setRecording(false);
      try {
        recogRef.current?.stop();
      } catch {
        /* already stopped */
      }
      recogRef.current = null;
      const transcript = (speechRef.current || typed).trim();
      const tremor =
        tremorRef.current.n > 2 ? Math.sqrt(tremorRef.current.m2 / tremorRef.current.n) / 3.2 : 0.02;
      const features = summarize({
        acc: accRef.current,
        durationMs,
        transcript,
        latencyMs,
        tremor,
        mode: modeRef.current,
      });
      const heard =
        modeRef.current === "off"
          ? transcript.length > 1 || durationMs > 700
          : voicedRatio(accRef.current) >= 0.08 || transcript.length > 1;
      let eye: OdtMeasures | null = null;
      let micro: MicroMeasures | null = null;
      if (eyeWatchRef.current && statementRef.current.onset > 0) {
        eye = measureStatement({
          samples: eyeSamplesRef.current,
          onset: statementRef.current.onset,
          responseAt: responseAtRef.current ?? performance.now(),
          characters: statementRef.current.chars,
        });
        if (eye.pupilAuc != null) features.pupil = eye.pupilAuc;
        else delete features.pupil;
        if (faceSamplesRef.current.length) micro = measureFace(faceSamplesRef.current);
      } else {
        delete features.pupil;
      }
      eyeWatchRef.current = false;
      return { features, transcript, heard, durationMs, eye, micro };
    },
    [],
  );

  return {
    bindVideo,
    mode,
    status,
    recording,
    transcript,
    meter,
    error,
    speechAvailable,
    arm,
    watchStatement,
    start,
    finish,
    release,
  };
}
