"use server";

import {redirect} from "next/navigation";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getSandboxWhatsAppRuntime} from "@/lib/whatsapp/sandbox-runtime.server";

const uuid = z.string().uuid();

async function authorizeWhatsAppOperator(storeId: string) {
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
  return {supabase, user};
}

export async function connectSandboxSession(formData: FormData) {
  const parsed = z.object({storeId: uuid, connectionId: uuid}).safeParse({
    storeId: formData.get("storeId"),
    connectionId: formData.get("connectionId"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-whatsapp");

  await authorizeWhatsAppOperator(parsed.data.storeId);
  const runtime = getSandboxWhatsAppRuntime();
  await runtime.connect(parsed.data.storeId, parsed.data.connectionId);
  redirect(`/whatsapp?store=${parsed.data.storeId}&notice=qr`);
}

export async function confirmSandboxSession(formData: FormData) {
  const parsed = z.object({storeId: uuid, connectionId: uuid}).safeParse({
    storeId: formData.get("storeId"),
    connectionId: formData.get("connectionId"),
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-whatsapp");

  await authorizeWhatsAppOperator(parsed.data.storeId);
  const runtime = getSandboxWhatsAppRuntime();
  runtime.confirmPairing(parsed.data.storeId, parsed.data.connectionId);
  redirect(`/whatsapp?store=${parsed.data.storeId}&notice=connected`);
}

export async function disconnectSandboxSession(formData: FormData) {
  const parsed = z.object({
    storeId: uuid,
    connectionId: uuid,
    logout: z.enum(["true", "false"]).optional(),
  }).safeParse({
    storeId: formData.get("storeId"),
    connectionId: formData.get("connectionId"),
    logout: formData.get("logout") ?? "false",
  });
  if (!parsed.success) redirect("/dashboard?error=invalid-whatsapp");

  await authorizeWhatsAppOperator(parsed.data.storeId);
  const runtime = getSandboxWhatsAppRuntime();
  await runtime.disconnect(parsed.data.storeId, parsed.data.connectionId, parsed.data.logout === "true");
  redirect(`/whatsapp?store=${parsed.data.storeId}&notice=disconnected`);
}

export async function simulateInboundSandboxMessage(formData: FormData) {
  const parsed = z.object({
    storeId: uuid,
    connectionId: uuid,
    senderPhone: z.string().trim().regex(/^[0-9]{6,15}$/),
    contactName: z.string().trim().max(100).optional(),
    body: z.string().trim().min(1).max(1000),
  }).safeParse({
    storeId: formData.get("storeId"),
    connectionId: formData.get("connectionId"),
    senderPhone: formData.get("senderPhone"),
    contactName: formData.get("contactName") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) {
    const storeId = String(formData.get("storeId") ?? "");
    redirect(uuid.safeParse(storeId).success ? `/whatsapp?store=${storeId}&error=invalid-message` : "/dashboard");
  }

  const {user} = await authorizeWhatsAppOperator(parsed.data.storeId);
  const runtime = getSandboxWhatsAppRuntime();
  try {
    const result = await runtime.simulateInboundAndReply({
      storeId: parsed.data.storeId,
      userId: user.id,
      connectionId: parsed.data.connectionId,
      senderJid: `${parsed.data.senderPhone}@s.whatsapp.net`,
      contactName: parsed.data.contactName,
      body: parsed.data.body,
    });
    redirect(`/whatsapp?store=${parsed.data.storeId}&notice=simulated&outbox=${result.outboxStatus}`);
  } catch {
    redirect(`/whatsapp?store=${parsed.data.storeId}&error=simulation-failed`);
  }
}
