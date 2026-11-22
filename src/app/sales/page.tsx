import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createClient } from "@/lib/supabase/server";
import { SaleForm } from "./sale-form";

type Props = { searchParams: Promise<{ store?: string; error?: string; created?: string }> };
const money = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 });

export default async function SalesPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase.from("store_memberships")
    .select("store_id, role").eq("user_id", user.id).eq("status", "active");
  if (!memberships?.length) redirect("/onboarding");

  const selected = memberships.find((membership) => membership.store_id === params.store) ?? memberships[0];
  const storeId = selected.store_id;
  if (!["owner", "admin", "manager"].includes(selected.role)) redirect("/dashboard");

  const [{ data: store }, { data: products }, { data: balances }, { data: customers }, { data: sales }] = await Promise.all([
    supabase.from("stores").select("name").eq("id", storeId).single(),
    supabase.from("products").select("id,name,sku,sale_price,unit,track_stock").eq("store_id", storeId).eq("status", "active").eq("track_stock", true).order("name"),
    supabase.from("inventory_balances").select("product_id,quantity_on_hand").eq("store_id", storeId),
    supabase.from("customers").select("id,name").eq("store_id", storeId).eq("status", "active").order("name"),
    supabase.from("sales").select("id,sale_number,status,total,sold_at,created_at").eq("store_id", storeId).order("created_at", { ascending: false }).limit(20),
  ]);
  const stockByProduct = new Map((balances ?? []).map((item) => [item.product_id, Number(item.quantity_on_hand ?? 0)]));
  const saleIds = (sales ?? []).map((sale) => sale.id);
  const { data: payments } = saleIds.length
    ? await supabase.from("payments").select("sale_id,amount,status").in("sale_id", saleIds)
    : { data: [] };
  const paidBySale = new Map<string, number>();
  for (const payment of payments ?? []) {
    if (payment.status === "confirmed") {
      paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) ?? 0) + Number(payment.amount));
    }
  }

  return (
    <WorkspaceShell
      active="sales"
      sectionTitle="Vendas"
      storeId={storeId}
      storeName={store?.name ?? "A tua loja"}
      role={selected.role}
    >
      <div className="dashboard-content">
        <p className="eyebrow">Gestão comercial</p>
        <h1>Registar venda.</h1>
        <p className="muted">Selecciona os artigos e quantidades. Os preços e totais são calculados pelo servidor com base no catálogo.</p>
        {params.error && <p className="error" role="alert">Não foi possível registar a venda. Confirma o stock e os dados introduzidos.</p>}
        {params.created && <p className="notice" role="status">Venda registada com sucesso.</p>}

        <section className="panel-card mt-5">
          <h2>Nova venda</h2>
          <SaleForm
            customers={customers ?? []}
            idempotencyKey={randomUUID()}
            products={(products ?? []).map((product) => ({ ...product, stock: stockByProduct.get(product.id) ?? 0 }))}
            storeId={storeId}
          />
        </section>

        <section className="panel-card">
          <div className="section-heading"><h2>Vendas recentes</h2><span>{sales?.length ?? 0} registos</span></div>
          {!sales?.length ? <p className="muted">Ainda não existem vendas registadas.</p> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Venda</th><th>Data</th><th>Estado</th><th>Total</th><th>Recebido</th><th>Em falta</th></tr></thead>
              <tbody>{sales.map((sale) => <tr key={sale.id}>
                <td className="tabular">#{sale.sale_number}</td>
                <td className="tabular">{new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Luanda" }).format(new Date(sale.sold_at ?? sale.created_at))}</td>
                <td>{sale.status === "confirmed" ? "Confirmada" : sale.status}</td>
                <td className="tabular">{money.format(Number(sale.total))}</td>
                <td className="tabular">{money.format(paidBySale.get(sale.id) ?? 0)}</td>
                <td className="tabular">{money.format(Math.max(0, Number(sale.total) - (paidBySale.get(sale.id) ?? 0)))}</td>
              </tr>)}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
