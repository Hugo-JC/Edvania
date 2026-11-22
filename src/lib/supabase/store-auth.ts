import { redirect } from "next/navigation";
import { createClient } from "./server";

export type StoreActionRole = "owner" | "admin" | "manager" | "employee";

export async function authorizeStoreAction(
  storeId: string,
  allowedRoles: readonly StoreActionRole[] = ["owner", "admin", "manager"],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("store_memberships")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !allowedRoles.includes(membership.role as StoreActionRole)) {
    redirect("/dashboard?error=forbidden");
  }

  return { supabase, user, role: membership.role as StoreActionRole };
}
