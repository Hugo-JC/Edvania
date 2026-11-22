"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

const partySchema = z.object({
  storeId: uuid,
  name: z.string().trim().min(2).max(180),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(180).optional(),
  taxNumber: z.string().trim().max(64).optional(),
  address: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(500).optional(),
});

async function authorizePartyOperator(storeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("store_memberships")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return supabase;
}

export async function createCustomer(formData: FormData) {
  const parsed = partySchema.safeParse({
    storeId: formData.get("storeId"),
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    taxNumber: formData.get("taxNumber") || undefined,
    address: formData.get("address") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    const storeId = String(formData.get("storeId") ?? "");
    redirect(uuid.safeParse(storeId).success ? `/customers?store=${storeId}&error=invalid-customer` : "/dashboard");
  }

  const supabase = await authorizePartyOperator(parsed.data.storeId);
  const { error } = await supabase.rpc("create_customer_with_audit", {
    p_store_id: parsed.data.storeId,
    p_name: parsed.data.name,
    p_phone_e164: parsed.data.phone || undefined,
    p_email: parsed.data.email || undefined,
    p_tax_number: parsed.data.taxNumber || undefined,
    p_address: parsed.data.address || undefined,
    p_notes: parsed.data.notes || undefined,
  });

  if (error) redirect(`/customers?store=${parsed.data.storeId}&error=save-customer`);
  redirect(`/customers?store=${parsed.data.storeId}&notice=customer`);
}

export async function createSupplier(formData: FormData) {
  const parsed = partySchema.safeParse({
    storeId: formData.get("storeId"),
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    taxNumber: formData.get("taxNumber") || undefined,
    address: formData.get("address") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    const storeId = String(formData.get("storeId") ?? "");
    redirect(uuid.safeParse(storeId).success ? `/customers?store=${storeId}&error=invalid-supplier` : "/dashboard");
  }

  const supabase = await authorizePartyOperator(parsed.data.storeId);
  const { error } = await supabase.rpc("create_supplier_with_audit", {
    p_store_id: parsed.data.storeId,
    p_name: parsed.data.name,
    p_phone_e164: parsed.data.phone || undefined,
    p_email: parsed.data.email || undefined,
    p_tax_number: parsed.data.taxNumber || undefined,
    p_address: parsed.data.address || undefined,
    p_notes: parsed.data.notes || undefined,
  });

  if (error) redirect(`/customers?store=${parsed.data.storeId}&error=save-supplier`);
  redirect(`/customers?store=${parsed.data.storeId}&notice=supplier`);
}
