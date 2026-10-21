function muted() {
  try {
    return localStorage.getItem("veritas-mute") === "1";
  } catch {
    return true;
  }
}

function chooseVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  const named = english.find((voice) =>
    /female|samantha|victoria|moira|karen|fiona|tessa|serena|aria|zira|susan|salli/i.test(voice.name),
  );
  if (named) return named;
  return english.find((voice) => !/male|david|daniel|alex|fred|rishi/i.test(voice.name)) ?? english[0];
}

let token = 0;
let keepAlive = 0;
let quietMic: (() => void) | null = null;
let restoreMic: (() => void) | null = null;
let lastLine = "";
let lastAt = 0;

/** The open mic cuts her off. The game registers how to hold it. */
export function bindAmaraMic(quiet: () => void, restore: () => void) {
  quietMic = quiet;
  restoreMic = restore;
}

function finished() {
  window.clearInterval(keepAlive);
  restoreMic?.();
}

/** Amara asks the question out loud. Call from a tap so the phone will speak. */
export function speakAmara(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const line = text.trim();
  if (!line || muted()) return;
  if (line === lastLine && Date.now() - lastAt < 900) return;
  lastLine = line;
  lastAt = Date.now();
  const synth = window.speechSynthesis;
  const mine = ++token;
  window.clearInterval(keepAlive);
  quietMic?.();
  if (synth.paused) synth.resume();
  synth.cancel();
  window.setTimeout(() => {
    if (mine !== token || muted()) {
      if (mine === token) finished();
      return;
    }
    const utter = new SpeechSynthesisUtterance(line);
    utter.lang = "en-US";
    utter.rate = 0.94;
    utter.pitch = 1;
    utter.volume = 1;
    const voice = chooseVoice();
    if (voice) utter.voice = voice;
    utter.onend = () => {
      if (mine === token) finished();
    };
    utter.onerror = () => {
      if (mine === token) finished();
    };
    synth.speak(utter);
    // Android drops a line unless the engine is resumed. pause() is what cuts it.
    keepAlive = window.setInterval(() => {
      if (mine !== token || !synth.speaking) {
        window.clearInterval(keepAlive);
        return;
      }
      if (synth.paused) synth.resume();
    }, 2500);
  }, 120);
}

export function hushAmara() {
  if (typeof window === "undefined") return;
  token += 1;
  window.clearInterval(keepAlive);
  window.speechSynthesis?.cancel();
  restoreMic?.();
}
