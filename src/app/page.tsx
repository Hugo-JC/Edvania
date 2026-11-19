import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="welcome-title">
        <p className="eyebrow">ASSISTENTE COMERCIAL</p>
        <h1 id="welcome-title">A tua loja, mais simples de gerir.</h1>
        <p className="intro">
          A Edvânia liga produtos, stock, vendas, caixa e atendimento num único sistema,
          pensado para comerciantes em Angola.
        </p>
        <div className="status" role="status"><span className="status-dot" /> A tua gestão começa aqui</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
          <Link className="primary-button" href="/register" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Criar conta</Link>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", padding: "12px 16px" }}>Iniciar sessão</Link>
        </div>
      </section>
      <footer>Edvânia · Feita para o comércio angolano · AOA</footer>
    </main>
  );
}
