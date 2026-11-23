import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bot, MessageSquare, Package, ShoppingBag, Truck, Users, Wallet } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ store?: string; error?: string }> };

const money = new Intl.NumberFormat("pt-AO", {
  style: "currency",
  currency: "AOA",
  maximumFractionDigits: 2,
});

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!memberships?.length) redirect("/onboarding");

  const storeIds = memberships.map((membership) => membership.store_id);
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, currency_code")
    .in("id", storeIds);

  const selectedStore = stores?.find((s) => s.id === params.store) ?? stores?.[0];
  const storeId = selectedStore?.id ?? memberships[0].store_id;
  const role = memberships.find((m) => m.store_id === storeId)?.role ?? "employee";
  const canManage = ["owner", "admin", "manager"].includes(role);

  const [{ data: products }, { data: balances }, { data: sales }, { data: openSessions }] = await Promise.all([
    supabase.from("products").select("id, min_stock").eq("store_id", storeId).eq("status", "active"),
    supabase.from("inventory_balances").select("product_id, quantity_on_hand").eq("store_id", storeId),
    supabase.from("sales").select("id, total").eq("store_id", storeId).eq("status", "confirmed"),
    supabase.from("cash_sessions").select("id, opening_amount").eq("store_id", storeId).is("closed_at", null),
  ]);

  const stockByProduct = new Map((balances ?? []).map((b) => [b.product_id, Number(b.quantity_on_hand ?? 0)]));
  const lowStockCount = (products ?? []).filter(
    (p) => (stockByProduct.get(p.id) ?? 0) <= Number(p.min_stock ?? 0),
  ).length;
  const confirmedSalesTotal = (sales ?? []).reduce((sum, s) => sum + Number(s.total ?? 0), 0);

  return (
    <WorkspaceShell
      active="dashboard"
      sectionTitle="Painel Comercial"
      storeId={storeId}
      storeName={selectedStore?.name ?? "A tua loja"}
      role={role}
    >
      <div className="space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Resumo da loja</p>
            <h1 className="text-[clamp(1.65rem,2.8vw,2.15rem)] font-bold">
              {selectedStore?.name ?? "A tua loja"}
            </h1>
            <p className="muted mt-1">
              Visão diária das vendas, artigos em stock e estado da tesouraria.
            </p>
          </div>
          {canManage && (
            <Link href={`/sales?store=${storeId}`} className="primary-button">
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              <span>Nova venda</span>
            </Link>
          )}
        </div>

        {params.error && (
          <p className="error" role="alert">
            Não foi possível concluir o pedido solicitado. Verifica as permissões ou os dados enviados.
          </p>
        )}

        {/* Single-level KPI grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores da loja">
          <div className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
            <p className="text-[12px] font-medium text-[#596660]">Vendas confirmadas</p>
            <p className="mt-2 font-mono text-[22px] font-semibold text-[#15201C] tabular-nums">
              {money.format(confirmedSalesTotal)}
            </p>
            <p className="mt-1 text-[12px] text-[#596660] tabular-nums">
              {sales?.length ?? 0} venda(s) registada(s)
            </p>
          </div>

          <div className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
            <p className="text-[12px] font-medium text-[#596660]">Produtos activos</p>
            <p className="mt-2 font-mono text-[22px] font-semibold text-[#15201C] tabular-nums">
              {products?.length ?? 0}
            </p>
            <p className="mt-1 text-[12px] text-[#596660]">No catálogo da loja</p>
          </div>

          <div className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
            <p className="text-[12px] font-medium text-[#596660]">Reposição necessária</p>
            <p
              className={`mt-2 font-mono text-[22px] font-semibold tabular-nums ${
                lowStockCount > 0 ? "text-[#B45309]" : "text-[#15803D]"
              }`}
            >
              {lowStockCount}
            </p>
            <p className="mt-1 text-[12px] text-[#596660]">
              {lowStockCount > 0 ? "Artigo(s) no mínimo ou abaixo" : "Stock dentro dos níveis"}
            </p>
          </div>

          <div className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
            <p className="text-[12px] font-medium text-[#596660]">Sessões de caixa</p>
            <p className="mt-2 font-mono text-[22px] font-semibold text-[#15201C] tabular-nums">
              {openSessions?.length ? "Aberta" : "Fechada"}
            </p>
            <p className="mt-1 text-[12px] text-[#596660] tabular-nums">
              {openSessions?.length ?? 0} turno(s) activo(s)
            </p>
          </div>
        </section>

        {/* Quick Operational Shortcuts */}
        <section className="panel-card">
          <div className="section-heading">
            <h2>Acesso rápido às operações</h2>
            <span>{selectedStore?.currency_code ?? "AOA"}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href={`/assistant?store=${storeId}`}
              className="flex items-center justify-between rounded-xl border border-[#146C53]/30 bg-[#EAF4F0] px-4 py-3.5 text-[#0F5340] no-underline transition-colors hover:border-[#146C53]/60 hover:bg-[#DCEEE6]"
            >
              <span className="flex items-center gap-3 text-[14px] font-semibold">
                <Bot className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                Conversar com IA e WhatsApp
              </span>
              <ArrowRight className="h-4 w-4 text-[#0F5340]" aria-hidden="true" />
            </Link>

            <Link
              href={`/products?store=${storeId}`}
              className="flex items-center justify-between rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3.5 text-[#15201C] no-underline transition-colors hover:border-[#146C53]/40 hover:bg-[#EAF4F0]"
            >
              <span className="flex items-center gap-3 text-[14px] font-semibold">
                <Package className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                Produtos e stock
              </span>
              <ArrowRight className="h-4 w-4 text-[#596660]" aria-hidden="true" />
            </Link>

            {canManage && (
              <>
                <Link
                  href={`/sales?store=${storeId}`}
                  className="flex items-center justify-between rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3.5 text-[#15201C] no-underline transition-colors hover:border-[#146C53]/40 hover:bg-[#EAF4F0]"
                >
                  <span className="flex items-center gap-3 text-[14px] font-semibold">
                    <ShoppingBag className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                    Registar vendas
                  </span>
                  <ArrowRight className="h-4 w-4 text-[#596660]" aria-hidden="true" />
                </Link>

                <Link
                  href={`/purchases?store=${storeId}`}
                  className="flex items-center justify-between rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3.5 text-[#15201C] no-underline transition-colors hover:border-[#146C53]/40 hover:bg-[#EAF4F0]"
                >
                  <span className="flex items-center gap-3 text-[14px] font-semibold">
                    <Truck className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                    Registar compras
                  </span>
                  <ArrowRight className="h-4 w-4 text-[#596660]" aria-hidden="true" />
                </Link>

                <Link
                  href={`/cash?store=${storeId}`}
                  className="flex items-center justify-between rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3.5 text-[#15201C] no-underline transition-colors hover:border-[#146C53]/40 hover:bg-[#EAF4F0]"
                >
                  <span className="flex items-center gap-3 text-[14px] font-semibold">
                    <Wallet className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                    Caixa e despesas
                  </span>
                  <ArrowRight className="h-4 w-4 text-[#596660]" aria-hidden="true" />
                </Link>

                <Link
                  href={`/customers?store=${storeId}`}
                  className="flex items-center justify-between rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3.5 text-[#15201C] no-underline transition-colors hover:border-[#146C53]/40 hover:bg-[#EAF4F0]"
                >
                  <span className="flex items-center gap-3 text-[14px] font-semibold">
                    <Users className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                    Clientes e fornecedores
                  </span>
                  <ArrowRight className="h-4 w-4 text-[#596660]" aria-hidden="true" />
                </Link>

                <Link
                  href={`/whatsapp?store=${storeId}`}
                  className="flex items-center justify-between rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3.5 text-[#15201C] no-underline transition-colors hover:border-[#146C53]/40 hover:bg-[#EAF4F0]"
                >
                  <span className="flex items-center gap-3 text-[14px] font-semibold">
                    <MessageSquare className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                    WhatsApp e assistente
                  </span>
                  <ArrowRight className="h-4 w-4 text-[#596660]" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </section>

        {/* Associated Stores */}
        <section className="panel-card">
          <div className="section-heading">
            <h2>Lojas associadas à tua conta</h2>
            <span>{stores?.length ?? 0} loja(s)</span>
          </div>
          <div className="store-list">
            {stores?.map((store) => {
              const storeRole =
                memberships.find((membership) => membership.store_id === store.id)?.role ?? "employee";
              return (
                <article className="store-card" key={store.id}>
                  <div>
                    <strong>{store.name}</strong>
                    <span>
                      {store.currency_code} <span aria-hidden="true">·</span> {storeRole}
                    </span>
                  </div>
                  <div className="store-actions">
                    <Link className="quiet-button" href={`/dashboard?store=${store.id}`}>
                      Seleccionar loja
                    </Link>
                    <Link className="quiet-button" href={`/settings?store=${store.id}`}>
                      Definições
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
