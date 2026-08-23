"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type {
  Material,
  MaterialIdentifier,
  MaterialLot,
  StockSolution,
  StockSolubilityAttempt,
  StorageLocation,
  QuantityKind,
  Quantity,
  IdentifierType,
} from "@/lib/types";
import {
  createMaterialAction,
  deleteMaterialAction,
  deleteLotAction,
  addIdentifierAction,
  createStorageLocationAction,
  deleteStorageLocationAction,
  createLotAction,
  createStockAction,
  verifyStockAction,
  addSolubilityAttemptAction,
  getMaterialDetailAction,
  getLotStocksAction,
  getStockAttemptsAction,
} from "@/app/(app)/materials/actions";

const IDENTIFIER_TYPES: IdentifierType[] = ["cas", "pubchem_cid", "inchikey", "inchi", "smiles", "internal_code", "alias"];

// T2.8 D2 — smiles-drawer touches the DOM at draw time, so it's loaded
// client-only (first use of this pattern in the codebase; no SSR fallback
// needed since a plain loading state is fine for a small inline structure).
const MoleculeStructure = dynamic(() => import("@/components/molecule-structure").then((m) => m.MoleculeStructure), {
  ssr: false,
});

function QuantityRow({
  label,
  kind,
  value,
  onChange,
}: {
  label: string;
  kind: QuantityKind | undefined;
  value: Quantity | undefined;
  onChange: (q: Quantity | undefined) => void;
}) {
  if (!kind) return null;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
      <span style={{ minWidth: 140, fontSize: 13 }}>{label}</span>
      <input
        type="number"
        step="0.01"
        value={value?.value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : { value: Number(e.target.value), unit_code: value?.unit_code ?? kind.canonical_unit_code })
        }
        style={{ width: 110 }}
      />
      <select
        value={value?.unit_code ?? kind.canonical_unit_code}
        onChange={(e) => onChange(value ? { ...value, unit_code: e.target.value } : { value: 0, unit_code: e.target.value })}
      >
        {kind.compatible_units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}

