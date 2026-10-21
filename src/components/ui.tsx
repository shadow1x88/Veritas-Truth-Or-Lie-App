import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";

const buttonStyles = cva(
  "press inline-flex items-center justify-center gap-2 rounded-pill px-5 font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 min-h-12",
  {
    variants: {
      kind: {
        primary: "bg-brass text-bg",
        ghost: "border border-line bg-transparent text-fg",
        lie: "bg-lie text-bg",
        surface: "border border-line bg-surface text-fg",
      },
      full: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: { kind: "primary", full: false },
  },
);

export function Button({
  className,
  kind,
  full,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button className={cn(buttonStyles({ kind, full }), className)} {...props} />;
}

export function Screen({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("safe-pad mx-auto flex min-h-screen w-full flex-col px-4 pt-3", wide ? "max-w-5xl" : "max-w-lg")}>
      {children}
    </div>
  );
}

const muteListeners = new Set<(muted: boolean) => void>();

function readMuted() {
  try {
    return localStorage.getItem("veritas-mute") === "1";
  } catch {
    return false;
  }
}

export function useMute() {
  const [muted, setMuted] = useState(readMuted);
  useEffect(() => {
    setMuted(readMuted());
    muteListeners.add(setMuted);
    return () => {
      muteListeners.delete(setMuted);
    };
  }, []);
  function toggle() {
    const next = !readMuted();
    try {
      localStorage.setItem("veritas-mute", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    muteListeners.forEach((fn) => fn(next));
  }
  return { muted, toggle };
}

export function playCall(call: "TRUTH" | "LIE") {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem("veritas-mute") === "1") return;
  } catch {
    return;
  }
  const ctx = new AudioContext();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = call === "TRUTH" ? 494 : 185;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.4);
  o.onended = () => void ctx.close();
  if (navigator.vibrate) navigator.vibrate(call === "LIE" ? [20, 36, 20] : 14);
}

export function TopBar({
  onBack,
  eyebrow = "Veritas Inc.",
}: {
  onBack?: () => void;
  eyebrow?: string;
}) {
  const { muted, toggle } = useMute();
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="press inline-flex min-h-12 items-center gap-1 text-sm text-muted">
          <ArrowLeft className="size-4" />
          Back
        </button>
      ) : (
        <span className="text-xs tracking-widest text-muted uppercase">{eyebrow}</span>
      )}
      <div className="text-center">
        <p className="font-display text-lg leading-none">Truth or Lie</p>
        <p className="text-xs text-brass">powered by Veritas</p>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={muted}
        aria-label={muted ? "Unmute" : "Mute"}
        className="press inline-flex size-12 items-center justify-center rounded-pill border border-line text-muted"
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
    </header>
  );
}

export function Seal({
  word = "V",
  hot = false,
  stamp = false,
}: {
  word?: string;
  hot?: boolean;
  stamp?: boolean;
}) {
  const long = word.length > 2;
  return (
    <div className={cn("seal", hot && "seal-hot", stamp && "seal-stamp")} aria-hidden>
      <span className={cn("font-display leading-none", long ? "text-xl tracking-wide" : "text-5xl", hot ? "text-lie" : "text-brass")}>
        {word}
      </span>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs tracking-wide text-muted uppercase">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 w-full rounded-card border border-line bg-surface px-4 text-fg outline-none"
      />
    </label>
  );
}
