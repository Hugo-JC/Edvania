"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

const FAQ_ITEMS = [
  {
    id: "moeda-stock",
    question: "A Edvânia trabalha nativamente em Kwanzas (AOA) e com diferentes unidades?",
    answer:
      "Sim. Cada loja opera em AOA por omissão, com suporte para artigos vendidos à unidade, saco, caixa ou litro e controlo contínuo de stock através de movimentos auditados no servidor.",
  },
  {
    id: "whatsapp-confirm",
    question: "O assistente no WhatsApp pode registar vendas ou mexer no caixa sozinho?",
    answer:
      "Não. Consultas de catálogo, preços e disponibilidade respondem de imediato a partir dos dados reais da loja, mas qualquer operação com impacto financeiro gera primeiro um resumo estruturado e exige confirmação explícita do operador.",
  },
  {
    id: "permissoes",
    question: "Posso separar o que o proprietário, gestor e operador de balcão conseguem fazer?",
    answer:
      "Sim. As permissões são validadas tanto na interface como nas funções do servidor e na base de dados. Operadores focam-se em atendimento e registo; gestores e proprietários gerem compras, despesas, relatórios e configuração.",
  },
  {
    id: "fecho-caixa",
    question: "Como funciona a abertura, despesas e fecho de caixa?",
    answer:
      "Cada turno abre com um fundo inicial, soma automaticamente entradas de vendas, abate levantamentos ou despesas operacionais e calcula o saldo esperado no fecho para conferência com o valor físico contado.",
  },
  {
    id: "instalacao",
    question: "É necessário instalar algum software pesado nos computadores da loja?",
    answer:
      "Não. A Edvânia corre directamente no navegador do computador, tablet ou telemóvel da loja, mantendo interface leve e legível mesmo em ecrãs pequenos ou de média dimensão.",
  },
];

const CALM_EASE = [0.16, 1, 0.3, 1] as const;

export function LandingFaq() {
  const [openId, setOpenId] = useState<string>(FAQ_ITEMS[0].id);

  return (
    <div className="divide-y divide-[#E2E7E3] rounded-2xl border border-[#E2E7E3] bg-white">
      {FAQ_ITEMS.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className="px-5 sm:px-8">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${item.id}`}
              onClick={() => setOpenId(isOpen ? "" : item.id)}
              className="flex min-h-[56px] w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-[#146C53] sm:gap-6 sm:py-6"
            >
              <span className="text-[15.5px] font-semibold leading-snug text-[#15201C] sm:text-[16px]">
                {item.question}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#4B5952] transition-transform duration-200 ${
                  isOpen ? "rotate-180 text-[#146C53]" : ""
                }`}
                aria-hidden="true"
              />
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`faq-panel-${item.id}`}
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.24, ease: CALM_EASE }}
                  className="overflow-hidden"
                >
                  <p className="pb-5 pr-2 text-[14.5px] leading-[1.7] text-[#4B5952] sm:pb-6 sm:pr-8 sm:text-[15px]">
                    {item.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
