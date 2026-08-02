import Link from "next/link";
import { listTemplates } from "@/lib/templates/service";

export default async function TemplatePickerPage() {
  const templates = await listTemplates();

  return (
    <div>
      <span className="eyebrow">New experiment · Template</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        Pick a template
      </h2>
      {templates.length === 0 && (
        <p className="muted">
          No templates yet. <Link href="/templates">Create one</Link> first.
        </p>
      )}
      <div className="entry-menu-grid">
        {templates.map((t) => (
          <Link key={t.id} href={`/new/template/${t.id}`} className="obs-box glass entry-menu-card">
            <h4 style={{ margin: "0 0 8px" }}>{t.name}</h4>
            {t.description && (
              <p className="sec-sub" style={{ margin: 0 }}>
                {t.description}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
