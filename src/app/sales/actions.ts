"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  storeId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  paymentMethod: z.enum(["cash", "bank_transfer", "multicaixa_reference", "multicaixa_express", "other"]),
  paidAmount: z.coerce.number().finite().min(0),
  customerId: z.union([z.literal(""), z.string().uuid()]).optional(),
  notes: z.string().max(500).optional(),
});

export async function createSale(formData: FormData) {
  const parsed = schema.safeParse({
    storeId: formData.get("storeId"),
    idempotencyKey: formData.get("idempotencyKey"),
    paymentMethod: formData.get("paymentMethod"),
    paidAmount: formData.get("paidAmount"),
    customerId: formData.get("customerId") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-sale");

  const items: { product_id: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("quantity_") || typeof value !== "string") continue;
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity < 0) redirect(`/sales?store=${parsed.data.storeId}&error=invalid-quantity`);
    if (quantity > 0) {
      const productId = key.slice("quantity_".length);
      if (!z.string().uuid().safeParse(productId).success) redirect(`/sales?store=${parsed.data.storeId}&error=invalid-product`);
      items.push({ product_id: productId, quantity });
    }
  }

  if (items.length === 0 || items.length > 100) redirect(`/sales?store=${parsed.data.storeId}&error=empty-sale`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_sale_with_payment", {
    p_store_id: parsed.data.storeId,
    p_items: items,
    p_payment_method: parsed.data.paymentMethod,
    p_paid_amount: parsed.data.paidAmount,
    p_customer_id: parsed.data.customerId || null,
    p_notes: parsed.data.notes || null,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) redirect(`/sales?store=${parsed.data.storeId}&error=sale-failed`);
  redirect(`/sales?store=${parsed.data.storeId}&created=1`);
}
