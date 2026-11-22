"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, MessageSquare, PackageCheck, Wallet } from "lucide-react";

type TabId = "sales" | "cash" | "whatsapp";

const TABS: { id: TabId; label: string; shortLabel: string; icon: typeof PackageCheck }[] = [
  { id: "sales", label: "Vendas e Stock", shortLabel: "Vendas", icon: PackageCheck },
  { id: "cash", label: "Caixa e Fecho", shortLabel: "Caixa", icon: Wallet },
  { id: "whatsapp", label: "WhatsApp Assistido", shortLabel: "WhatsApp", icon: MessageSquare },
];

export function LandingPreview() {
  const [activeTab, setActiveTab] = useState<TabId>("sales");

  return (
    <div className="rounded-2xl border border-[#E2E7E3] bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-[#E2E7E3] pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Fluxos comerciais da Edvânia"
          className="grid w-full grid-cols-3 gap-1 rounded-[10px] bg-[#F0F3F0] p-1 sm:inline-flex sm:w-auto"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] sm:px-3 sm:text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 ${
                  selected
                    ? "bg-white text-[#15201C] shadow-xs"
                    : "text-[#4B5952] hover:text-[#15201C]"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
        <span className="text-[12.5px] font-medium text-[#4B5952] whitespace-nowrap">
          Luanda <span aria-hidden="true">·</span> Moeda AOA
        </span>
      </div>

      <div className="pt-4 sm:pt-5 min-h-[240px]">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === "sales" && (
            <motion.div
              key="sales"
              initial={{ y: 4 }}
              animate={{ y: 0 }}
              exit={{ y: -4 }}
              transition={{ duration: 0.16 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[13.5px] font-semibold text-[#15201C]">
                    Resumo de venda antes de confirmar
                  </p>
                  <p className="text-[13px] text-[#4B5952]">
                    Preços e saldos validados pelo servidor na mesma transacção.
                  </p>
                </div>
                <span className="font-mono text-[13px] font-semibold text-[#0F5340] tabular-nums">
                  Total: 19 400,00 AOA
                </span>
              </div>

              {/* Mobile-first stacked rows + desktop tabular alignment */}
              <div className="divide-y divide-[#E2E7E3] border-t border-[#E2E7E3] text-[13px]">
                <div className="hidden sm:grid sm:grid-cols-12 sm:gap-2 py-2 text-[11px] font-bold uppercase tracking-wider text-[#4B5952]">
                  <span className="col-span-5">Artigo</span>
                  <span className="col-span-2">Qtd</span>
                  <span className="col-span-3">Stock após</span>
                  <span className="col-span-2 text-right">Subtotal</span>
                </div>
                <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-12 sm:items-center sm:gap-2 tabular-nums">
                  <span className="font-semibold text-[#15201C] sm:col-span-5">
                    Arroz Carolino 5 kg
                  </span>
                  <div className="flex items-center justify-between gap-2 sm:contents">
                    <span className="font-mono text-[#2B3933] sm:col-span-2">2 sc</span>
                    <span className="font-medium text-[#15803D] sm:col-span-3">
                      18 sc disponíveis
                    </span>
                    <span className="font-mono font-semibold text-[#15201C] sm:col-span-2 sm:text-right">
                      14 600,00 AOA
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-12 sm:items-center sm:gap-2 tabular-nums">
                  <span className="font-semibold text-[#15201C] sm:col-span-5">
                    Óleo Vegetal 1 L
                  </span>
                  <div className="flex items-center justify-between gap-2 sm:contents">
                    <span className="font-mono text-[#2B3933] sm:col-span-2">2 un</span>
                    <span className="font-medium text-[#B45309] sm:col-span-3">
                      4 un (stock baixo)
                    </span>
                    <span className="font-mono font-semibold text-[#15201C] sm:col-span-2 sm:text-right">
                      4 800,00 AOA
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "cash" && (
            <motion.div
              key="cash"
              initial={{ y: 4 }}
              animate={{ y: 0 }}
              exit={{ y: -4 }}
              transition={{ duration: 0.16 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[13.5px] font-semibold text-[#15201C]">
                    Reconciliação de turno — Caixa Principal
                  </p>
                  <p className="text-[13px] text-[#4B5952]">
                    Abertura, reforços, despesas operacionais e conferência auditada no fecho.
                  </p>
                </div>
                <span className="font-mono text-[13px] font-semibold text-[#0F5340] tabular-nums">
                  Sessão aberta
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-[#F7F8F6] p-3.5">
                  <p className="text-[12px] font-medium text-[#4B5952]">Fundo de abertura</p>
                  <p className="mt-1 font-mono text-[16px] font-semibold text-[#15201C] tabular-nums">
                    25 000,00 AOA
                  </p>
                </div>
                <div className="rounded-xl bg-[#F7F8F6] p-3.5">
                  <p className="text-[12px] font-medium text-[#4B5952]">Despesas registadas</p>
                  <p className="mt-1 font-mono text-[16px] font-semibold text-[#B45309] tabular-nums">
                    - 3 500,00 AOA
                  </p>
                </div>
                <div className="rounded-xl bg-[#EAF4F0] p-3.5">
                  <p className="text-[12px] font-medium text-[#0F5340]">Saldo esperado</p>
                  <p className="mt-1 font-mono text-[16px] font-semibold text-[#0F5340] tabular-nums">
                    40 900,00 AOA
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "whatsapp" && (
            <motion.div
              key="whatsapp"
              initial={{ y: 4 }}
              animate={{ y: 0 }}
              exit={{ y: -4 }}
              transition={{ duration: 0.16 }}
              className="space-y-4"
            >
              <div>
                <p className="text-[13.5px] font-semibold text-[#15201C]">
                  Atendimento assistido com confirmação explícita
                </p>
                <p className="text-[13px] text-[#4B5952]">
                  Consultas de preço e stock são automáticas; qualquer escrita exige confirmação do operador.
                </p>
              </div>
              <div className="space-y-2.5 text-[13px]">
                <div className="rounded-xl bg-[#F7F8F6] px-4 py-3 text-[#2B3933]">
                  <span className="font-semibold text-[#15201C]">Cliente (+244 923…):</span>{" "}
                  Tem arroz de 5 kg disponível e quanto custa?
                </div>
                <div className="rounded-xl bg-[#EAF4F0] px-4 py-3 text-[#0F5340]">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Edvânia (catálogo da loja):
                  </span>{" "}
                  Sim, Arroz Carolino 5 kg custa 7 300,00 AOA e há 20 sacos em stock.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
