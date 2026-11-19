import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand" href="/">Edvânia</Link>
        <p className="eyebrow">COMEÇAR É SIMPLES</p>
        <h1>Cria a tua conta.</h1>
        <p className="muted">Vamos preparar a Edvânia para acompanhar o teu negócio.</p>
        <AuthForm mode="register" />
        <p className="switch-auth">Já tens conta? <Link href="/login">Iniciar sessão</Link></p>
      </section>
    </main>
  );
}
