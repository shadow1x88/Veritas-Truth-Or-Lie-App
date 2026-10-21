export type Heat = "mild" | "messy" | "sharp";

export interface BankQuestion {
  heat: Heat;
  text: string;
  authored: boolean;
  circleOnly?: boolean;
}

export const ANCHORS = [
  "Are you holding the phone right now?",
  "Are you indoors right now?",
  "Are you sitting down?",
  "Are you wearing shoes?",
  "Is it dark outside right now?",
  "Are you looking at the screen?",
  "Is the sound on?",
  "Are you alone in the room?",
];

export const CALIBRATION = "Count from one to five.";

const MILD: string[] = [
  "Have you ever stolen from a store?",
  "Have you ever lied to your parents about where you were?",
  "Have you ever gone through someone's phone?",
  "Have you ever faked being sick to get out of something?",
  "Have you ever kept money that wasn't yours?",
  "Have you ever talked badly about a friend and smiled at them after?",
  "Have you ever blamed someone else for what you did?",
  "Have you ever lied on a resume?",
  "Have you ever pretended not to see a message?",
  "Have you ever snuck out?",
  "Have you ever used a fake name?",
  "Have you ever broken something and let someone else take it?",
  "Have you ever lied about why you canceled?",
  "Have you ever read a diary or a note that wasn't yours?",
  "Have you ever cheated on a test?",
  "Have you ever hidden a purchase?",
  "Have you ever said you were busy when you just didn't want to go?",
  "Have you ever eavesdropped and then acted like you hadn't?",
  "Have you ever taken credit for someone else's idea?",
  "Have you ever lied about your age?",
  "Have you ever gone back into a place you were told to stay out of?",
  "Have you ever kept a secret that could have gotten someone in trouble?",
  "Have you ever deleted a text so nobody could find it?",
  "Have you ever lied about being asleep?",
  "Have you ever taken something from work?",
  "Have you ever passed a rumor you knew might be false?",
  "Have you ever let a friend believe you had their back when you didn't?",
  "Have you ever opened mail that wasn't addressed to you?",
  "Have you ever lied about how much you drank?",
  "Have you ever watched someone get blamed and stayed quiet?",
];

const MESSY: string[] = [
  "Have you ever stolen from a store and not been caught?",
  "Have you ever cheated in a relationship?",
  "Have you ever lied to the police?",
  "Have you ever gone through a partner's phone?",
  "Have you ever broken the law and figured you got away with it?",
  "Have you ever hooked up with an ex you promised you were done with?",
  "Have you ever lied about who you were with?",
  "Have you ever wished a friend would fail?",
  "Have you ever hidden money from someone you live with?",
  "Have you ever started a rumor?",
  "Have you ever lied about your body count?",
  "Have you ever thrown a friend under the bus?",
  "Have you ever faked an emergency to get out of seeing family?",
  "Have you ever dated two people who didn't know about each other?",
  "Have you ever said I love you and not meant it?",
  "Have you ever kept talking to someone you told a friend you'd blocked?",
  "Have you ever been glad when someone who hurt you had a bad day?",
  "Have you ever used someone's secret against them?",
  "Have you ever lied in a job interview?",
  "Have you ever flirted with a friend's partner?",
  "Have you ever denied saying something you definitely said?",
  "Have you ever snooped through a roommate's stuff?",
  "Have you ever let an innocent person take the blame?",
  "Have you ever ghosted someone because the truth was worse?",
  "Have you ever spent shared money like it was only yours?",
  "Have you ever lied about being single?",
  "Have you ever recorded someone without them knowing?",
  "Have you ever kept a second account nobody knows about?",
  "Have you ever tested someone with a lie to see if they'd catch you?",
  "Have you ever stayed quiet when the truth would have cleared someone else?",
];

