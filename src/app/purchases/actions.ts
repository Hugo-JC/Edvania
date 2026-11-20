"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  storeId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  supplierId: z.union([z.literal(""), z.string().uuid()]).optional(),
  supplierReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function createPurchase(formData: FormData) {
  const parsed = schema.safeParse({
    storeId: formData.get("storeId"),
    idempotencyKey: formData.get("idempotencyKey"),
    supplierId: formData.get("supplierId") ?? "",
    supplierReference: formData.get("supplierReference") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-purchase");

  const items: { product_id: string; quantity: number; unit_cost: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("quantity_") || typeof value !== "string") continue;
    const productId = key.slice("quantity_".length);
    if (!z.string().uuid().safeParse(productId).success) redirect(`/purchases?store=${parsed.data.storeId}&error=invalid-product`);

    const quantity = Number(value);
    const unitCost = Number(formData.get(`unitCost_${productId}`));
    if (!Number.isFinite(quantity) || quantity < 0) redirect(`/purchases?store=${parsed.data.storeId}&error=invalid-quantity`);
    if (!Number.isFinite(unitCost) || unitCost < 0) redirect(`/purchases?store=${parsed.data.storeId}&error=invalid-cost`);
    if (quantity > 0) items.push({ product_id: productId, quantity, unit_cost: unitCost });
  }

  if (items.length === 0 || items.length > 100) redirect(`/purchases?store=${parsed.data.storeId}&error=empty-purchase`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_purchase_with_receipt", {
    p_store_id: parsed.data.storeId,
    p_items: items,
    p_supplier_id: parsed.data.supplierId || undefined,
    p_supplier_reference: parsed.data.supplierReference || undefined,
    p_notes: parsed.data.notes || undefined,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) redirect(`/purchases?store=${parsed.data.storeId}&error=save`);
  redirect(`/purchases?store=${parsed.data.storeId}&created=1`);
}
