import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { PageEntrance } from "@/components/motion-primitives";

export default function RegisterPage() {
  return (
    <main className="auth-shell">
      <PageEntrance className="w-full flex justify-center">
        <section className="auth-card">
          <Link className="brand" href="/">
            Edvânia
          </Link>
          <p className="eyebrow">Nova conta</p>
          <h1>Cria a tua conta.</h1>
          <p className="muted">Em menos de um minuto configuras a tua loja e começas a registar artigos e vendas.</p>
          <AuthForm mode="register" />
          <p className="switch-auth">
            Já tens conta? <Link href="/login">Iniciar sessão</Link>
          </p>
        </section>
      </PageEntrance>
    </main>
  );
}
