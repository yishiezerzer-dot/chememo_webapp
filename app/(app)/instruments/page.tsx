import * as analyticalService from "@/lib/analytical/service";
import { InstrumentsClient } from "@/components/instruments-client";

export default async function InstrumentsPage() {
  const instruments = await analyticalService.listInstruments();

  return (
    <div>
      <div className="detail-head">
        <div>
          <span className="eyebrow">Instruments</span>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 0" }}>
            Instruments &amp; methods
          </h2>
        </div>
      </div>

      <InstrumentsClient instruments={instruments} />
    </div>
  );
}
