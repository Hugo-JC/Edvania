import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createClient } from "@/lib/supabase/server";
import { PurchaseForm } from "./purchase-form";

type Props = { searchParams: Promise<{ store?: string; error?: string; created?: string }> };
const money = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 });

export default async function PurchasesPage({ searchParams }: Props) {
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

  const [{ data: store }, { data: products }, { data: suppliers }, { data: purchases }] = await Promise.all([
    supabase.from("stores").select("name").eq("id", storeId).single(),
    supabase.from("products").select("id,name,sku,cost_price,unit,track_stock").eq("store_id", storeId).eq("status", "active").order("name"),
    supabase.from("suppliers").select("id,name").eq("store_id", storeId).eq("status", "active").order("name"),
    supabase.from("purchases").select("id,purchase_number,status,total,received_at,created_at,supplier_id,supplier_reference").eq("store_id", storeId).order("created_at", { ascending: false }).limit(20),
  ]);
  const supplierNames = new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier.name]));

  return (
    <WorkspaceShell
      active="purchases"
      sectionTitle="Compras e Recepção"
      storeId={storeId}
      storeName={store?.name ?? "A tua loja"}
      role={selected.role}
    >
      <div className="dashboard-content">
        <p className="eyebrow">Compras e aprovisionamento</p>
        <h1>Registar compra.</h1>
        <p className="muted">Regista os artigos recebidos. A entrada no stock e o registo da compra são confirmados na mesma transacção.</p>
        {params.error && <p className="error" role="alert">Não foi possível registar a compra. Confirma os artigos, custos e permissões.</p>}
        {params.created && <p className="notice" role="status">Compra registada e stock actualizado.</p>}

        <section className="panel-card mt-5">
          <h2>Nova compra e recepção</h2>
          <PurchaseForm
            idempotencyKey={randomUUID()}
            products={products ?? []}
            storeId={storeId}
            suppliers={suppliers ?? []}
          />
        </section>

        <section className="panel-card">
          <div className="section-heading"><h2>Compras recentes</h2><span>{purchases?.length ?? 0} registos</span></div>
          {!purchases?.length ? <p className="muted">Ainda não existem compras registadas.</p> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Compra</th><th>Data de recepção</th><th>Fornecedor</th><th>Referência</th><th>Total</th><th>Estado</th></tr></thead>
              <tbody>{purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td className="tabular">#{purchase.purchase_number}</td>
                  <td className="tabular">{new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Luanda" }).format(new Date(purchase.received_at ?? purchase.created_at))}</td>
                  <td>{purchase.supplier_id ? supplierNames.get(purchase.supplier_id) ?? "Fornecedor" : "—"}</td>
                  <td className="tabular">{purchase.supplier_reference || "—"}</td>
                  <td className="tabular">{money.format(Number(purchase.total))}</td>
                  <td>{purchase.status === "received" ? "Recebida" : purchase.status}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
