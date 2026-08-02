import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { QuantityKind } from "@/lib/types";

// T1.4 D2 — read side of the quantity_kinds seed registry.
export async function listQuantityKinds(category?: string): Promise<QuantityKind[]> {
  const supabase = await createClient();
  let query = supabase.from("quantity_kinds").select("*").eq("active", true).order("sort_order");
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as QuantityKind[];
}
