import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Check,
  ClipboardCheck,
  MessageSquare,
  PackagePlus,
  ShieldCheck,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { LandingFaq } from "@/components/landing-faq";
import { LandingPreview } from "@/components/landing-preview";
import {
  PageEntrance,
  ParallaxSurface,
  ScrollProgressBar,
  ScrollReveal,
  StaggerGroup,
  StaggerItem,
} from "@/components/motion-primitives";

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Abertura de turno",
    detail:
      "O operador abre o caixa com o fundo inicial em AOA e regista a sessão associada à sua loja.",
    icon: Wallet,
  },
  {
    step: "02",
    title: "Entradas e inventário",
    detail:
      "Recepções de fornecedores somam quantidades ao ledger de stock com custo médio e histórico.",
    icon: PackagePlus,
  },
  {
    step: "03",
    title: "Balcão e WhatsApp",
    detail:
      "Vendas presenciais ou pedidos iniciados no WhatsApp validam preços, troco e disponibilidade no servidor.",
    icon: ShoppingBag,
  },
  {
    step: "04",
    title: "Conferência de fecho",
    detail:
      "Despesas operacionais e levantamentos cruzam com as vendas do dia para calcular o saldo esperado.",
    icon: ClipboardCheck,
  },
];

const CAPABILITIES = [
  {
    index: "01",
    title: "Catálogo e ledger de stock",
    detail:
      "Cada recepção de compra e cada venda geram movimentos auditados de inventário em vez de saldos editados manualmente.",
    icon: BookOpenCheck,
  },
  {
    index: "02",
    title: "Vendas atómicas e troco",
    detail:
      "Cálculo de subtotais, descontos e troco em Kwanzas executados numa única transacção para evitar stock negativo ou duplicações.",
    icon: ShoppingBag,
  },
  {
    index: "03",
    title: "Tesouraria e despesas",
    detail:
      "Abertura, reforços, levantamentos e pequenas despesas ficam ligados ao turno de caixa e ao autor do registo.",
    icon: Wallet,
  },
  {
    index: "04",
    title: "Clientes e contas em aberto",
    detail:
      "Fichas de clientes e fornecedores com acompanhamento claro de recebimentos, dívidas e histórico de compras.",
    icon: Users,
  },
  {
    index: "05",
    title: "WhatsApp com confirmação",
    detail:
      "Perguntas sobre preços e quantidades respondem com dados reais da loja; alterações pedem confirmação explícita.",
    icon: MessageSquare,
  },
  {
    index: "06",
    title: "Relatórios e auditoria por loja",
    detail:
      "Resumo diário de faturação, produtos abaixo do mínimo e registo contínuo de acções críticas com isolamento por loja.",
    icon: BarChart3,
  },
];

