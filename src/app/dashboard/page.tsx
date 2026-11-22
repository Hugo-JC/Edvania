import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link className="brand" href="/">Edvânia</Link>
        <form action={signOut}><button className="quiet-button" type="submit">Terminar sessão</button></form>
      </header>
      <section className="dashboard-content">
        <p className="eyebrow">PAINEL COMERCIAL</p>
        <h1>O teu negócio começa aqui.</h1>
        <p className="muted">A tua conta está ligada à seguinte loja:</p>
        <div className="store-list">
          {stores?.map((store) => (
            <article className="store-card" key={store.id}>
              <div><strong>{store.name}</strong><span>{store.currency_code} · Loja activa</span></div>
              <div className="store-actions">
                <span className="role">{memberships.find((membership) => membership.store_id === store.id)?.role}</span>
                <Link className="quiet-button" href={`/products?store=${store.id}`}>Gerir produtos</Link>
                {["owner", "admin", "manager"].includes(memberships.find((membership) => membership.store_id === store.id)?.role ?? "") && (
                  <>
                    <Link className="quiet-button" href={`/sales?store=${store.id}`}>Registar vendas</Link>
                    <Link className="quiet-button" href={`/purchases?store=${store.id}`}>Registar compras</Link>
                    <Link className="quiet-button" href={`/cash?store=${store.id}`}>Caixa</Link>
                    <Link className="quiet-button" href={`/whatsapp?store=${store.id}`}>WhatsApp</Link>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        <p className="muted">Gere produtos, stock, vendas, compras, caixa e o canal sandbox WhatsApp a partir do painel.</p>
      </section>
    </main>
  );
}