function StockRow({
  stock,
  quantityKinds,
  solubilityStatuses,
  onChanged,
}: {
  stock: StockSolution;
  quantityKinds: QuantityKind[];
  solubilityStatuses: string[];
  // A stock row renders from its parent's locally-fetched list, not from the
  // server tree, so router.refresh() alone cannot show a change to it. Without
  // this, "Mark verified" wrote verified_at and then looked like it had done
  // nothing -- the button stayed, inviting a second click.
  onChanged: () => void;
}) {
  const { run, load, pending, pendingKey } = useRunAction();
  const [attempts, setAttempts] = useState<StockSolubilityAttempt[] | null>(null);
  const [open, setOpen] = useState(false);
  const stockConcentrationKind = quantityKinds.find((k) => k.key === "stock_concentration");
  const [attemptTarget, setAttemptTarget] = useState<Quantity | undefined>();
  const [attemptSolvent, setAttemptSolvent] = useState("");
  const [attemptOutcome, setAttemptOutcome] = useState(solubilityStatuses[0] ?? "");
  const [attemptNotes, setAttemptNotes] = useState("");

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    load(
      () => getStockAttemptsAction(stock.id),
      (data) => {
        setAttempts(data as StockSolubilityAttempt[]);
        setOpen(true);
      },
      "attempts"
    );
  }

  return (
    <div className="act-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="act-dot"></span>
        <span style={{ fontSize: 13 }}>
          {stock.target_quantities?.stock_concentration
            ? `${stock.target_quantities.stock_concentration.value} ${stock.target_quantities.stock_concentration.unit_code}`
            : "Stock"}
          {stock.solvent && ` in ${stock.solvent}`}
        </span>
        {stock.solubility_status && <span className="chip">{stock.solubility_status}</span>}
        {stock.verified_at ? (
          <span className="chip" style={{ marginLeft: "auto" }}>
            Verified
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto" }}
            disabled={pending}
            aria-busy={pending && pendingKey === "verify"}
            onClick={() => run(() => verifyStockAction(stock.id), "verify", onChanged)}
          >
            {pending && pendingKey === "verify" && <Spinner />}
            Mark verified
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          aria-busy={pending && pendingKey === "attempts"}
          onClick={toggle}
        >
          {pending && pendingKey === "attempts" && <Spinner />}
          {open ? "Hide" : "Solubility log"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 8, paddingLeft: 20 }}>
          {(attempts ?? []).map((a) => (
            <div key={a.id} className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>
              Attempt {a.attempt_number}: {a.target_quantities?.stock_concentration?.value}{" "}
              {a.target_quantities?.stock_concentration?.unit_code} in {a.solvent || "?"} — {a.outcome}
              {a.notes && ` (${a.notes})`}
            </div>
          ))}
          <QuantityRow label="Target concentration" kind={stockConcentrationKind} value={attemptTarget} onChange={setAttemptTarget} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input placeholder="Solvent" value={attemptSolvent} onChange={(e) => setAttemptSolvent(e.target.value)} />
            <select value={attemptOutcome} onChange={(e) => setAttemptOutcome(e.target.value)}>
              {solubilityStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input placeholder="Notes" value={attemptNotes} onChange={(e) => setAttemptNotes(e.target.value)} />
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending}
              aria-busy={pending && pendingKey === "log-attempt"}
              onClick={() =>
                run(async () => {
                  const nextAttemptNumber = (attempts?.length ?? 0) + 1;
                  const res = await addSolubilityAttemptAction(
                    stock.id,
                    nextAttemptNumber,
                    attemptTarget ? { stock_concentration: attemptTarget } : {},
                    attemptSolvent,
                    attemptOutcome,
                    attemptNotes
                  );
                  if (res.ok) {
                    setAttempts(await getStockAttemptsAction(stock.id));
                    setAttemptSolvent("");
                    setAttemptNotes("");
                  }
                  return res;
                }, "log-attempt")
              }
            >
              {pending && pendingKey === "log-attempt" && <Spinner />}
              + Log attempt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LotRow({
  lot,
  storageLocations,
  quantityKinds,
  solubilityStatuses,
  onDeleted,
}: {
  lot: MaterialLot;
  storageLocations: StorageLocation[];
  quantityKinds: QuantityKind[];
  solubilityStatuses: string[];
  onDeleted: () => void;
}) {
  const { run, load, pending, pendingKey } = useRunAction();
  const [stocks, setStocks] = useState<StockSolution[] | null>(null);
  const [open, setOpen] = useState(false);
  const [showNewStock, setShowNewStock] = useState(false);
  const stockConcentrationKind = quantityKinds.find((k) => k.key === "stock_concentration");
  const stockVolumeKind = quantityKinds.find((k) => k.key === "stock_volume");
  const [targetConcentration, setTargetConcentration] = useState<Quantity | undefined>();
  const [targetVolume, setTargetVolume] = useState<Quantity | undefined>();
  const [solvent, setSolvent] = useState("");
  const [solubilityStatus, setSolubilityStatus] = useState(solubilityStatuses[0] ?? "");
  const location = storageLocations.find((s) => s.id === lot.storage_location_id);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    load(
      () => getLotStocksAction(lot.id),
      (data) => {
        setStocks(data as StockSolution[]);
        setOpen(true);
      },
      "stocks"
    );
  }

  function refreshStocks() {
    load(() => getLotStocksAction(lot.id), (data) => setStocks(data as StockSolution[]), "stocks");
  }

  return (
    <div className="act-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="act-dot"></span>
        <span style={{ fontSize: 13 }}>
          {lot.lot_number || "Lot"} {lot.supplier && `— ${lot.supplier}`}
          {lot.purity != null && ` (${lot.purity}% purity)`}
          {location && ` @ ${location.name}`}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          disabled={pending}
          aria-busy={pending && pendingKey === "stocks"}
          onClick={toggle}
        >
          {pending && pendingKey === "stocks" && <Spinner />}
          {open ? "Hide stocks" : "Stocks"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          aria-busy={pending && pendingKey === "delete-lot"}
          onClick={() => run(() => deleteLotAction(lot.id), "delete-lot", onDeleted)}
        >
          {pending && pendingKey === "delete-lot" && <Spinner />}
          Delete
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 8, paddingLeft: 20 }}>
          {(stocks ?? []).map((s) => (
            <StockRow
              key={s.id}
              stock={s}
              quantityKinds={quantityKinds}
              solubilityStatuses={solubilityStatuses}
              onChanged={refreshStocks}
            />
          ))}
          {!showNewStock ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewStock(true)}>
              + New stock solution
            </button>
          ) : (
            <div style={{ marginTop: 8 }}>
              <QuantityRow label="Target concentration" kind={stockConcentrationKind} value={targetConcentration} onChange={setTargetConcentration} />
              <QuantityRow label="Target volume" kind={stockVolumeKind} value={targetVolume} onChange={setTargetVolume} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <input placeholder="Solvent" value={solvent} onChange={(e) => setSolvent(e.target.value)} />
                <select value={solubilityStatus} onChange={(e) => setSolubilityStatus(e.target.value)}>
                  {solubilityStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={pending}
                  aria-busy={pending && pendingKey === "save-stock"}
                  onClick={() =>
                    run(async () => {
                      const res = await createStockAction(lot.id, {
                        target_quantities: {
                          ...(targetConcentration ? { stock_concentration: targetConcentration } : {}),
                          ...(targetVolume ? { stock_volume: targetVolume } : {}),
                        },
                        actual_quantities: {},
                        solvent: solvent || null,
                        solvent_grade: null,
                        ph_target: null,
                        ph_measured: null,
                        acid_or_base_added: null,
                        acid_or_base_quantities: {},
                        filtration_or_centrifugation: null,
                        color_and_appearance: null,
                        calculation: {},
                        solubility_status: solubilityStatus || null,
                        prepared_at: new Date().toISOString(),
                        prepared_by: null,
                        storage_location_id: null,
                        storage_temperature: null,
                        freeze_thaw_count: 0,
                        expiration_or_review_date: null,
                      });
                      if (res.ok) {
                        setStocks(await getLotStocksAction(lot.id));
                        setShowNewStock(false);
                      }
                      return res;
                    }, "save-stock")
                  }
                >
                  {pending && pendingKey === "save-stock" && <Spinner />}
                  Save stock
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewStock(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialRow({
  material,
  storageLocations,
  quantityKinds,
  solubilityStatuses,
}: {
  material: Material;
  storageLocations: StorageLocation[];
  quantityKinds: QuantityKind[];
  solubilityStatuses: string[];
}) {
  const { run, load, pending, pendingKey } = useRunAction();
  const [open, setOpen] = useState(false);
  const [identifiers, setIdentifiers] = useState<MaterialIdentifier[] | null>(null);
  const [lots, setLots] = useState<MaterialLot[] | null>(null);
  const [showNewLot, setShowNewLot] = useState(false);
  const [identifierType, setIdentifierType] = useState<IdentifierType>("cas");
  const [identifierValue, setIdentifierValue] = useState("");
  const [lotSupplier, setLotSupplier] = useState("");
  const [lotCatalog, setLotCatalog] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [lotPurity, setLotPurity] = useState("");
  const [lotStorage, setLotStorage] = useState("");

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    load(
      () => getMaterialDetailAction(material.id),
      (detail) => {
        setIdentifiers(detail.identifiers as MaterialIdentifier[]);
        setLots(detail.lots as MaterialLot[]);
        setOpen(true);
      },
      "detail"
    );
  }

  function refreshLots() {
    load(() => getMaterialDetailAction(material.id), (detail) => setLots(detail.lots as MaterialLot[]), "detail");
  }

  return (
    <div className="obs-box glass" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <b>{material.preferred_name}</b>
          {material.short_code && <span className="muted"> ({material.short_code})</span>}
          {material.formula && <span className="muted"> — {material.formula}</span>}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          disabled={pending}
          aria-busy={pending && pendingKey === "detail"}
          onClick={toggle}
        >
          {pending && pendingKey === "detail" && <Spinner />}
          {open ? "Collapse" : "Details"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          aria-busy={pending && pendingKey === "delete-material"}
          onClick={() => run(() => deleteMaterialAction(material.id), "delete-material")}
        >
          {pending && pendingKey === "delete-material" && <Spinner />}
          Delete
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 12 }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 13 }}>Identifiers</h4>
            {(identifiers ?? []).map((id) => (
              <div key={id.id} className="chip" style={{ marginRight: 6, marginBottom: 6, display: "inline-block" }}>
                {id.identifier_type}: {id.value}
              </div>
            ))}
            {(() => {
              const smiles = (identifiers ?? []).find((id) => id.identifier_type === "smiles");
              return smiles ? <MoleculeStructure smiles={smiles.value} /> : null;
            })()}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <select value={identifierType} onChange={(e) => setIdentifierType(e.target.value as IdentifierType)}>
                {IDENTIFIER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input placeholder="Value" value={identifierValue} onChange={(e) => setIdentifierValue(e.target.value)} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pending}
                aria-busy={pending && pendingKey === "add-identifier"}
                onClick={() =>
                  run(async () => {
                    const res = await addIdentifierAction(material.id, identifierType, identifierValue);
                    if (res.ok) {
                      const detail = await getMaterialDetailAction(material.id);
                      setIdentifiers(detail.identifiers as MaterialIdentifier[]);
                      setIdentifierValue("");
                    }
                    return res;
                  }, "add-identifier")
                }
              >
                {pending && pendingKey === "add-identifier" && <Spinner />}
                + Add
              </button>
            </div>
          </div>

          <h4 style={{ margin: "0 0 6px", fontSize: 13 }}>Lots</h4>
          {(lots ?? []).map((lot) => (
            <LotRow
              key={lot.id}
              lot={lot}
              storageLocations={storageLocations}
              quantityKinds={quantityKinds}
              solubilityStatuses={solubilityStatuses}
              onDeleted={refreshLots}
            />
          ))}
          {!showNewLot ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewLot(true)}>
              + New lot
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input placeholder="Supplier" value={lotSupplier} onChange={(e) => setLotSupplier(e.target.value)} />
              <input placeholder="Catalog #" value={lotCatalog} onChange={(e) => setLotCatalog(e.target.value)} />
              <input placeholder="Lot #" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
              <input placeholder="Purity %" type="number" value={lotPurity} onChange={(e) => setLotPurity(e.target.value)} style={{ width: 90 }} />
              <select value={lotStorage} onChange={(e) => setLotStorage(e.target.value)}>
                <option value="">No storage location</option>
                {storageLocations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-sm"
                disabled={pending}
                aria-busy={pending && pendingKey === "save-lot"}
                onClick={() =>
                  run(async () => {
                    const res = await createLotAction(material.id, {
                      supplier: lotSupplier || null,
                      catalog_number: lotCatalog || null,
                      lot_number: lotNumber || null,
                      purity: lotPurity ? Number(lotPurity) : null,
                      physical_form: null,
                      commercial_solution_quantities: {},
                      concentration_basis: null,
                      density: null,
                      density_temperature: null,
                      water_content_or_hydrate_form: null,
                      storage_location_id: lotStorage || null,
                      date_opened: null,
                      expiration_or_retest_date: null,
                    });
                    if (res.ok) {
                      const detail = await getMaterialDetailAction(material.id);
                      setLots(detail.lots as MaterialLot[]);
                      setShowNewLot(false);
                      setLotSupplier("");
                      setLotCatalog("");
                      setLotNumber("");
                      setLotPurity("");
                      setLotStorage("");
                    }
                    return res;
                  }, "save-lot")
                }
              >
                {pending && pendingKey === "save-lot" && <Spinner />}
                Save lot
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewLot(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MaterialsClient({
  materials,
  storageLocations,
  solubilityStatuses,
  quantityKinds,
}: {
  materials: Material[];
  storageLocations: StorageLocation[];
  solubilityStatuses: string[];
  materialRoles: string[];
  quantityKinds: QuantityKind[];
}) {
  const { run, pending, pendingKey } = useRunAction();
  const [showNewMaterial, setShowNewMaterial] = useState(false);
  const [showNewStorage, setShowNewStorage] = useState(false);
  const [storageName, setStorageName] = useState("");
  const [storageConditions, setStorageConditions] = useState("");

  return (
    <div style={{ marginTop: 16 }}>
      <div className="obs-box glass" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={{ margin: 0 }}>Storage locations</h4>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewStorage((v) => !v)}>
            {showNewStorage ? "Cancel" : "+ New location"}
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          {storageLocations.map((s) => (
            <span key={s.id} className="chip" style={{ marginRight: 6, marginBottom: 6, display: "inline-block" }}>
              {s.name}
              <b
                onClick={() => run(() => deleteStorageLocationAction(s.id), `storage-${s.id}`)}
                style={{ marginLeft: 6, cursor: "pointer" }}
              >
                {pending && pendingKey === `storage-${s.id}` ? <Spinner /> : "×"}
              </b>
            </span>
          ))}
        </div>
        {showNewStorage && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input placeholder="Name (e.g. Freezer A, shelf 2)" value={storageName} onChange={(e) => setStorageName(e.target.value)} />
            <input placeholder="Conditions (e.g. -20C)" value={storageConditions} onChange={(e) => setStorageConditions(e.target.value)} />
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending}
              aria-busy={pending && pendingKey === "save-storage"}
              onClick={() =>
                run(() => createStorageLocationAction(storageName, storageConditions, ""), "save-storage", () => {
                  setStorageName("");
                  setStorageConditions("");
                  setShowNewStorage(false);
                })
              }
            >
              {pending && pendingKey === "save-storage" && <Spinner />}
              Save
            </button>
          </div>
        )}
      </div>

      <div className="detail-head" style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>Materials</h4>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNewMaterial((v) => !v)}>
          {showNewMaterial ? "Cancel" : "+ New material"}
        </button>
      </div>

      {showNewMaterial && (
        <form
          className="obs-box glass"
          style={{ marginBottom: 16 }}
          action={(formData) =>
            run(() => createMaterialAction(null, formData), "save-material", () => setShowNewMaterial(false))
          }
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="preferred_name" placeholder="Preferred name" required />
            <input name="short_code" placeholder="Short code" />
            <input name="formula" placeholder="Formula" />
            <input name="molecular_weight" type="number" step="0.001" placeholder="MW (g/mol)" style={{ width: 130 }} />
            <input name="exact_mass" type="number" step="0.0001" placeholder="Exact mass" style={{ width: 120 }} />
            <input name="stereochemistry" placeholder="Stereochemistry" />
          </div>
          <textarea name="safety_notes" placeholder="Safety notes" style={{ marginTop: 8, width: "100%" }} />
          <button type="submit" className="btn btn-sm" style={{ marginTop: 8 }} disabled={pending} aria-busy={pending && pendingKey === "save-material"}>
            {pending && pendingKey === "save-material" && <Spinner />}
            Save material
          </button>
        </form>
      )}

      {materials.length === 0 ? (
        <p className="muted">No materials yet.</p>
      ) : (
        materials.map((m) => (
          <MaterialRow
            key={m.id}
            material={m}
            storageLocations={storageLocations}
            quantityKinds={quantityKinds}
            solubilityStatuses={solubilityStatuses}
          />
        ))
      )}
    </div>
  );
}
