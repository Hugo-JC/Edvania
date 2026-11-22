import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createRouteClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { supabase } = await createRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json(
    {
      authenticated: Boolean(user),
      mode: isSupabaseConfigured() ? "supabase" : "sandbox",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
