import "server-only";
import {NextResponse} from "next/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/lib/supabase/database.types";
import {createRouteClient} from "@/lib/supabase/server";

export type AuthorizedWhatsAppRoute =
  | {
      ok: true;
      supabase: SupabaseClient<Database>;
      userId: string;
      storeId: string;
      role: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function authorizeWhatsAppManagerRoute(
  request: Request,
  requestedStoreId?: string | null,
): Promise<AuthorizedWhatsAppRoute> {
  const {supabase} = await createRouteClient(request);
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) {
    return {ok: false, response: NextResponse.json({error: "unauthorized"}, {status: 401})};
  }

  const {data: memberships} = await supabase
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!memberships?.length) {
    return {ok: false, response: NextResponse.json({error: "no_active_store"}, {status: 403})};
  }

  const selected = requestedStoreId
    ? memberships.find((m) => m.store_id === requestedStoreId)
    : memberships[0];

  if (!selected) {
    return {ok: false, response: NextResponse.json({error: "forbidden"}, {status: 403})};
  }

  if (!["owner", "admin", "manager"].includes(selected.role)) {
    return {ok: false, response: NextResponse.json({error: "forbidden"}, {status: 403})};
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    storeId: selected.store_id,
    role: selected.role,
  };
}
