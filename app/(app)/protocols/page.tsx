import Link from "next/link";
import { listProtocols } from "@/lib/protocols/service";
import { archiveProtocolAction } from "./actions";

export default async function ProtocolsPage() {
  const protocols = await listProtocols();

  return (
    <div>
      <div className="detail-head">
        <div>
          <span className="eyebrow">Protocols</span>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 0" }}>
            Versioned protocols
          </h2>
        </div>
        <Link href="/protocols/new" className="btn btn-primary btn-sm">
          + New protocol
        </Link>
      </div>

      {protocols.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          No protocols yet.
        </p>
      ) : (
        <div className="entry-menu-grid" style={{ marginTop: 16 }}>
          {protocols.map((p) => (
            <div key={p.id} className="obs-box glass entry-menu-card">
              <div className="id">{p.id}</div>
              <h4 style={{ margin: "4px 0 12px" }}>{p.name}</h4>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href={`/protocols/${p.id}/edit`} className="btn btn-ghost btn-sm">
                  Edit
                </Link>
                <form action={archiveProtocolAction.bind(null, p.id)}>
                  <button type="submit" className="btn btn-ghost btn-sm">
                    Archive
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