const SHARP: string[] = [
  "Have you ever cheated in a relationship and not been caught?",
  "Have you ever read a partner's messages without asking?",
  "Have you ever lied to someone's face about where you spent the night?",
  "Have you ever kept a friendship mostly because they were useful?",
  "Have you ever thrown a friend under the bus to save yourself?",
  "Have you ever faked an emergency to get out of seeing family?",
  "Have you ever stolen money, even a small amount, from someone who trusted you?",
  "Have you ever started a rumor that stuck?",
  "Have you ever dated two people who didn't know about each other?",
  "Have you ever blamed a coworker for a mistake you made?",
  "Have you ever broken a promise you knew mattered to them?",
  "Have you ever used someone's secret as a joke later?",
  "Have you ever said I love you and not meant it?",
  "Have you ever stayed in something because leaving would make you look bad?",
  "Have you ever let an innocent person take the heat?",
  "Have you ever lied in a job interview about something that wasn't a skill?",
  "Have you ever gone through a partner's phone while they slept?",
  "Have you ever pretended not to see a message so you wouldn't have to help?",
  "Have you ever kissed someone you told a friend you wouldn't?",
  "Have you ever hidden a debt from the person you live with?",
  "Have you ever recorded someone without them knowing?",
  "Have you ever smiled through a story you knew was a lie about you?",
  "Have you ever ended things by disappearing?",
  "Have you ever taken a story that happened to someone else and told it as yours?",
  "Have you ever been glad, even briefly, when someone who hurt you had a bad day?",
  "Have you ever lied about being sick to skip something important?",
  "Have you ever kept evidence just in case you needed it against someone?",
  "Have you ever flirted with a friend's partner?",
  "Have you ever denied saying something you definitely said?",
  "Have you ever used tears to get out of a consequence?",
  "Have you ever told two friends two different versions of the same night?",
  "Have you ever snooped in a roommate's room?",
  "Have you ever made someone apologize when you were the one who started it?",
  "Have you ever hidden a habit from everyone in your house?",
  "Have you ever agreed to a secret that could have hurt a third person?",
  "Have you ever let a parent believe a story that protected you and not them?",
  "Have you ever been the reason a couple fought, and stayed quiet?",
  "Have you ever spent shared money like it was only yours?",
  "Have you ever lied about your body count, in either direction?",
  "Have you ever kept talking to an ex you promised you had blocked?",
  "Have you ever watched someone get blamed and felt relief it wasn't you?",
  "Have you ever invented a family emergency?",
  "Have you ever said you were fine with a plan you were already sabotaging?",
  "Have you ever leaked a photo you were asked not to?",
  "Have you ever tested someone with a lie to see if they'd catch you?",
  "Have you ever borrowed something and claimed you never had it?",
  "Have you ever bad-mouthed a partner to their friend?",
  "Have you ever stayed silent when the truth would have cleared someone else?",
  "Have you ever faked a bigger emergency than the one you had?",
  "Have you ever kept a burner thread, a hidden chat, or a locked note full of things you deny?",
];

const CIRCLE: string[] = [
  "Have you talked about someone here behind their back?",
  "Do you have a secret opinion of someone in this circle?",
  "Have you lied to someone here in the last month?",
  "Would anyone here be shocked by your search history?",
  "Have you ever left this group out of a plan on purpose?",
  "Are you holding a story about someone here that you were told not to repeat?",
  "Have you ranked the people in this circle and never said the order?",
  "Have you flirted with more than one person who is in this room?",
  "Is there someone here you trust less than you act like you do?",
  "Have you screenshotted a conversation with someone here?",
  "Have you canceled on this group for a person you liked more?",
  "Are you the only one here holding a secret?",
  "Have you ever been jealous of someone sitting here?",
  "Would you date anyone in this circle if nobody found out?",
  "Have you defended someone here in public and doubted them in private?",
];

const PEOPLE = [
  "your best friend",
  "your partner",
  "your ex",
  "your boss",
  "a coworker",
  "your sibling",
  "your parents",
  "the group chat",
  "a neighbor",
  "a cousin",
  "a date",
  "someone you see every week",
];

const LIE_TOPICS = [
  "why you cancelled",
  "where you really were",
  "how much it cost",
  "who you were with",
  "being sick",
  "liking their gift",
  "why you were late",
  "a text you sent",
  "how you feel about them",
  "already being asleep",
  "your real weekend plans",
  "how much you had to drink",
  "a promise you broke",
  "why you left early",
  "a story you keep telling",
];

