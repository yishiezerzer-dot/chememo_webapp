import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Comment, CommentTargetType } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CommentView = Comment & { authorName: string; mentionedNames: string[] };

// T1.9 D2 — resolves author/mention identity via profiles, same pattern
// T1.8's timeline established.
export async function listComments(targetType: CommentTargetType, targetId: string): Promise<CommentView[]> {
  const supabase = await createClient();
  const { data: comments, error } = await supabase
    .from("comments")
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at");
  if (error) throw error;
  if (!comments || comments.length === 0) return [];

  const commentIds = comments.map((c) => c.id);
  const { data: mentions } = await supabase
    .from("comment_mentions")
    .select("comment_id, mentioned_user_id")
    .in("comment_id", commentIds);

  const userIds = new Set<string>();
  for (const c of comments) userIds.add(c.created_by);
  for (const m of mentions ?? []) userIds.add(m.mentioned_user_id);
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, initials").in("id", [...userIds]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.initials || "Someone"]));
  const mentionsByComment = new Map<string, string[]>();
  for (const m of mentions ?? []) {
    const list = mentionsByComment.get(m.comment_id) ?? [];
    list.push(nameById.get(m.mentioned_user_id) ?? "Someone");
    mentionsByComment.set(m.comment_id, list);
  }

  return (comments as Comment[]).map((c) => ({
    ...c,
    authorName: nameById.get(c.created_by) ?? "Someone",
    mentionedNames: mentionsByComment.get(c.id) ?? [],
  }));
}

// T1.9 D2 — a plain "@Full Name" token parsed at save time and matched
// against profiles.full_name (the only "who are the users" source that
// exists without T2.1's membership model), stored once rather than
// re-parsed on every render.
export async function createComment(
  supabase: Supabase,
  userId: string,
  targetType: CommentTargetType,
  targetId: string,
  body: string
): Promise<Comment> {
  const trimmed = body.trim();
  if (!trimmed) throw new AppError("validation", "A comment needs some text.");

  const { data: comment, error } = await supabase
    .from("comments")
    .insert({ target_type: targetType, target_id: targetId, body: trimmed, created_by: userId })
    .select("*")
    .single();
  if (error) throw new AppError("conflict", "Could not post the comment.", { cause: error });

  const { data: profiles } = await supabase.from("profiles").select("id, full_name");
  const mentioned = (profiles ?? []).filter((p) => p.full_name && trimmed.includes(`@${p.full_name}`));
  if (mentioned.length > 0) {
    await supabase
      .from("comment_mentions")
      .insert(mentioned.map((p) => ({ comment_id: comment.id, mentioned_user_id: p.id })));
    await supabase
      .from("notifications")
      .insert(mentioned.map((p) => ({ user_id: p.id, kind: "mention", comment_id: comment.id })));
  }

  return comment as Comment;
}

export async function resolveComment(supabase: Supabase, commentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("comments")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", commentId);
  if (error) throw new AppError("conflict", "Could not resolve the comment.", { cause: error });
}

export async function reopenComment(supabase: Supabase, commentId: string): Promise<void> {
  const { error } = await supabase
    .from("comments")
    .update({ resolved_at: null, resolved_by: null })
    .eq("id", commentId);
  if (error) throw new AppError("conflict", "Could not reopen the comment.", { cause: error });
}
