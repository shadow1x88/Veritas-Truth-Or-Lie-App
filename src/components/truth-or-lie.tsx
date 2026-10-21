import { useState } from "react";
import { CircleView } from "./circle-view";
import { HomeView } from "./home-view";
import { SoloView } from "./solo-view";

export function TruthOrLie() {
  const [view, setView] = useState<"home" | "solo" | "circle" | "join">("home");
  if (view === "solo") return <SoloView onExit={() => setView("home")} />;
  if (view === "circle" || view === "join") {
    return <CircleView start={view === "join" ? "join" : "pick"} onExit={() => setView("home")} />;
  }
  return (
    <HomeView
      onSolo={() => setView("solo")}
      onCircle={() => setView("circle")}
      onJoin={() => setView("join")}
    />
  );
}
