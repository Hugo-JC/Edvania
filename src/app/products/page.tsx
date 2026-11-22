import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createClient } from "@/lib/supabase/server";
import { createCategory, createProduct } from "./actions";

type Props = { searchParams: Promise<{ store?: string; error?: string; created?: string; category?: string }> };

const money = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 });

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (!memberships?.length) redirect("/onboarding");

  const selected = memberships.find((membership) => membership.store_id === params.store) ?? memberships[0];
  const storeId = selected.store_id;
  const [{ data: store }, { data: products }, { data: categories }, { data: balances }] = await Promise.all([
    supabase.from("stores").select("name").eq("id", storeId).single(),
    supabase.from("products").select("id,name,sku,sale_price,cost_price,min_stock,unit,category_id,status").eq("store_id", storeId).order("name"),
    supabase.from("categories").select("id,name").eq("store_id", storeId).eq("status", "active").order("name"),
    supabase.from("inventory_balances").select("product_id,quantity_on_hand").eq("store_id", storeId),
  ]);
  const stockByProduct = new Map((balances ?? []).map((balance) => [balance.product_id, Number(balance.quantity_on_hand ?? 0)]));

  return (
    <WorkspaceShell
      active="products"
      sectionTitle="Produtos e Stock"
      storeId={storeId}
      storeName={store?.name ?? "A tua loja"}
      role={selected.role}
    >
      <div className="dashboard-content">
        <p className="eyebrow">Gestão comercial</p>
        <h1>Produtos e stock.</h1>
        <p className="muted">Regista artigos, define preços e acompanha as quantidades disponíveis no teu armazém principal.</p>
        {params.error && <p className="error" role="alert">Não foi possível guardar. Verifica os dados e as permissões da tua conta.</p>}
        {params.created && <p className="notice" role="status">Produto criado com sucesso.</p>}
        {params.category && <p className="notice" role="status">Categoria criada com sucesso.</p>}

        <section className="panel-card mt-5">
          <h2>Novo produto</h2>
          <form className="form product-form" action={createProduct}>
            <input type="hidden" name="storeId" value={storeId} />
            <label>Nome do produto<input name="name" required maxLength={180} placeholder="Ex.: Arroz 5 kg" /></label>
            <div className="form-grid">
              <label>Preço de venda (AOA)<input name="salePrice" type="number" min="0" step="0.01" required /></label>
              <label>Preço de custo (AOA)<input name="costPrice" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <label>Stock inicial<input name="openingQuantity" type="number" min="0" step="0.001" defaultValue="0" /></label>
              <label>Stock mínimo<input name="minStock" type="number" min="0" step="0.001" defaultValue="0" /></label>
            </div>
            <div className="form-grid">
              <label>Referência / SKU<input name="sku" maxLength={80} /></label>
              <label>Unidade<input name="unit" defaultValue="un" maxLength={24} required /></label>
            </div>
            <label>Categoria
              <select name="categoryId" defaultValue="">
                <option value="">Sem categoria</option>
                {categories?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <div>
              <button className="primary-button" type="submit">Guardar produto</button>
            </div>
          </form>
        </section>

        <section className="panel-card">
          <h2>Nova categoria</h2>
          <form className="inline-form" action={createCategory}>
            <input type="hidden" name="storeId" value={storeId} />
            <label className="sr-only" htmlFor="category-name">Nome da categoria</label>
            <input id="category-name" name="name" required maxLength={100} placeholder="Ex.: Bebidas" />
            <button className="quiet-button" type="submit">Adicionar</button>
          </form>
        </section>

        <section className="panel-card">
          <div className="section-heading"><h2>Catálogo</h2><span>{products?.length ?? 0} produtos</span></div>
          {!products?.length ? <p className="muted">Ainda não existem produtos. Começa por adicionar o primeiro artigo.</p> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Produto</th><th>Referência</th><th>Preço</th><th>Stock</th><th>Mínimo</th></tr></thead>
                <tbody>
                  {products.map((product) => {
                    const stock = stockByProduct.get(product.id) ?? 0;
                    return <tr key={product.id}>
                      <td><strong>{product.name}</strong><small>{product.unit} · {product.status}</small></td>
                      <td className="tabular">{product.sku || "—"}</td>
                      <td className="tabular">{money.format(Number(product.sale_price))}</td>
                      <td><span className={stock <= Number(product.min_stock) ? "stock-low" : "stock-ok"}>{stock} {product.unit}</span></td>
                      <td className="tabular">{Number(product.min_stock)} {product.unit}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
