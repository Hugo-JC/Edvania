import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPurchase } from "./actions";

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
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link className="brand" href="/dashboard">Edvânia</Link>
        <nav className="header-actions"><Link href="/dashboard">Painel</Link><Link href={`/products?store=${storeId}`}>Produtos</Link><span>{store?.name ?? "A tua loja"}</span></nav>
      </header>
      <section className="dashboard-content">
        <p className="eyebrow">COMPRAS E APROVISIONAMENTO</p>
        <h1>Registar compra.</h1>
        <p className="muted">Regista os artigos recebidos. A entrada no stock e o registo da compra são confirmados na mesma transacção.</p>
        {params.error && <p className="error" role="alert">Não foi possível registar a compra. Confirma os artigos, custos e permissões.</p>}
        {params.created && <p className="notice" role="status">Compra registada e stock actualizado.</p>}

        <section className="panel-card">
          <h2>Nova compra e recepção</h2>
          <form className="form product-form" action={createPurchase}>
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <div className="form-grid">
              <label>Fornecedor (opcional)
                <select name="supplierId" defaultValue="">
                  <option value="">Sem fornecedor associado</option>
                  {suppliers?.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <label>Referência da factura / guia
                <input name="supplierReference" maxLength={120} placeholder="Ex.: FT 2026/001" />
              </label>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Produto</th><th>Unidade</th><th>Custo unitário (AOA)</th><th>Quantidade recebida</th></tr></thead>
                <tbody>
                  {products?.map((product) => (
                    <tr key={product.id}>
                      <td><strong>{product.name}</strong><small>{product.sku || (product.track_stock ? "Controla stock" : "Sem controlo de stock")}</small></td>
                      <td>{product.unit}</td>
                      <td><input aria-label={`Custo unitário de ${product.name}`} name={`unitCost_${product.id}`} type="number" min="0" step="0.01" defaultValue={Number(product.cost_price)} /></td>
                      <td><input aria-label={`Quantidade recebida de ${product.name}`} name={`quantity_${product.id}`} type="number" min="0" step="0.001" defaultValue="0" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!products?.length && <p className="muted">Adiciona produtos ao catálogo antes de registar uma compra.</p>}
            <label>Observações<input name="notes" maxLength={500} /></label>
            <button className="primary-button" type="submit" disabled={!products?.length}>Confirmar compra e entrada no stock</button>
          </form>
        </section>

        <section className="panel-card">
          <div className="section-heading"><h2>Compras recentes</h2><span>{purchases?.length ?? 0} registos</span></div>
          {!purchases?.length ? <p className="muted">Ainda não existem compras registadas.</p> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Compra</th><th>Data de recepção</th><th>Fornecedor</th><th>Referência</th><th>Total</th><th>Estado</th></tr></thead>
              <tbody>{purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>#{purchase.purchase_number}</td>
                  <td>{new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Luanda" }).format(new Date(purchase.received_at ?? purchase.created_at))}</td>
                  <td>{purchase.supplier_id ? supplierNames.get(purchase.supplier_id) ?? "Fornecedor" : "—"}</td>
                  <td>{purchase.supplier_reference || "—"}</td>
                  <td>{money.format(Number(purchase.total))}</td>
                  <td>{purchase.status === "received" ? "Recebida" : purchase.status}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </section>
    </main>
  );
}
