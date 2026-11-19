"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const storeSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres.").max(120, "O nome é demasiado longo."),
});

export async function createStore(formData: FormData) {
  const parsed = storeSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    redirect("/onboarding?error=invalid");
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: storeId, error } = await supabase.rpc("create_store_for_current_user", {
    p_name: parsed.data.name,
  });

  if (error || !storeId) {
    redirect("/onboarding?error=create");
  }

  const fullName = typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null;
  if (fullName) {
    await supabase.from("user_profiles").upsert({ id: user.id, full_name: fullName }, { onConflict: "id" });
  }

  redirect(`/dashboard?store=${storeId}`);
}
