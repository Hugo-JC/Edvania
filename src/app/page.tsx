import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { LandingPreview } from "@/components/landing-preview";
import { PageEntrance } from "@/components/motion-primitives";

const CAPABILITIES = [
  {
    index: "01",
    title: "Catálogo, stock e compras em ledger",
    detail:
      "Cada recepção de compra e cada venda registam movimentos auditados de stock em vez de números editáveis manualmente.",
  },
  {
    index: "02",
    title: "Vendas e caixa com reconciliação real",
    detail:
      "Abertura, reforços, levantamentos, despesas operacionais e fecho de caixa validados numa única transacção no servidor.",
  },
  {
    index: "03",
    title: "Atendimento WhatsApp e assistente controlado",
    detail:
      "Consultas de preço e disponibilidade usam o catálogo real da loja; operações comerciais pedem confirmação explícita antes de gravar.",
  },
  {
    index: "04",
    title: "Isolamento por loja e papéis de equipa",
    detail:
      "Proprietário, administrador, gestor e operador acedem apenas aos registos e acções da sua própria loja.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#15201C]">
      {/* Top Bar Contract: 3 zones, gap-8, single-line controls */}
      <header className="border-b border-[#E2E7E3] bg-white">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between gap-8 px-5 sm:px-8">
          <Link href="/" className="brand whitespace-nowrap shrink-0">
            Edvânia
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-[14px] font-medium text-[#596660]" aria-label="Secções">
            <a href="#capacidades" className="hover:text-[#15201C] transition-colors whitespace-nowrap shrink-0">
              Capacidades
            </a>
            <a href="#demonstracao" className="hover:text-[#15201C] transition-colors whitespace-nowrap shrink-0">
              Fluxos
            </a>
            <a href="#seguranca" className="hover:text-[#15201C] transition-colors whitespace-nowrap shrink-0">
              Segurança
            </a>
            <Link href="/register" className="hover:text-[#15201C] transition-colors whitespace-nowrap shrink-0">
              Criar conta
            </Link>
          </nav>

          <div className="flex items-center shrink-0">
            <Link href="/login" className="primary-button">
              Entrar no painel
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1160px] px-5 py-12 sm:px-8 sm:py-16">
        <PageEntrance className="space-y-16">
          {/* Hero Section */}
          <section className="grid items-start gap-10 lg:grid-cols-12 lg:items-center" aria-labelledby="welcome-title">
            <div className="space-y-5 lg:col-span-6">
              <p className="eyebrow">Gestão Comercial em Angola · AOA</p>
              <h1
                id="welcome-title"
                className="text-[clamp(2.25rem,4vw,3.35rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[#15201C]"
              >
                A tua loja organizada, do balcão ao fecho de caixa.
              </h1>
              <p className="max-w-[54ch] text-[16px] leading-[1.65] text-[#3B4943]">
                A Edvânia reúne produtos, inventário, vendas, compras, clientes, tesouraria e atendimento WhatsApp numa interface clara e tranquila, desenhada para equipas comerciais em Angola.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link href="/register" className="primary-button">
                  <span>Começar gratuitamente</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
                <Link href="/login" className="quiet-button">
                  Já tenho conta
                </Link>
              </div>

              <p className="pt-2 text-[13px] text-[#596660]">
                Web e WhatsApp partilham as mesmas regras <span aria-hidden="true">·</span> Moeda AOA <span aria-hidden="true">·</span> Auditoria transaccional
              </p>
            </div>

            <div id="demonstracao" className="lg:col-span-6">
              <LandingPreview />
            </div>
          </section>

          {/* Capabilities Section */}
          <section id="capacidades" className="border-t border-[#E2E7E3] pt-12" aria-labelledby="cap-title">
            <div className="mb-8 max-w-2xl space-y-2">
              <p className="eyebrow">Arquitectura Operacional</p>
              <h2 id="cap-title" className="text-[clamp(1.5rem,2.5vw,2rem)] font-bold">
                Um sistema único para cada momento do dia na loja.
              </h2>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {CAPABILITIES.map((cap) => (
                <article
                  key={cap.index}
                  className="rounded-2xl border border-[#E2E7E3] bg-white p-6"
                >
                  <p className="font-mono text-[12px] font-medium text-[#146C53]">{cap.index}.</p>
                  <h3 className="mt-2 text-[18px] font-semibold text-[#15201C]">{cap.title}</h3>
                  <p className="mt-2 text-[14px] leading-[1.65] text-[#596660]">{cap.detail}</p>
                </article>
              ))}
            </div>
          </section>

          {/* Security & Governance Section */}
          <section
            id="seguranca"
            className="rounded-2xl border border-[#E2E7E3] bg-white p-6 sm:p-8"
            aria-labelledby="sec-title"
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl space-y-2">
                <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#0F5340]">
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Controlo e transparência</span>
                </div>
                <h2 id="sec-title" className="text-[22px] font-bold text-[#15201C]">
                  Os preços, totais e permissões são validados no servidor.
                </h2>
                <p className="text-[14px] leading-[1.65] text-[#596660]">
                  Nenhuma operação financeira depende apenas do navegador ou de mensagens de texto. Cada venda, compra, despesa e movimento de caixa gera registo de auditoria com chave idempotente.
                </p>
              </div>
              <div className="shrink-0">
                <Link href="/register" className="primary-button">
                  Criar conta da loja
                </Link>
              </div>
            </div>
          </section>
        </PageEntrance>
      </main>

      <footer className="border-t border-[#E2E7E3] bg-white">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-[13px] text-[#596660] sm:px-8">
          <span>Edvânia · Gestão comercial para negócios em Angola · AOA</span>
          <div className="flex items-center gap-5">
            <Link href="/login" className="hover:text-[#15201C] no-underline text-[#596660]">
              Iniciar sessão
            </Link>
            <Link href="/register" className="hover:text-[#15201C] no-underline text-[#596660]">
              Registo
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