const SOFT = [
  "a night you still lie about",
  "money you took",
  "someone you still talk to in secret",
  "a promise you already broke",
  "where you really were",
  "a message you deleted",
  "how you actually feel about them",
  "something you stole",
  "a rule you break",
  "who you were really with",
];

const SHARP_ACTS = [
  "kept two stories straight for two different people",
  "lied about a night out",
  "hid a message thread",
  "let a friend believe a softer version of you",
  "took something small and never returned it",
  "pretended not to know a secret you started",
  "used work as an alibi",
  "edited a story so you looked braver",
  "kept a plan from the person it affected",
  "smiled at someone you had just insulted",
  "blamed a delay on a person who wasn't late",
  "saved a photo you said you deleted",
  "checked a location you had no right to check",
  "told a recruiter or a date a cleaner timeline",
  "left a party with someone and denied it later",
  "repeated a private joke to the wrong room",
  "kept a tab running on someone else's name",
  "agreed to a rule you had already broken",
  "hid how often you talk to an ex",
  "let a misunderstanding stand because it helped you",
  "claimed you were the designated sober one",
  "moved money and called it nothing",
  "shared a secret to buy your way into a conversation",
  "acted surprised by news you already had",
  "kept a score of who owes you",
  "lied about liking their partner",
  "used a family crisis as a reason twice",
  "deleted proof and said there was never any",
  "asked a question you already knew the answer to, as a test",
  "stayed quiet while a group piled on the wrong person",
];

function build(): BankQuestion[] {
  const out: BankQuestion[] = [];
  const push = (heat: Heat, text: string, authored: boolean, circleOnly = false) => {
    out.push({ heat, text, authored, circleOnly });
  };
  for (const text of MILD) push("mild", text, true);
  for (const text of MESSY) push("messy", text, true);
  for (const text of SHARP) push("sharp", text, true);
  for (const text of CIRCLE) push("sharp", text, true, true);
  for (const person of PEOPLE) {
    for (const topic of LIE_TOPICS) {
      push("messy", `Have you ever lied to ${person} about ${topic}?`, false);
    }
    for (const topic of SOFT) {
      push("mild", `Would you admit to ${person} that you have ${topic}?`, false);
    }
  }
  for (const act of SHARP_ACTS) {
    push("sharp", `Have you ever ${act}?`, false);
    push("sharp", `Did you keep it quiet the last time you ${act}?`, false);
  }
  const seen = new Set<string>();
  return out.filter((q) => {
    if (seen.has(q.text)) return false;
    seen.add(q.text);
    return true;
  });
}

export const QUESTION_BANK: BankQuestion[] = build();

const RECENT_KEY = "veritas-recent";

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

function recent(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function rememberQuestions(lines: string[]) {
  if (typeof window === "undefined") return;
  try {
    const prev = [...recent()];
    const next = [...lines, ...prev].slice(0, 80);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export function drawQuestions(heat: Heat, n: number, circle = false): string[] {
  const skip = recent();
  const pool = QUESTION_BANK.filter((q) => (circle ? true : !q.circleOnly));
  const rank = (q: BankQuestion) => {
    if (q.heat === heat && q.authored) return 0;
    if (q.heat === heat) return 1;
    if (heat === "messy" && q.heat === "mild" && q.authored) return 2;
    if (heat === "sharp" && q.heat === "messy") return 3;
    return 4;
  };
  const ordered = shuffle(pool).sort((a, b) => rank(a) - rank(b));
  const picked: string[] = [];
  const take = (allowRecent: boolean) => {
    for (const q of ordered) {
      if (picked.length >= n) return;
      if (picked.includes(q.text)) continue;
      if (!allowRecent && skip.has(q.text)) continue;
      if (rank(q) > 3 && picked.length >= Math.min(n, 4)) continue;
      picked.push(q.text);
    }
  };
  take(false);
  if (picked.length < n) take(true);
  return picked.slice(0, n);
}

export function suggestQuestion(heat: Heat, circle: boolean): string {
  return drawQuestions(heat, 1, circle)[0] ?? "Have you ever stolen from a store?";
}

export const BANK_COUNT = QUESTION_BANK.length;
