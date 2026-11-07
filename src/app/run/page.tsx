import type { Metadata } from "next";
import { AshRun } from "./AshRun";

export const metadata: Metadata = {
  title: "Ash Run",
  description: "The swarm broke through the wall. Run the ruined highway: dodge wrecks, vault barricades, slide under girders. A 3D runner from The Last District.",
};

export default function Page() {
  return <AshRun />;
}
