import * as conditionsService from "@/lib/conditions/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { ConditionProgramsClient } from "@/components/condition-programs-client";

export default async function ConditionProgramsPage() {
  const [templates, quantityKinds] = await Promise.all([
    conditionsService.listConditionProgramTemplates(),
    listQuantityKinds(),
  ]);

  return (
    <div>
      <div className="detail-head">
        <div>
          <span className="eyebrow">Condition programs</span>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 0" }}>
            Wet-dry cycle programs
          </h2>
        </div>
      </div>

      <ConditionProgramsClient templates={templates} quantityKinds={quantityKinds} />
    </div>
  );
}
