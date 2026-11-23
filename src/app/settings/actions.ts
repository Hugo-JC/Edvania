"use server";

import {redirect} from "next/navigation";
import {z} from "zod";
import {getSupabaseAdminClient} from "@/lib/supabase/admin";
import {createClient} from "@/lib/supabase/server";
import {normalizeAngolaOrE164Phone} from "@/lib/whatsapp/baileys-utils";

const uuid = z.string().uuid();

const profileSchema = z.object({
  storeId: uuid,
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).optional(),
  taxNumber: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(160).optional(),
  address: z.string().trim().max(250).optional(),
});

export async function updateStoreProfile(formData: FormData) {
  const rawStoreId = String(formData.get("storeId") ?? "");
  const parsed = profileSchema.safeParse({
    storeId: rawStoreId,
    name: formData.get("name"),
    legalName: formData.get("legalName") || undefined,
    taxNumber: formData.get("taxNumber") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    address: formData.get("address") || undefined,
  });

  if (!parsed.success) {
    redirect(uuid.safeParse(rawStoreId).success ? `/settings?store=${rawStoreId}&error=invalid-profile` : "/dashboard");
  }

  const {storeId, name, legalName, taxNumber, phone, email, address} = parsed.data;
  let normalizedPhone: string | null = null;
  if (phone) {
    const parsedPhone = normalizeAngolaOrE164Phone(phone);
    if (!parsedPhone) {
      redirect(`/settings?store=${storeId}&error=invalid-phone`);
    }
    normalizedPhone = parsedPhone.e164;
  }

  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {data: membership} = await supabase
    .from("store_memberships")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
    redirect("/dashboard?error=forbidden");
  }

  const writer = getSupabaseAdminClient() ?? supabase;
  const now = new Date().toISOString();
  const {error} = await writer
    .from("stores")
    .update({
      name,
      legal_name: legalName ?? null,
      tax_number: taxNumber ?? null,
      phone_e164: normalizedPhone,
      email: email ?? null,
      address: address ?? null,
      updated_at: now,
    })
    .eq("id", storeId);

  if (error) {
    redirect(`/settings?store=${storeId}&error=update-failed`);
  }

  const admin = getSupabaseAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      store_id: storeId,
      actor_user_id: user.id,
      action: "store.updated",
      entity_type: "store",
      entity_id: storeId,
    });
  }

  redirect(`/settings?store=${storeId}&notice=profile-updated`);
}

const memberAccessSchema = z.object({
  storeId: uuid,
  membershipId: uuid,
  role: z.enum(["owner", "admin", "manager", "employee"]),
  status: z.enum(["active", "inactive", "archived"]),
});

export async function updateMemberAccess(formData: FormData) {
  const rawStoreId = String(formData.get("storeId") ?? "");
  const parsed = memberAccessSchema.safeParse({
    storeId: rawStoreId,
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirect(uuid.safeParse(rawStoreId).success ? `/settings?store=${rawStoreId}&error=invalid-member` : "/dashboard");
  }

  const {storeId, membershipId, role, status} = parsed.data;
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {data: actorMembership} = await supabase
    .from("store_memberships")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (actorMembership?.role !== "owner") {
    redirect(`/settings?store=${storeId}&error=owner-only`);
  }

  const {data: targetMembership} = await supabase
    .from("store_memberships")
    .select("id, user_id, role, status")
    .eq("store_id", storeId)
    .eq("id", membershipId)
    .maybeSingle();

  if (!targetMembership) {
    redirect(`/settings?store=${storeId}&error=member-not-found`);
  }

  // Prevent removing or suspending the last active owner of the store.
  if (targetMembership.role === "owner" && (role !== "owner" || status !== "active")) {
    const {data: activeOwners} = await supabase
      .from("store_memberships")
      .select("id")
      .eq("store_id", storeId)
      .eq("role", "owner")
      .eq("status", "active");
    if ((activeOwners?.length ?? 0) <= 1) {
      redirect(`/settings?store=${storeId}&error=last-owner`);
    }
  }

  const admin = getSupabaseAdminClient();
  const {error} = admin
    ? await admin
        .from("store_memberships")
        .update({role, status})
        .eq("store_id", storeId)
        .eq("id", membershipId)
    : await supabase
        .from("store_memberships")
        .update({role, status})
        .eq("store_id", storeId)
        .eq("id", membershipId);

  if (error) {
    redirect(`/settings?store=${storeId}&error=update-failed`);
  }

  if (admin) {
    await admin.from("audit_logs").insert({
      store_id: storeId,
      actor_user_id: user.id,
      action: "membership.updated",
      entity_type: "store_membership",
      entity_id: membershipId,
      metadata: {role, status},
    });
  }

  redirect(`/settings?store=${storeId}&notice=member-updated`);
}
