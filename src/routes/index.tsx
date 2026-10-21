import { createFileRoute } from "@tanstack/react-router";
import { TruthOrLie } from "@/components/truth-or-lie";

export const Route = createFileRoute("/")({
  component: TruthOrLie,
});
