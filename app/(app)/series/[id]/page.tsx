import { notFound } from "next/navigation";
import { getSeries, listSeriesMembers } from "@/lib/series/service";
import { addMemberAction, removeMemberAction } from "../actions";
import { SeriesDetailClient } from "@/components/series-detail-client";

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [series, members] = await Promise.all([getSeries(id), listSeriesMembers(id)]);
  if (!series) notFound();

  return (
    <div>
      <span className="eyebrow">Series</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 4px" }}>
        {series.name}
      </h2>
      {series.description && (
        <p className="sec-sub" style={{ margin: "0 0 20px" }}>
          {series.description}
        </p>
      )}
      <SeriesDetailClient
        members={members}
        addMember={addMemberAction.bind(null, id)}
        removeMember={removeMemberAction.bind(null, id)}
      />
    </div>
  );
}
