import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createClient } from "@/lib/supabase/server";
import { createCustomer, createSupplier } from "./actions";

type Props = { searchParams: Promise<{ store?: string; error?: string; notice?: string }> };

const money = new Intl.NumberFormat("pt-AO", {
  style: "currency",
  currency: "AOA",
  maximumFractionDigits: 2,
});

export default async function CustomersPage({ searchParams }: Props) {
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

  const selected = memberships.find((m) => m.store_id === params.store) ?? memberships[0];
  const storeId = selected.store_id;
  if (!["owner", "admin", "manager"].includes(selected.role)) redirect("/dashboard");

  const [{ data: store }, { data: customers }, { data: suppliers }, { data: sales }, { data: payments }] =
    await Promise.all([
      supabase.from("stores").select("name").eq("id", storeId).single(),
      supabase
        .from("customers")
        .select("id,name,phone_e164,email,tax_number,status")
        .eq("store_id", storeId)
        .order("name"),
      supabase
        .from("suppliers")
        .select("id,name,phone_e164,email,tax_number,status")
        .eq("store_id", storeId)
        .order("name"),
      supabase
        .from("sales")
        .select("id,customer_id,total,status")
        .eq("store_id", storeId)
        .eq("status", "confirmed"),
      supabase
        .from("payments")
        .select("sale_id,amount,status")
        .eq("store_id", storeId)
        .eq("status", "confirmed"),
    ]);

  const paidBySale = new Map<string, number>();
  for (const p of payments ?? []) {
    if (p.sale_id) {
      paidBySale.set(p.sale_id, (paidBySale.get(p.sale_id) ?? 0) + Number(p.amount ?? 0));
    }
  }

  const outstandingByCustomer = new Map<string, number>();
  for (const s of sales ?? []) {
    if (!s.customer_id) continue;
    const unpaid = Math.max(0, Number(s.total ?? 0) - (paidBySale.get(s.id) ?? 0));
    outstandingByCustomer.set(s.customer_id, (outstandingByCustomer.get(s.customer_id) ?? 0) + unpaid);
  }

  return (
    <WorkspaceShell
      active="customers"
      sectionTitle="Clientes e Fornecedores"
      storeId={storeId}
      storeName={store?.name ?? "A tua loja"}
      role={selected.role}
    >
      <div className="dashboard-content">
        <p className="eyebrow">Relações comerciais</p>
        <h1>Clientes e fornecedores.</h1>
        <p className="muted">
          Regista contactos frequentes, NIF e acompanha saldos pendentes de clientes com auditoria na loja.
        </p>

        {params.error && (
          <p className="error" role="alert">
            Não foi possível guardar o registo. Confirma os dados introduzidos e tenta novamente.
          </p>
        )}
        {params.notice === "customer" && (
          <p className="notice" role="status">
            Cliente registado com sucesso.
          </p>
        )}
        {params.notice === "supplier" && (
          <p className="notice" role="status">
            Fornecedor registado com sucesso.
          </p>
        )}

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="panel-card !mb-0">
            <h2>Novo cliente</h2>
            <form className="form" action={createCustomer}>
              <input type="hidden" name="storeId" value={storeId} />
              <label>
                Nome do cliente
                <input name="name" required minLength={2} maxLength={180} placeholder="Ex.: Maria Manuel" />
              </label>
              <div className="form-grid">
                <label>
                  Telefone (E.164)
                  <input name="phone" maxLength={32} placeholder="+244923000000" />
                </label>
                <label>
                  NIF (opcional)
                  <input name="taxNumber" maxLength={64} placeholder="5401234567" />
                </label>
              </div>
              <label>
                Email (opcional)
                <input name="email" type="email" maxLength={180} placeholder="cliente@exemplo.ao" />
              </label>
              <div>
                <button className="primary-button" type="submit">
                  Guardar cliente
                </button>
              </div>
            </form>
          </section>

          <section className="panel-card !mb-0">
            <h2>Novo fornecedor</h2>
            <form className="form" action={createSupplier}>
              <input type="hidden" name="storeId" value={storeId} />
              <label>
                Nome do fornecedor
                <input name="name" required minLength={2} maxLength={180} placeholder="Ex.: Distribuidora Cazenga" />
              </label>
              <div className="form-grid">
                <label>
                  Telefone (E.164)
                  <input name="phone" maxLength={32} placeholder="+244923000000" />
                </label>
                <label>
                  NIF (opcional)
                  <input name="taxNumber" maxLength={64} placeholder="5409876543" />
                </label>
              </div>
              <label>
                Email (opcional)
                <input name="email" type="email" maxLength={180} placeholder="comercial@fornecedor.ao" />
              </label>
              <div>
                <button className="quiet-button" type="submit">
                  Guardar fornecedor
                </button>
              </div>
            </form>
          </section>
        </div>

        <section className="panel-card mt-5">
          <div className="section-heading">
            <h2>Carteira de clientes</h2>
            <span>{customers?.length ?? 0} registo(s)</span>
          </div>
          {!customers?.length ? (
            <p className="muted">Ainda não existem clientes registados nesta loja.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Telefone</th>
                    <th>NIF</th>
                    <th>Saldo em aberto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const balance = outstandingByCustomer.get(customer.id) ?? 0;
                    return (
                      <tr key={customer.id}>
                        <td>
                          <strong>{customer.name}</strong>
                          {customer.email && <small>{customer.email}</small>}
                        </td>
                        <td className="tabular">{customer.phone_e164 || "—"}</td>
                        <td className="tabular">{customer.tax_number || "—"}</td>
                        <td className={`tabular font-medium ${balance > 0 ? "text-[#B45309]" : "text-[#15803D]"}`}>
                          {money.format(balance)}
                        </td>
                        <td>{customer.status === "active" ? "Activo" : customer.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="section-heading">
            <h2>Fornecedores</h2>
            <span>{suppliers?.length ?? 0} registo(s)</span>
          </div>
          {!suppliers?.length ? (
            <p className="muted">Ainda não existem fornecedores registados nesta loja.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Telefone</th>
                    <th>NIF</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>
                        <strong>{supplier.name}</strong>
                        {supplier.email && <small>{supplier.email}</small>}
                      </td>
                      <td className="tabular">{supplier.phone_e164 || "—"}</td>
                      <td className="tabular">{supplier.tax_number || "—"}</td>
                      <td>{supplier.status === "active" ? "Activo" : supplier.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
