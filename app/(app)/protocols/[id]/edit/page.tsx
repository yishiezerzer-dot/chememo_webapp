import { notFound } from "next/navigation";
import { listProtocols, getLatestVersion, listSteps } from "@/lib/protocols/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { ProtocolEditClient } from "@/components/protocol-edit-client";
import { saveProtocolVersion } from "../../actions";

export default async function EditProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [protocols, latest, quantityKinds] = await Promise.all([
    listProtocols(true),
    getLatestVersion(id),
    listQuantityKinds(),
  ]);
  const protocol = protocols.find((p) => p.id === id);
  if (!protocol) notFound();

  const steps = latest ? await listSteps(latest.id) : [];

  return (
    <div>
      <span className="eyebrow">Protocols</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 4px" }}>
        {protocol.name}
      </h2>
      <p className="id" style={{ margin: "0 0 4px" }}>
        {protocol.id}
      </p>
      {latest && (
        <p className="sec-sub" style={{ margin: "0 0 20px" }}>
          Editing v{latest.version}
          {latest.frozen_at
            ? " — in use by at least one experiment, so saving now creates a new version."
            : " (not yet used by any experiment — edits save in place)."}
        </p>
      )}
      <ProtocolEditClient
        action={saveProtocolVersion.bind(null, id)}
        initial={{
          purpose: latest?.purpose ?? null,
          scope: latest?.scope ?? null,
          required_materials: latest?.required_materials ?? null,
          equipment: latest?.equipment ?? null,
          safety_notes: latest?.safety_notes ?? null,
          qc_checks: latest?.qc_checks ?? null,
          critical_parameters: latest?.critical_parameters ?? [],
          known_failure_modes: latest?.known_failure_modes ?? [],
          steps,
        }}
        quantityKinds={quantityKinds}
      />
    </div>
  );
}
