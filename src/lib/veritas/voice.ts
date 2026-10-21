export interface NarrateBrief {
  question: string;
  transcript: string;
  call: "TRUTH" | "LIE";
  confidence: number;
  player: string;
  tells: { label: string; phrase: string; push: number }[];
}

function cap(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string) {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function joinAnd(xs: string[]) {
  const c = xs.map((s, i) => (i === 0 ? cap(s) : lowerFirst(s)));
  if (c.length === 1) return c[0] ?? "";
  if (c.length === 2) return `${c[0]}, and ${c[1]}`;
  return `${c.slice(0, -1).join(", ")}, and ${c[c.length - 1]}`;
}

/** Ensemble voice used when the analyst is unavailable or rate-limited. */
export function localNarrate(input: NarrateBrief): string {
  const ranked = [...input.tells].sort((a, b) => b.push - a.push);
  const hot = ranked.filter((t) => t.push > 0.15).slice(0, 3);
  const bits = (hot.length ? hot : ranked.slice(0, 2)).map((t) => t.phrase.replace(/\.$/, ""));
  if (input.call === "LIE") {
    if (!bits.length) return "The pattern left the baseline in more than one place. LIE.";
    return `${joinAnd(bits)}. That is not the person Veritas just learned. LIE.`;
  }
  if (!bits.length) return "Nothing important left the baseline. TRUTH.";
  return `${joinAnd(bits)}. The rest stayed inside the baseline. TRUTH.`;
}

export function analystPrompt(input: NarrateBrief): string {
  const tellLines = input.tells
    .slice(0, 6)
    .map((t) => `- ${t.phrase} (${t.label}, weight ${t.push.toFixed(2)})`)
    .join("\n");
  const said = input.transcript.trim() ? `"${input.transcript.trim()}"` : "(no transcript)";
  return [
    "You are the house voice of Truth or Lie, a party game from Veritas Inc.",
    "A gradient-boosted ensemble already scored this answer. Do not change the call.",
    "Do not invent tells that are not in the list. Do not claim this is a polygraph, a medical reading, or proof.",
    "Write exactly two short sentences a sharp friend would say across a table — specific, vivid, never cruel, never clinical, no bullet points.",
    "Mention the strongest tells by what they did. The last word of the second sentence must be the call itself, in caps.",
    "",
    `Player: ${input.player || "them"}`,
    `Question: ${input.question}`,
    `They answered: ${said}`,
    `Call: ${input.call}`,
    `Confidence: ${input.confidence.toFixed(2)}`,
    "Tells:",
    tellLines || "- (no strong shift)",
  ].join("\n");
}
