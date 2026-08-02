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
      <ClonePickerClient experiments={experiments} />
    </div>
  );
}
