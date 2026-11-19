import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createStore } from "./actions";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function OnboardingPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("store_memberships")
    .select("store_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);

  if (memberships?.length) redirect("/dashboard");

  const params = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="brand">Edvânia</span>
        <p className="eyebrow">PRIMEIRO PASSO</p>
        <h1>Vamos conhecer a tua loja.</h1>
        <p className="muted">Começa pelo nome. Poderás completar os restantes dados no painel.</p>
        {params.error && <p className="error" role="alert">Não foi possível criar a loja. Confirma o nome e tenta novamente.</p>}
        <form className="form" action={createStore}>
          <label>
            Nome da loja ou negócio
            <input name="name" required minLength={2} maxLength={120} placeholder="Ex.: Minimercado da Vila" />
          </label>
          <button className="primary-button" type="submit">Criar a minha loja</button>
        </form>
      </section>
    </main>
  );
}