const TEAM_ROLES = [
  {
    role: "Proprietário & Admin",
    summary: "Visão global do negócio, definição de regras e controlo de equipa.",
    items: [
      "Criar lojas e configurar moeda ou localizações",
      "Gerir catálogo, preços e limites de stock mínimo",
      "Consultar relatórios consolidados e histórico auditado",
    ],
  },
  {
    role: "Gestor de Loja",
    summary: "Operação diária de aprovisionamento, margem e conferência de caixa.",
    items: [
      "Registar compras a fornecedores e recepções de stock",
      "Rever entradas e saídas de tesouraria por turno",
      "Acompanhar saldos pendentes de clientes e fornecedores",
    ],
  },
  {
    role: "Operador de Balcão",
    summary: "Atendimento rápido e focado no que acontece ao longo do turno.",
    items: [
      "Registar vendas com confirmação imediata de disponibilidade",
      "Abrir turno e lançar despesas operacionais autorizadas",
      "Aprovar rascunhos de pedidos vindos do WhatsApp",
    ],
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F7F8F6] text-[#15201C]">
      <ScrollProgressBar />

      {/* Top Bar Contract: 3 zones, gap-8, single-line controls */}
      <header className="sticky top-0 z-40 border-b border-[#E2E7E3] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between gap-4 px-4 sm:gap-8 sm:px-8">
          <Link href="/" className="brand whitespace-nowrap shrink-0">
            Edvânia
          </Link>

          <nav
            className="hidden md:flex items-center gap-7 text-[14px] font-semibold text-[#4B5952]"
            aria-label="Secções"
          >
            <a
              href="#fluxos"
              className="hover:text-[#15201C] transition-colors whitespace-nowrap shrink-0 no-underline text-inherit"
            >
              Fluxos
            </a>
            <a
              href="#capacidades"
              className="hover:text-[#15201C] transition-colors whitespace-nowrap shrink-0 no-underline text-inherit"
            >
              Capacidades
            </a>
            <a
              href="#equipas"
              className="hover:text-[#15201C] transition-colors whitespace-nowrap shrink-0 no-underline text-inherit"
            >
              Equipas
            </a>
            <a
              href="#perguntas"
              className="hover:text-[#15201C] transition-colors whitespace-nowrap shrink-0 no-underline text-inherit"
            >
              Perguntas
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <Link href="/login" className="primary-button !min-h-[40px] !px-4 sm:!px-5">
              Entrar no painel
            </Link>
          </div>
        </div>

        {/* Mobile Quick Section Strip */}
        <nav
          aria-label="Navegação rápida móvel"
          className="flex items-center gap-5 overflow-x-auto border-t border-[#E2E7E3]/80 px-4 py-2.5 text-[13px] font-semibold text-[#4B5952] md:hidden"
        >
          <a href="#fluxos" className="whitespace-nowrap shrink-0 no-underline text-inherit hover:text-[#15201C]">
            Fluxos
          </a>
          <a href="#capacidades" className="whitespace-nowrap shrink-0 no-underline text-inherit hover:text-[#15201C]">
            Capacidades
          </a>
          <a href="#equipas" className="whitespace-nowrap shrink-0 no-underline text-inherit hover:text-[#15201C]">
            Equipas
          </a>
          <a href="#perguntas" className="whitespace-nowrap shrink-0 no-underline text-inherit hover:text-[#15201C]">
            Perguntas
          </a>
          <Link href="/register" className="whitespace-nowrap shrink-0 no-underline text-[#146C53]">
            Criar conta
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-[1160px] px-4 py-10 sm:px-8 sm:py-20 lg:py-24">
        <PageEntrance className="space-y-16 sm:space-y-24 lg:space-y-32">
          {/* Hero Section */}
          <section
            className="grid items-start gap-8 sm:gap-12 lg:grid-cols-12 lg:items-center lg:gap-14"
            aria-labelledby="welcome-title"
          >
            <div className="space-y-5 sm:space-y-6 lg:col-span-6">
              <p className="eyebrow">Gestão Comercial em Angola · AOA</p>
              <h1
                id="welcome-title"
                className="text-[clamp(2rem,6vw,3.5rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[#15201C]"
              >
                A tua loja organizada, do balcão ao fecho de caixa.
              </h1>
              <p className="max-w-[54ch] text-[15.5px] leading-[1.68] text-[#2B3933] sm:text-[16px] sm:leading-[1.7]">
                A Edvânia reúne produtos, inventário, vendas, compras, clientes, tesouraria e atendimento WhatsApp numa interface clara e tranquila, desenhada para equipas comerciais em Angola.
              </p>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:pt-2">
                <Link href="/register" className="primary-button w-full sm:w-auto">
                  <span>Começar gratuitamente</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
                <Link href="/login" className="quiet-button w-full sm:w-auto">
                  Já tenho conta
                </Link>
              </div>

              <p className="pt-1 text-[13px] font-medium leading-relaxed text-[#4B5952] sm:text-[13.5px]">
                Web e WhatsApp partilham as mesmas regras{" "}
                <span aria-hidden="true" className="mx-1.5 text-[#C6D0C9]">
                  ·
                </span>{" "}
                Moeda AOA{" "}
                <span aria-hidden="true" className="mx-1.5 text-[#C6D0C9]">
                  ·
                </span>{" "}
                Auditoria transaccional
              </p>
            </div>

            <div id="demonstracao" className="lg:col-span-6">
              <ParallaxSurface offset={8}>
                <LandingPreview />
              </ParallaxSurface>
            </div>
          </section>

          {/* Daily Flow Section */}
          <section
            id="fluxos"
            className="scroll-mt-28 border-t border-[#E2E7E3] pt-12 sm:pt-20"
            aria-labelledby="flow-title"
          >
            <ScrollReveal className="mb-8 max-w-2xl space-y-3 sm:mb-12">
              <p className="eyebrow">Ritmo Diário</p>
              <h2
                id="flow-title"
                className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.2] text-[#15201C]"
              >
                Um dia inteiro na loja, sem folhas soltas nem contas refeitas à noite.
              </h2>
              <p className="text-[15px] leading-[1.68] text-[#4B5952] sm:text-[15.5px] sm:leading-[1.7]">
                Cada etapa alimenta automaticamente a seguinte: quando o caixa fecha, as vendas, o stock e os movimentos de tesouraria já batem certo.
              </p>
            </ScrollReveal>

            <StaggerGroup className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
              {WORKFLOW_STEPS.map((item) => {
                const Icon = item.icon;
                return (
                  <StaggerItem key={item.step}>
                    <article className="flex h-full flex-col justify-between rounded-2xl border border-[#E2E7E3] bg-white p-6 transition-colors duration-200 hover:border-[#B4C3BA] sm:p-7">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-[13px] font-semibold text-[#146C53]">
                            {item.step}.
                          </span>
                          <Icon
                            className="h-4 w-4 text-[#4B5952]"
                            aria-hidden="true"
                          />
                        </div>
                        <h3 className="mt-4 text-[17px] font-bold text-[#15201C]">
                          {item.title}
                        </h3>
                        <p className="mt-2.5 text-[14.5px] leading-[1.68] text-[#4B5952]">
                          {item.detail}
                        </p>
                      </div>
                    </article>
                  </StaggerItem>
                );
              })}
            </StaggerGroup>
          </section>

          {/* Capabilities Section */}
          <section
            id="capacidades"
            className="scroll-mt-28 border-t border-[#E2E7E3] pt-12 sm:pt-20"
            aria-labelledby="cap-title"
          >
            <ScrollReveal className="mb-8 max-w-2xl space-y-3 sm:mb-12">
              <p className="eyebrow">Arquitectura Operacional</p>
              <h2
                id="cap-title"
                className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.2] text-[#15201C]"
              >
                Um sistema único para cada área da operação comercial.
              </h2>
              <p className="text-[15px] leading-[1.68] text-[#4B5952] sm:text-[15.5px] sm:leading-[1.7]">
                Construído em módulos directos e legíveis para funcionar com estabilidade em telemóveis, tablets e computadores.
              </p>
            </ScrollReveal>

            <StaggerGroup className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((cap) => {
                const Icon = cap.icon;
                return (
                  <StaggerItem key={cap.index}>
                    <article className="h-full rounded-2xl border border-[#E2E7E3] bg-white p-6 transition-colors duration-200 hover:border-[#B4C3BA] sm:p-7">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-[12.5px] font-semibold text-[#146C53]">
                          {cap.index}.
                        </p>
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4F0] text-[#0F5340]">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </div>
                      </div>
                      <h3 className="mt-4 text-[17.5px] font-bold text-[#15201C] sm:text-[18px]">
                        {cap.title}
                      </h3>
                      <p className="mt-2.5 text-[14.5px] leading-[1.68] text-[#4B5952]">
                        {cap.detail}
                      </p>
                    </article>
                  </StaggerItem>
                );
              })}
            </StaggerGroup>
          </section>

          {/* Team Roles Section */}
          <section
            id="equipas"
            className="scroll-mt-28 border-t border-[#E2E7E3] pt-12 sm:pt-20"
            aria-labelledby="roles-title"
          >
            <ScrollReveal className="mb-8 max-w-2xl space-y-3 sm:mb-12">
              <p className="eyebrow">Controlo por Função</p>
              <h2
                id="roles-title"
                className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.2] text-[#15201C]"
              >
                Cada pessoa da equipa acede apenas ao que precisa para trabalhar.
              </h2>
              <p className="text-[15px] leading-[1.68] text-[#4B5952] sm:text-[15.5px] sm:leading-[1.7]">
                Separação clara entre quem atende no balcão, quem acompanha compras e quem decide margens e políticas da loja.
              </p>
            </ScrollReveal>

            <StaggerGroup className="grid gap-5 sm:gap-6 lg:grid-cols-3">
              {TEAM_ROLES.map((group) => (
                <StaggerItem key={group.role}>
                  <article className="flex h-full flex-col rounded-2xl border border-[#E2E7E3] bg-white p-6 sm:p-8">
                    <h3 className="text-[18px] font-bold text-[#15201C]">
                      {group.role}
                    </h3>
                    <p className="mt-2 text-[14.5px] leading-[1.65] text-[#4B5952]">
                      {group.summary}
                    </p>
                    <ul className="mt-6 space-y-3 border-t border-[#E2E7E3] pt-5 text-[14px] text-[#2B3933]">
                      {group.items.map((item) => (
                        <li key={item} className="flex items-start gap-2.5">
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#146C53]"
                            aria-hidden="true"
                          />
                          <span className="leading-[1.55]">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </section>

          {/* FAQ Section */}
          <section
            id="perguntas"
            className="scroll-mt-28 border-t border-[#E2E7E3] pt-12 sm:pt-20"
            aria-labelledby="faq-title"
          >
            <div className="grid gap-8 lg:grid-cols-12 lg:gap-14">
              <ScrollReveal className="space-y-4 lg:col-span-5">
                <p className="eyebrow">Dúvidas Comuns</p>
                <h2
                  id="faq-title"
                  className="text-[clamp(1.5rem,3vw,2.15rem)] font-bold leading-[1.2] text-[#15201C]"
                >
                  Perguntas frequentes sobre o uso no dia a dia.
                </h2>
                <p className="text-[15px] leading-[1.7] text-[#4B5952]">
                  Desenhada para reduzir atrito no balcão e manter toda a equipa alinhada nos mesmos números.
                </p>
                <div className="pt-2">
                  <Link href="/register" className="quiet-button w-full sm:w-auto">
                    <span>Testar criação de loja</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </Link>
                </div>
              </ScrollReveal>

              <ScrollReveal delay={0.08} className="lg:col-span-7">
                <LandingFaq />
              </ScrollReveal>
            </div>
          </section>

          {/* Security & Governance Final CTA Section */}
          <ScrollReveal>
            <section
              id="seguranca"
              className="scroll-mt-28 rounded-2xl border border-[#E2E7E3] bg-white p-6 sm:p-12"
              aria-labelledby="sec-title"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
                <div className="max-w-2xl space-y-3">
                  <div className="inline-flex items-center gap-2 text-[13.5px] font-bold text-[#0F5340]">
                    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Controlo e transparência no servidor</span>
                  </div>
                  <h2
                    id="sec-title"
                    className="text-[clamp(1.4rem,2.6vw,1.9rem)] font-bold leading-[1.22] text-[#15201C]"
                  >
                    Os preços, totais e permissões são validados antes de gravar.
                  </h2>
                  <p className="text-[14.5px] leading-[1.7] text-[#4B5952] sm:text-[15px]">
                    Nenhuma operação financeira depende apenas do navegador ou de mensagens soltas. Cada venda, compra, despesa e movimento de caixa gera registo de auditoria com chave idempotente.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center shrink-0">
                  <Link href="/register" className="primary-button w-full sm:w-auto">
                    <span>Criar conta da loja</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </Link>
                  <Link href="/login" className="quiet-button w-full sm:w-auto">
                    Entrar no painel
                  </Link>
                </div>
              </div>
            </section>
          </ScrollReveal>
        </PageEntrance>
      </main>

      <footer className="border-t border-[#E2E7E3] bg-white">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-4 px-4 py-8 text-[13.5px] text-[#4B5952] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <span className="font-semibold text-[#15201C]">Edvânia</span>
            <span aria-hidden="true" className="text-[#C6D0C9]">
              ·
            </span>
            <span>Gestão comercial para negócios em Angola</span>
            <span aria-hidden="true" className="text-[#C6D0C9]">
              ·
            </span>
            <span>Moeda AOA</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-medium sm:gap-6">
            <a href="#fluxos" className="hover:text-[#15201C] no-underline text-[#4B5952]">
              Fluxos
            </a>
            <a href="#capacidades" className="hover:text-[#15201C] no-underline text-[#4B5952]">
              Capacidades
            </a>
            <Link href="/login" className="hover:text-[#15201C] no-underline text-[#4B5952]">
              Iniciar sessão
            </Link>
            <Link href="/register" className="hover:text-[#15201C] no-underline text-[#4B5952]">
              Registo
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
