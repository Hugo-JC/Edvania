export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="welcome-title">
        <p className="eyebrow">ASSISTENTE COMERCIAL</p>
        <h1 id="welcome-title">A tua loja, mais simples de gerir.</h1>
        <p className="intro">
          A Edvânia está a preparar a sua base: produtos, stock, vendas, caixa e atendimento,
          ligados num único sistema para comerciantes em Angola.
        </p>
        <div className="status" role="status">
          <span className="status-dot" /> Fundação do projecto criada
        </div>
      </section>
      <footer>Edvânia · Feita para o comércio angolano · AOA</footer>
    </main>
  );
}
