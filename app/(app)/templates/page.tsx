import Link from "next/link";
import { listTemplates } from "@/lib/templates/service";
import { archiveTemplateAction } from "./actions";

export default async function TemplatesPage() {
  const templates = await listTemplates();

  return (
    <div>
      <div className="detail-head">
        <div>
          <span className="eyebrow">Templates</span>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 0" }}>
            Experiment templates
          </h2>
        </div>
        <Link href="/templates/new" className="btn btn-primary btn-sm">
          + New template
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          No templates yet.
        </p>
      ) : (
        <div className="entry-menu-grid" style={{ marginTop: 16 }}>
          {templates.map((t) => (
            <div key={t.id} className="obs-box glass entry-menu-card">
              <h4 style={{ margin: "0 0 8px" }}>{t.name}</h4>
              {t.description && (
                <p className="sec-sub" style={{ margin: "0 0 12px" }}>
                  {t.description}
                </p>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Link href={`/templates/${t.id}/edit`} className="btn btn-ghost btn-sm">
                  Edit
                </Link>
                <form action={archiveTemplateAction.bind(null, t.id)}>
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
