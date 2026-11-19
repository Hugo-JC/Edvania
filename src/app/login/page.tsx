import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand" href="/">Edvânia</Link>
        <p className="eyebrow">BEM-VINDO DE VOLTA</p>
        <h1>Entra na tua conta.</h1>
        <p className="muted">Continua a gerir o teu negócio num só lugar.</p>
        <AuthForm mode="login" />
        <p className="switch-auth">Ainda não tens conta? <Link href="/register">Criar conta</Link></p>
      </section>
    </main>
  );
}
