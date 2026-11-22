"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, MessageSquare, PackageCheck, Wallet } from "lucide-react";

type TabId = "sales" | "cash" | "whatsapp";

const TABS: { id: TabId; label: string; icon: typeof PackageCheck }[] = [
  { id: "sales", label: "Vendas e Stock", icon: PackageCheck },
  { id: "cash", label: "Caixa e Fecho", icon: Wallet },
  { id: "whatsapp", label: "WhatsApp Assistido", icon: MessageSquare },
];

export function LandingPreview() {
  const [activeTab, setActiveTab] = useState<TabId>("sales");
  const reduced = useReducedMotion();

  return (
    <div className="rounded-2xl border border-[#E2E7E3] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E7E3] pb-4">
        <div
          role="tablist"
          aria-label="Fluxos comerciais da Edvânia"
          className="inline-flex flex-wrap gap-1 rounded-[10px] bg-[#F0F3F0] p-1"
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
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ${
                  selected
                    ? "bg-white text-[#15201C] shadow-xs"
                    : "text-[#596660] hover:text-[#15201C]"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <span className="text-[12px] text-[#596660] whitespace-nowrap">
          Luanda <span aria-hidden="true">·</span> Moeda AOA
        </span>
      </div>

      <div className="pt-5 min-h-[248px]">
        <AnimatePresence mode="wait">
          {activeTab === "sales" && (
            <motion.div
              key="sales"
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-[#15201C]">
                    Resumo de venda antes de confirmar
                  </p>
                  <p className="text-[13px] text-[#596660]">
                    Preços e saldos validados pelo servidor na mesma transacção.
                  </p>
                </div>
                <span className="font-mono text-[13px] font-medium text-[#0F5340] tabular-nums">
                  Total: 19 400,00 AOA
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E2E7E3] text-[11px] font-semibold uppercase tracking-wider text-[#596660]">
                      <th className="py-2 pr-3">Artigo</th>
                      <th className="py-2 px-3">Quantidade</th>
                      <th className="py-2 px-3">Stock após venda</th>
                      <th className="py-2 pl-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E7E3] tabular-nums">
                    <tr>
                      <td className="py-2.5 pr-3 font-medium text-[#15201C]">Arroz Carolino 5 kg</td>
                      <td className="py-2.5 px-3 font-mono text-[#3B4943]">2 sc</td>
                      <td className="py-2.5 px-3 text-[#15803D] font-medium">18 sc disponíveis</td>
                      <td className="py-2.5 pl-3 text-right font-mono">14 600,00 AOA</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-medium text-[#15201C]">Óleo Vegetal 1 L</td>
                      <td className="py-2.5 px-3 font-mono text-[#3B4943]">2 un</td>
                      <td className="py-2.5 px-3 text-[#B45309] font-medium">4 un (stock baixo)</td>
                      <td className="py-2.5 pl-3 text-right font-mono">4 800,00 AOA</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "cash" && (
            <motion.div
              key="cash"
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-[#15201C]">
                    Reconciliação de turno — Caixa Principal
                  </p>
                  <p className="text-[13px] text-[#596660]">
                    Abertura, reforços, despesas operacionais e conferência auditada no fecho.
                  </p>
                </div>
                <span className="font-mono text-[13px] font-medium text-[#0F5340] tabular-nums">
                  Sessão aberta
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-[#F7F8F6] p-3.5">
                  <p className="text-[12px] text-[#596660]">Fundo de abertura</p>
                  <p className="mt-1 font-mono text-[16px] font-semibold text-[#15201C] tabular-nums">
                    25 000,00 AOA
                  </p>
                </div>
                <div className="rounded-xl bg-[#F7F8F6] p-3.5">
                  <p className="text-[12px] text-[#596660]">Despesas registadas</p>
                  <p className="mt-1 font-mono text-[16px] font-semibold text-[#B45309] tabular-nums">
                    - 3 500,00 AOA
                  </p>
                </div>
                <div className="rounded-xl bg-[#EAF4F0] p-3.5">
                  <p className="text-[12px] text-[#0F5340]">Saldo esperado</p>
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
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="space-y-4"
            >
              <div>
                <p className="text-[13px] font-semibold text-[#15201C]">
                  Atendimento assistido com confirmação explícita
                </p>
                <p className="text-[13px] text-[#596660]">
                  Consultas de preço e stock são automáticas; qualquer escrita exige confirmação do operador.
                </p>
              </div>
              <div className="space-y-2.5 text-[13px]">
                <div className="rounded-xl bg-[#F7F8F6] px-4 py-3 text-[#3B4943]">
                  <span className="font-semibold text-[#15201C]">Cliente (+244 923…):</span>{" "}
                  Tem arroz de 5 kg disponível e quanto custa?
                </div>
                <div className="rounded-xl bg-[#EAF4F0] px-4 py-3 text-[#0F5340]">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
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
