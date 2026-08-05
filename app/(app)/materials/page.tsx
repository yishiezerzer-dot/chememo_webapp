import * as materialsService from "@/lib/materials/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { MaterialsClient } from "@/components/materials-client";

export default async function MaterialsPage() {
  const [materials, storageLocations, solubilityStatuses, materialRoles, quantityKinds] = await Promise.all([
    materialsService.listMaterials(),
    materialsService.listStorageLocations(),
    listControlledVocab("solubility_status"),
    listControlledVocab("material_role"),
    listQuantityKinds(),
  ]);

  return (
    <div>
      <div className="detail-head">
        <div>
          <span className="eyebrow">Materials</span>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 0" }}>
            Materials, lots &amp; stock solutions
          </h2>
        </div>
      </div>

      <MaterialsClient
        materials={materials}
        storageLocations={storageLocations}
        solubilityStatuses={solubilityStatuses}
        materialRoles={materialRoles}
        quantityKinds={quantityKinds}
      />
    </div>
  );
}
