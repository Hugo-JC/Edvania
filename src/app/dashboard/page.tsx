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
              <span className="role">{memberships.find((membership) => membership.store_id === store.id)?.role}</span>
            </article>
          ))}
        </div>
        <p className="muted">Próxima etapa: configurar produtos, stock e movimentos de caixa.</p>
      </section>
    </main>
  );
}
