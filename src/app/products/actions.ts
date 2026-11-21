"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const productSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  sku: z.string().trim().max(80).optional(),
  categoryId: z.string().uuid().optional(),
  salePrice: z.coerce.number().finite().min(0),
  costPrice: z.coerce.number().finite().min(0),
  minStock: z.coerce.number().finite().min(0),
  openingQuantity: z.coerce.number().finite().min(0),
  unit: z.string().trim().min(1).max(24),
});

const categorySchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});

export async function createProduct(formData: FormData) {
  const parsed = productSchema.safeParse({
    storeId: formData.get("storeId"),
    name: formData.get("name"),
    sku: formData.get("sku") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    salePrice: formData.get("salePrice"),
    costPrice: formData.get("costPrice") || "0",
    minStock: formData.get("minStock") || "0",
    openingQuantity: formData.get("openingQuantity") || "0",
    unit: formData.get("unit") || "un",
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-product");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_product_with_audit", {
    p_store_id: parsed.data.storeId,
    p_name: parsed.data.name,
    p_sale_price: parsed.data.salePrice,
    p_cost_price: parsed.data.costPrice,
    p_sku: parsed.data.sku || undefined,
    p_category_id: parsed.data.categoryId || undefined,
    p_min_stock: parsed.data.minStock,
    p_opening_quantity: parsed.data.openingQuantity,
    p_unit: parsed.data.unit,
  });

  if (error) redirect(`/products?store=${parsed.data.storeId}&error=save`);
  redirect(`/products?store=${parsed.data.storeId}&created=1`);
}

export async function createCategory(formData: FormData) {
  const parsed = categorySchema.safeParse({
    storeId: formData.get("storeId"),
    name: formData.get("name"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-category");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_category_with_audit", {
    p_store_id: parsed.data.storeId,
    p_name: parsed.data.name,
  });
  if (error) redirect(`/products?store=${parsed.data.storeId}&error=category`);
  redirect(`/products?store=${parsed.data.storeId}&category=created`);
}
