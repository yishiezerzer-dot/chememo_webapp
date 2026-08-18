import Link from "next/link";
import { listExperiments } from "@/lib/experiments/service";
import { ClonePickerClient } from "@/components/clone-picker-client";

export default async function CloneExperimentPickerPage() {
  const experiments = await listExperiments();

  return (
    <div>
      <span className="eyebrow">New experiment · Clone</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        Pick an experiment to clone from
      </h2>
      {experiments.length === 0 ? (
        // With nothing to clone, this page used to render a heading, a bare
        // search box and an empty void — asking the reader to pick from a
        // list that was not there, with no way onward. A brand-new notebook
        // is the one state where this page is both guaranteed to be reached
        // and guaranteed to be useless, so it now says so and offers the exit.
        <div className="obs-box glass" style={{ maxWidth: 520 }}>
          <p style={{ margin: "0 0 4px" }}>No experiments to clone yet.</p>
          <p className="sec-sub" style={{ margin: "0 0 12px" }}>
            Cloning copies the planning sections of a record you already have. Once you have logged
            your first experiment, it will appear here.
          </p>
          <Link href="/new/blank" className="btn btn-sm">
            Start a blank experiment
          </Link>
        </div>
      ) : (
        <ClonePickerClient experiments={experiments} />
      )}
    </div>
  );
}
