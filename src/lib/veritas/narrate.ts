import { createServerFn } from "@tanstack/react-start";
import { analystPrompt, localNarrate, type NarrateBrief } from "./voice";

const stamps: number[] = [];

function withinRate(): boolean {
  const now = Date.now();
  while (stamps.length && now - stamps[0]! > 60_000) stamps.shift();
  if (stamps.length >= 20) return false;
  stamps.push(now);
  return true;
}

function asBrief(input: unknown): NarrateBrief | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (o.call !== "TRUTH" && o.call !== "LIE") return null;
  if (typeof o.question !== "string" || typeof o.transcript !== "string") return null;
  if (typeof o.confidence !== "number" || typeof o.player !== "string") return null;
  if (!Array.isArray(o.tells)) return null;
  const tells = o.tells.slice(0, 6).flatMap((t) => {
    if (!t || typeof t !== "object") return [];
    const row = t as Record<string, unknown>;
    if (typeof row.label !== "string" || typeof row.phrase !== "string" || typeof row.push !== "number") {
      return [];
    }
    return [{ label: row.label.slice(0, 40), phrase: row.phrase.slice(0, 140), push: row.push }];
  });
  return {
    question: o.question.slice(0, 400),
    transcript: o.transcript.slice(0, 800),
    call: o.call,
    confidence: Math.max(0, Math.min(1, o.confidence)),
    player: o.player.slice(0, 40),
    tells,
  };
}

export const narrateVerdict = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const brief = asBrief(input);
    if (!brief) throw new Error("Bad verdict request");
    return brief;
  })
  .handler(async ({ data }) => {
    const fallback = { text: localNarrate(data), source: "ensemble" as const };
    if (!withinRate()) return fallback;
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return fallback;
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(8000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 120,
          temperature: 0.7,
          messages: [
            { role: "system", content: "You speak only as the Veritas analyst inside a party game." },
            { role: "user", content: analystPrompt(data) },
          ],
        }),
      });
      if (!res.ok) return fallback;
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      let text = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) return fallback;
      if (!text.toUpperCase().includes(data.call)) text = `${text} ${data.call}.`;
      return { text, source: "analyst" as const };
    } catch {
      return fallback;
    }
  });
