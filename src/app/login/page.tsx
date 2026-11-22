import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { PageEntrance } from "@/components/motion-primitives";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <PageEntrance className="w-full flex justify-center">
        <section className="auth-card">
          <Link className="brand" href="/">
            Edvânia
          </Link>
          <p className="eyebrow">Acesso à loja</p>
          <h1>Entra na tua conta.</h1>
          <p className="muted">Continua a gerir vendas, stock e caixa num ambiente tranquilo e organizado.</p>
          <AuthForm mode="login" />
          <p className="switch-auth">
            Ainda não tens conta? <Link href="/register">Criar conta</Link>
          </p>
        </section>
      </PageEntrance>
    </main>
  );
}
