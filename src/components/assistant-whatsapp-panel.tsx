"use client";

import Image from "next/image";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {motion} from "motion/react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Phone,
  Power,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";

type HealthSummary = {
  mode: "configured" | "sandbox";
  primaryProvider: string;
  primaryModel: string;
  geminiConfigured: boolean;
  fallbackConfigured: boolean;
  fallbackModel: string | null;
  supabaseConfigured: boolean;
  supabaseAdminConfigured: boolean;
  credentialKeyringConfigured: boolean;
  dailyBudget: number;
  dailyUsed: number;
};

type ConnectionRow = {
  id: string;
  provider: string;
  phone_e164: string | null;
  connection_status: string;
  last_connected_at: string | null;
};

type ConnectionSnapshot = {
  storeId: string;
  connectionId: string;
  provider: "baileys" | "sandbox";
  status: "disconnected" | "connecting" | "qr_required" | "connected" | "logged_out" | "error";
  generation: number;
  retryAttempt: number;
  qr?: string;
  qrDataUrl?: string;
  qrExpiresAt?: number;
  phoneE164?: string;
  autoReplyEnabled: boolean;
  persistenceMode: "encrypted_db" | "ephemeral_memory";
  lastError?: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
};

type ConversationRow = {
  id: string;
  connection_id: string;
  wa_contact: string;
  contact_name: string | null;
  last_message_at: string | null;
};

type MessageRow = {
  id: string;
  direction: string;
  body: string | null;
  delivery_status: string;
  sent_at: string | null;
  created_at: string;
};

type ProductOption = {
  id: string;
  name: string;
  sale_price: number;
};

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: string;
};

const STATUS_LABELS: Record<ConnectionSnapshot["status"], string> = {
  disconnected: "Desligado",
  connecting: "A ligar ao WhatsApp…",
  qr_required: "QR pronto para leitura",
  connected: "Ligado e activo",
  logged_out: "Sessão terminada",
  error: "Erro na ligação",
};

const QUICK_PROMPTS = [
  "Qual é o resumo comercial da loja hoje?",
  "Quais produtos e preços temos activos no catálogo?",
  "Como está o estado do caixa neste momento?",
  "Existe algum produto com stock baixo para repor?",
];

export function AssistantWhatsAppPanel({
  storeId,
  storeName,
  role,
  initialHealth,
  initialConnections,
  initialSnapshots,
  initialConversations,
  initialMessages,
  products,
  pendingMigrations = false,
}: {
  storeId: string;
  storeName: string;
  role: string;
  initialHealth: HealthSummary;
  initialConnections: ConnectionRow[];
  initialSnapshots: Record<string, ConnectionSnapshot>;
  initialConversations: ConversationRow[];
  initialMessages: MessageRow[];
  products: ProductOption[];
  pendingMigrations?: boolean;
}) {
  const canManage = ["owner", "admin", "manager"].includes(role);

  const [health, setHealth] = useState<HealthSummary>(initialHealth);
  const [probeState, setProbeState] = useState<{
    loading: boolean;
    result?: {ok: boolean; latencyMs: number; sampleText?: string; error?: string};
  }>({loading: false});

  // Chat state
  const [messages, setMessages] = useState<ChatEntry[]>([
    {
      id: "welcome",
      role: "assistant",
      text: `Olá! Sou a Edvânia da loja ${storeName}. Posso consultar preços, stock, vendas, clientes e estado de caixa em tempo real, ou ajudar nos testes do WhatsApp.`,
      meta: `${initialHealth.primaryModel} · leitura autorizada`,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatSeqRef = useRef(0);

  // Meta H Assisted Sale state
  const [showSaleDrawer, setShowSaleDrawer] = useState(false);
  const [saleProductId, setSaleProductId] = useState(products[0]?.id ?? "");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [salePaidAmount, setSalePaidAmount] = useState(String(products[0]?.sale_price ?? 0));
  const [salePaymentMethod, setSalePaymentMethod] = useState("cash");
  const [saleDraft, setSaleDraft] = useState<{draftId: string; summary: string; expiresAt: string} | null>(null);
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleNotice, setSaleNotice] = useState<string | null>(null);

  // WhatsApp / Baileys state
  const [connections, setConnections] = useState<ConnectionRow[]>(initialConnections);
  const [snapshots, setSnapshots] = useState<Record<string, ConnectionSnapshot>>(initialSnapshots);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(initialConnections[0]?.id ?? "");
  const [conversations, setConversations] = useState<ConversationRow[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [waMessages, setWaMessages] = useState<MessageRow[]>(initialMessages);

  // Registration & test form state
  const [regPhone, setRegPhone] = useState(initialConnections[0]?.phone_e164 ?? "+2449");
  const [regProvider, setRegProvider] = useState<"baileys" | "sandbox">(
    initialConnections[0]?.provider === "sandbox" ? "sandbox" : "baileys",
  );
  const [waBusy, setWaBusy] = useState(false);
  const [waNotice, setWaNotice] = useState<string | null>(null);
  const [waError, setWaError] = useState<string | null>(null);

  const [testRecipient, setTestRecipient] = useState(initialConnections[0]?.phone_e164 ?? "244923000111");
  const [testBody, setTestBody] = useState("Olá Edvânia, qual é o resumo da loja e os produtos disponíveis?");
  const [testUseAi, setTestUseAi] = useState(true);
  const [testResult, setTestResult] = useState<string | null>(null);

  const activeConnection = useMemo(
    () => connections.find((c) => c.id === selectedConnectionId) ?? connections[0] ?? null,
    [connections, selectedConnectionId],
  );
  const activeSnapshot = activeConnection ? snapshots[activeConnection.id] : undefined;

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages.length, chatLoading]);

  const refreshWhatsAppStatus = useCallback(
    async (convId?: string | null) => {
      try {
        const qs = new URLSearchParams({store: storeId});
        const targetConv = convId ?? activeConversationId;
        if (targetConv) qs.set("conversation", targetConv);
        const res = await fetch(`/api/whatsapp/baileys/status?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok) {
          setConnections(data.connections ?? []);
          setSnapshots(data.snapshots ?? {});
          setConversations(data.conversations ?? []);
          setActiveConversationId(data.activeConversationId ?? null);
          setWaMessages(data.messages ?? []);
          if (!selectedConnectionId && data.connections?.[0]?.id) {
            setSelectedConnectionId(data.connections[0].id);
          }
        }
      } catch {
        // Ignore transient network poll error.
      }
    },
    [storeId, activeConversationId, selectedConnectionId],
  );

  // Auto-poll status every 3s while Baileys is connecting or waiting for QR scan
  useEffect(() => {
    if (!canManage) return;
    if (activeSnapshot?.status !== "connecting" && activeSnapshot?.status !== "qr_required") {
      return;
    }
    const timer = setInterval(() => {
      void refreshWhatsAppStatus();
    }, 3000);
    return () => clearInterval(timer);
  }, [canManage, activeSnapshot?.status, refreshWhatsAppStatus]);

  async function runAiProbe() {
    setProbeState({loading: true});
    try {
      const res = await fetch(`/api/assistant/health?store=${encodeURIComponent(storeId)}&probe=1`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok) {
        setHealth((prev) => ({
          ...prev,
          mode: data.mode,
          primaryProvider: data.primaryProvider,
          primaryModel: data.primaryModel,
          geminiConfigured: data.geminiConfigured,
          fallbackConfigured: data.fallbackConfigured,
          dailyUsed: data.dailyUsed ?? prev.dailyUsed,
        }));
      }
      setProbeState({loading: false, result: data.probe});
    } catch {
      setProbeState({
        loading: false,
        result: {ok: false, latencyMs: 0, error: "Erro de rede ao testar o modelo de IA."},
      });
    }
  }

  async function sendChatMessage(textOverride?: string) {
    const trimmed = (textOverride ?? chatInput).trim();
    if (!trimmed || chatLoading) return;

    setChatError(null);
    if (!textOverride) setChatInput("");

    chatSeqRef.current += 1;
    const userMsg: ChatEntry = {id: `u-${chatSeqRef.current}`, role: "user", text: trimmed};
    const nextHistory = messages
      .filter((m) => m.id !== "welcome")
      .slice(-8)
      .map((m) => ({role: m.role, text: m.text}));

    setMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          storeId,
          message: trimmed,
          history: nextHistory,
        }),
      });
      const data = await res.json();
      chatSeqRef.current += 1;
      const replySeq = chatSeqRef.current;
      if (!res.ok || !data.ok) {
        setChatError(data.error || "O assistente não conseguiu responder agora.");
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${replySeq}`,
            role: "assistant",
            text: data.error || "Não foi possível processar a pergunta neste momento.",
            meta: `${data.model ?? health.primaryModel} · erro`,
          },
        ]);
      } else {
        const tools = Array.isArray(data.toolsUsed) && data.toolsUsed.length
          ? ` · ferramentas: ${data.toolsUsed.join(", ")}`
          : "";
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${replySeq}`,
            role: "assistant",
            text: data.text,
            meta: `${data.model}${tools} · ${data.latencyMs} ms`,
          },
        ]);
        setHealth((prev) => ({...prev, dailyUsed: prev.dailyUsed + 1}));
      }
    } catch {
      setChatError("Erro de comunicação com o servidor ao enviar mensagem.");
    } finally {
      setChatLoading(false);
    }
  }

  async function handlePrepareSale(e: React.FormEvent) {
    e.preventDefault();
    if (!saleProductId || saleBusy) return;
    setSaleBusy(true);
    setSaleNotice(null);
    try {
      const res = await fetch("/api/assistant/sale-draft", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          action: "prepare_sale",
          storeId,
          productId: saleProductId,
          quantity: Number(saleQuantity),
          paidAmount: Number(salePaidAmount),
          paymentMethod: salePaymentMethod,
        }),
      });
      const data = await res.json();
      if (data.ok && data.draft) {
        setSaleDraft(data.draft);
      } else {
        setSaleNotice(data.error || "Não foi possível preparar o resumo.");
      }
    } catch {
      setSaleNotice("Falha de rede ao preparar venda assistida.");
    } finally {
      setSaleBusy(false);
    }
  }

  async function handleResolveSale(action: "confirm" | "cancel") {
    if (!saleDraft || saleBusy) return;
    setSaleBusy(true);
    setSaleNotice(null);
    try {
      const res = await fetch("/api/assistant/sale-draft", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          action,
          storeId,
          draftId: saleDraft.draftId,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaleNotice(
          action === "confirm"
            ? `Venda confirmada com sucesso: ${saleDraft.summary}`
            : "Pré-visualização cancelada sem alterações.",
        );
        setSaleDraft(null);
      } else {
        setSaleNotice(data.error || "Erro ao resolver a operação.");
      }
    } catch {
      setSaleNotice("Erro de rede ao resolver venda assistida.");
    } finally {
      setSaleBusy(false);
    }
  }

  async function handleRegisterPhone(e: React.FormEvent) {
    e.preventDefault();
    if (waBusy) return;
    setWaBusy(true);
    setWaError(null);
    setWaNotice(null);
    try {
      const res = await fetch("/api/whatsapp/baileys/register", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          storeId,
          connectionId: activeConnection?.id,
          phone: regPhone,
          provider: regProvider,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setWaError(data.error || "Falha ao registar o número WhatsApp.");
      } else {
        setSelectedConnectionId(data.connection.id);
        setWaNotice(`Número ${data.connection.phone_e164} registado no canal (${data.connection.provider}).`);
        await refreshWhatsAppStatus();
      }
    } catch {
      setWaError("Erro de rede ao registar o número.");
    } finally {
      setWaBusy(false);
    }
  }

  async function handleConnect(mode: "baileys" | "sandbox", confirmSandbox = false) {
    if (!activeConnection || waBusy) return;
    setWaBusy(true);
    setWaError(null);
    setWaNotice(null);
    try {
      const res = await fetch("/api/whatsapp/baileys/connect", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          storeId,
          connectionId: activeConnection.id,
          mode,
          ...(confirmSandbox ? {confirmSandbox: true} : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setWaError(data.error || "Não foi possível iniciar a ligação.");
      } else {
        setSnapshots((prev) => ({...prev, [activeConnection.id]: data.snapshot}));
        setWaNotice(
          data.snapshot.status === "qr_required"
            ? "QR gerado! Lê o código com o WhatsApp do teu telemóvel."
            : data.snapshot.status === "connected"
              ? "Ligação WhatsApp activa e pronta!"
              : "Ligação iniciada. A aguardar resposta do WhatsApp…",
        );
        await refreshWhatsAppStatus();
      }
    } catch {
      setWaError("Erro de rede ao iniciar ligação WhatsApp.");
    } finally {
      setWaBusy(false);
    }
  }

  async function handleDisconnect(logout: boolean) {
    if (!activeConnection || waBusy) return;
    setWaBusy(true);
    setWaError(null);
    setWaNotice(null);
    try {
      const res = await fetch("/api/whatsapp/baileys/disconnect", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          storeId,
          connectionId: activeConnection.id,
          logout,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSnapshots((prev) => ({...prev, [activeConnection.id]: data.snapshot}));
        setWaNotice(logout ? "Sessão WhatsApp terminada e credenciais limpas." : "Ligação desligada.");
        await refreshWhatsAppStatus();
      } else {
        setWaError(data.error || "Falha ao desligar sessão.");
      }
    } catch {
      setWaError("Erro de rede ao desligar sessão.");
    } finally {
      setWaBusy(false);
    }
  }

  async function handleToggleAutoReply() {
    if (!activeConnection || !activeSnapshot) return;
    const nextEnabled = !activeSnapshot.autoReplyEnabled;
    try {
      const res = await fetch("/api/whatsapp/baileys/auto-reply", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          storeId,
          connectionId: activeConnection.id,
          enabled: nextEnabled,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSnapshots((prev) => ({
          ...prev,
          [activeConnection.id]: {
            ...activeSnapshot,
            autoReplyEnabled: data.autoReplyEnabled,
          },
        }));
      }
    } catch {
      // Ignore toggle error.
    }
  }

  async function handleRunFirstTest(mode: "live_send" | "sandbox_inbound") {
    if (!activeConnection || waBusy) return;
    setWaBusy(true);
    setWaError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/whatsapp/baileys/test-send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          storeId,
          connectionId: activeConnection.id,
          mode,
          recipientPhone: testRecipient,
          message: testBody,
          useAiResponse: testUseAi,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setWaError(data.error || "Falha ao executar o teste de WhatsApp.");
      } else if (data.mode === "sandbox_inbound") {
        setTestResult(
          `Teste completo concluído (${data.outboxStatus}): Resposta da IA — "${data.replyText}"`,
        );
        await refreshWhatsAppStatus();
      } else {
        setTestResult(
          `Mensagem real enviada via Baileys (${data.providerMessageId}): "${data.sentText}"`,
        );
        await refreshWhatsAppStatus();
      }
    } catch {
      setWaError("Erro de rede durante o teste de WhatsApp.");
    } finally {
      setWaBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {pendingMigrations && (
        <div
          role="status"
          className="rounded-[14px] border border-[#F59E0B]/40 bg-[#FEF7EA] px-5 py-4 text-[13.5px] text-[#78350F]"
        >
          <p className="font-semibold">Actualização de base de dados pendente no Supabase</p>
          <p className="mt-1">
            O chat e o QR Code Baileys já funcionam em modo compatível, mas faltam aplicar as migrações pendentes (fila outbox durável, confirmações persistentes e RPCs com auditoria). Executa o ficheiro{" "}
            <code className="font-mono text-[12px]">supabase/APPLY_PENDING_IN_SUPABASE_SQL_EDITOR.sql</code> no SQL Editor do teu projecto Supabase.
          </p>
        </div>
      )}

      {/* Top Diagnostic & Model Verification Bar */}
      <motion.section
        initial={{y: 8}}
        animate={{y: 0}}
        transition={{duration: 0.25}}
        className="rounded-[14px] border border-[#E2E7E3] bg-white p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="eyebrow">Assistente IA & Canal WhatsApp (Baileys)</p>
            <h1 className="text-[clamp(1.45rem,2.4vw,1.95rem)] font-bold text-[#15201C]">
              Central de conversa e ligação WhatsApp
            </h1>
            <p className="muted max-w-2xl">
              Conversa directamente com a IA comercial da loja, verifica o estado do modelo e gere o emparelhamento do WhatsApp via Baileys com QR Code em tempo real.
            </p>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={runAiProbe}
              disabled={probeState.loading}
              className="quiet-button shrink-0"
            >
              {probeState.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Activity className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
              )}
              <span>Testar modelo de IA agora</span>
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-[#E2E7E3] pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wider text-[#596660] uppercase">Motor de IA</p>
            <p className="mt-1 font-mono text-[13.5px] font-semibold text-[#15201C]">
              {health.mode === "configured" ? health.primaryModel : "Sandbox determinístico"}
            </p>
            <p className="mt-0.5 text-[12px] text-[#596660]">
              {health.geminiConfigured ? "Gemini API activa no servidor" : "Sem GEMINI_API_KEY activa"}
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wider text-[#596660] uppercase">Quota diária IA</p>
            <p className="mt-1 font-mono text-[13.5px] font-semibold text-[#15201C] tabular-nums">
              {health.dailyUsed} / {health.dailyBudget} chamadas
            </p>
            <p className="mt-0.5 text-[12px] text-[#596660]">Limite de 20/min por utilizador</p>
          </div>

          <div className="rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wider text-[#596660] uppercase">WhatsApp Registado</p>
            <p className="mt-1 font-mono text-[13.5px] font-semibold text-[#15201C]">
              {activeSnapshot?.phoneE164 || activeConnection?.phone_e164 || "Por definir"}
            </p>
            <p className="mt-0.5 text-[12px] text-[#596660]">
              {activeSnapshot ? STATUS_LABELS[activeSnapshot.status] : "Sem ligação"}
            </p>
          </div>

          <div className="rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wider text-[#596660] uppercase">Segurança de Sessão</p>
            <p className="mt-1 font-mono text-[13.5px] font-semibold text-[#15201C]">
              {activeSnapshot?.persistenceMode === "encrypted_db" ? "DB AES-256-GCM" : "Memória protegida"}
            </p>
            <p className="mt-0.5 text-[12px] text-[#596660]">
              {health.supabaseConfigured ? "Supabase autenticado" : "Modo demonstração"}
            </p>
          </div>
        </div>

        {probeState.result && (
          <div
            role="status"
            className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13.5px] ${
              probeState.result.ok
                ? "border-[#146C53]/30 bg-[#EAF4F0] text-[#0F5340]"
                : "border-[#B91C1C]/30 bg-[#FEF2F2] text-[#991B1B]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {probeState.result.ok
                  ? `Modelo respondeu com sucesso: "${probeState.result.sampleText}"`
                  : `O teste do modelo devolveu falha: ${probeState.result.error ?? "erro desconhecido"}`}
              </span>
            </div>
            <span className="font-mono text-[12px] tabular-nums">{probeState.result.latencyMs} ms</span>
          </div>
        )}
      </motion.section>

      {/* Main Split Workspace: Left = Direct AI Chat | Right = Baileys WhatsApp & First Test */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: Direct AI Chat */}
        <motion.section
          initial={{y: 8}}
          animate={{y: 0}}
          transition={{duration: 0.25, delay: 0.03}}
          className="flex flex-col rounded-[14px] border border-[#E2E7E3] bg-white lg:col-span-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E7E3] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF4F0] text-[#146C53]">
                <Bot className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-[#15201C]">Conversa directa com a Edvânia</h2>
                <p className="text-[12px] text-[#596660]">
                  Consultas em tempo real ao catálogo, stock, vendas, clientes e caixa
                </p>
              </div>
            </div>

            {canManage && products.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSaleDrawer((v) => !v)}
                className="quiet-button !min-h-[40px] !px-3.5 text-[13px]"
              >
                <ShoppingBag className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                <span>{showSaleDrawer ? "Ocultar venda assistida" : "Venda assistida (Meta H)"}</span>
              </button>
            )}
          </div>

          {/* Inline Meta H Assisted Sale Builder */}
          {showSaleDrawer && canManage && (
            <div className="border-b border-[#E2E7E3] bg-[#F7F8F6] px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-[#15201C]">
                  Preparar venda assistida com confirmação obrigatória
                </p>
                <span className="font-mono text-[11px] text-[#596660]">Uso único · 5 min</span>
              </div>

              {saleNotice && (
                <p className="notice mt-3" role="status">
                  {saleNotice}
                </p>
              )}

              {saleDraft ? (
                <div className="mt-3 rounded-xl border border-[#146C53]/30 bg-[#EAF4F0] p-4">
                  <p className="text-[13.5px] font-semibold text-[#0F5340]">{saleDraft.summary}</p>
                  <p className="mt-1 font-mono text-[12px] text-[#2B3933]">
                    Expira às{" "}
                    {new Intl.DateTimeFormat("pt-AO", {
                      timeStyle: "medium",
                      timeZone: "Africa/Luanda",
                    }).format(new Date(saleDraft.expiresAt))}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      disabled={saleBusy}
                      onClick={() => handleResolveSale("confirm")}
                      className="primary-button !min-h-[40px] !px-4"
                    >
                      {saleBusy ? "A confirmar…" : "Confirmar e registar venda"}
                    </button>
                    <button
                      type="button"
                      disabled={saleBusy}
                      onClick={() => handleResolveSale("cancel")}
                      className="quiet-button !min-h-[40px] !px-4"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handlePrepareSale} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-[12.5px] font-medium text-[#2B3933]">
                    Produto
                    <select
                      value={saleProductId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSaleProductId(nextId);
                        const match = products.find((p) => p.id === nextId);
                        if (match) setSalePaidAmount(String(Number(match.sale_price) * (Number(saleQuantity) || 1)));
                      }}
                      className="mt-1 w-full rounded-lg border border-[#C6D0C9] bg-white px-3 py-2 text-[13.5px]"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({Number(p.sale_price).toFixed(2)} AOA)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-[12.5px] font-medium text-[#2B3933]">
                    Quantidade
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={saleQuantity}
                      onChange={(e) => setSaleQuantity(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#C6D0C9] bg-white px-3 py-2 text-[13.5px]"
                    />
                  </label>

                  <label className="text-[12.5px] font-medium text-[#2B3933]">
                    Valor pago (AOA)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={salePaidAmount}
                      onChange={(e) => setSalePaidAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#C6D0C9] bg-white px-3 py-2 text-[13.5px]"
                    />
                  </label>

                  <label className="text-[12.5px] font-medium text-[#2B3933]">
                    Método
                    <select
                      value={salePaymentMethod}
                      onChange={(e) => setSalePaymentMethod(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#C6D0C9] bg-white px-3 py-2 text-[13.5px]"
                    >
                      <option value="cash">Numerário</option>
                      <option value="multicaixa_express">Multicaixa Express</option>
                      <option value="multicaixa_reference">Referência Multicaixa</option>
                      <option value="bank_transfer">Transferência bancária</option>
                      <option value="other">Outro</option>
                    </select>
                  </label>

                  <div className="sm:col-span-2">
                    <button type="submit" disabled={saleBusy} className="primary-button !min-h-[42px]">
                      {saleBusy ? "A preparar…" : "Preparar resumo de confirmação"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Quick Commercial Prompts */}
          <div className="flex flex-wrap gap-2 border-b border-[#E2E7E3] px-5 py-3">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={chatLoading}
                onClick={() => void sendChatMessage(prompt)}
                className="min-h-[38px] rounded-lg border border-[#D4DCD6] bg-[#F7F8F6] px-3 py-1.5 text-left text-[12.5px] font-medium text-[#2B3933] transition-colors hover:border-[#146C53]/40 hover:bg-[#EAF4F0] hover:text-[#0F5340]"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Conversation Feed */}
          <div
            ref={chatScrollRef}
            className="flex-1 space-y-4 overflow-y-auto px-5 py-5 max-h-[460px] min-h-[300px]"
            aria-live="polite"
          >
            {messages.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{y: 4}}
                animate={{y: 0}}
                transition={{duration: 0.18}}
                className={`flex flex-col ${entry.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap ${
                    entry.role === "user"
                      ? "bg-[#146C53] text-white"
                      : "border border-[#E2E7E3] bg-[#F7F8F6] text-[#15201C]"
                  }`}
                >
                  {entry.text}
                </div>
                {entry.meta && (
                  <span className="mt-1 px-1 font-mono text-[11px] text-[#596660]">{entry.meta}</span>
                )}
              </motion.div>
            ))}

            {chatLoading && (
              <div className="flex items-center gap-2 text-[13px] text-[#596660]">
                <Loader2 className="h-4 w-4 animate-spin text-[#146C53]" aria-hidden="true" />
                <span>Edvânia está a consultar os dados da loja…</span>
              </div>
            )}
          </div>

          {chatError && (
            <div className="px-5 pb-2">
              <p className="error" role="alert">
                {chatError}
              </p>
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendChatMessage();
            }}
            className="border-t border-[#E2E7E3] p-4 sm:px-5"
          >
            <div className="flex items-end gap-3">
              <label className="sr-only" htmlFor="assistant-chat-input">
                Mensagem para a Edvânia
              </label>
              <textarea
                id="assistant-chat-input"
                rows={2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChatMessage();
                  }
                }}
                placeholder="Pergunta sobre preços, stock, vendas ou caixa…"
                className="min-h-[48px] flex-1 resize-none rounded-xl border border-[#C6D0C9] bg-[#F7F8F6] px-3.5 py-2.5 text-[14px] text-[#15201C] placeholder:text-[#6B7770] focus:border-[#146C53] focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="primary-button shrink-0 !min-h-[48px] !px-5"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>Enviar</span>
              </button>
            </div>
          </form>
        </motion.section>

        {/* RIGHT COLUMN: Registered WhatsApp + Baileys QR + First Test */}
        <motion.div
          initial={{y: 8}}
          animate={{y: 0}}
          transition={{duration: 0.25, delay: 0.05}}
          className="space-y-6 lg:col-span-5"
        >
          {/* WhatsApp Registration & Baileys Session Card */}
          <section className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF4F0] text-[#146C53]">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#15201C]">WhatsApp registado</h2>
                  <p className="text-[12px] text-[#596660]">Canal oficial via Baileys ou Sandbox</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshWhatsAppStatus()}
                aria-label="Actualizar estado do WhatsApp"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#D4DCD6] text-[#2B3933] hover:bg-[#F7F8F6]"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {!canManage ? (
              <p className="muted mt-4">
                Apenas proprietários, administradores ou gestores podem registar ou ligar números WhatsApp.
              </p>
            ) : (
              <>
                {waError && (
                  <p className="error mt-3" role="alert">
                    {waError}
                  </p>
                )}
                {waNotice && (
                  <p className="notice mt-3" role="status">
                    {waNotice}
                  </p>
                )}

                {connections.length > 1 && (
                  <label className="mt-4 block text-[12.5px] font-medium text-[#2B3933]">
                    Canal seleccionado
                    <select
                      value={activeConnection?.id ?? ""}
                      onChange={(e) => setSelectedConnectionId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#C6D0C9] bg-white px-3 py-2 text-[13.5px]"
                    >
                      {connections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.phone_e164 || "Sem número"} ({c.provider})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <form onSubmit={handleRegisterPhone} className="mt-4 space-y-3 border-t border-[#E2E7E3] pt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-[12.5px] font-medium text-[#2B3933]">
                      Número WhatsApp
                      <input
                        type="tel"
                        required
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="+244923000111"
                        className="mt-1 w-full rounded-lg border border-[#C6D0C9] bg-[#F7F8F6] px-3 py-2 font-mono text-[13.5px] focus:border-[#146C53] focus:bg-white focus:outline-none"
                      />
                    </label>
                    <label className="text-[12.5px] font-medium text-[#2B3933]">
                      Modo do canal
                      <select
                        value={regProvider}
                        onChange={(e) => setRegProvider(e.target.value === "sandbox" ? "sandbox" : "baileys")}
                        className="mt-1 w-full rounded-lg border border-[#C6D0C9] bg-[#F7F8F6] px-3 py-2 text-[13.5px]"
                      >
                        <option value="baileys">Baileys (WhatsApp real)</option>
                        <option value="sandbox">Sandbox (Simulador local)</option>
                      </select>
                    </label>
                  </div>
                  <button type="submit" disabled={waBusy} className="quiet-button w-full !min-h-[42px]">
                    {waBusy ? "A guardar…" : "Guardar número registado"}
                  </button>
                </form>

                {/* Live Session Controls & QR Viewer */}
                {activeConnection && (
                  <div className="mt-4 space-y-3 border-t border-[#E2E7E3] pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                      <span className="flex items-center gap-2 font-semibold text-[#15201C]">
                        {activeSnapshot?.status === "connected" ? (
                          <Wifi className="h-4 w-4 text-[#15803D]" aria-hidden="true" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-[#596660]" aria-hidden="true" />
                        )}
                        {activeSnapshot ? STATUS_LABELS[activeSnapshot.status] : "Desligado"}
                      </span>

                      <button
                        type="button"
                        onClick={() => void handleToggleAutoReply()}
                        className={`min-h-[34px] rounded-lg border px-2.5 text-[12px] font-medium transition-colors ${
                          activeSnapshot?.autoReplyEnabled
                            ? "border-[#146C53]/30 bg-[#EAF4F0] text-[#0F5340]"
                            : "border-[#D4DCD6] bg-[#F7F8F6] text-[#596660]"
                        }`}
                      >
                        Auto-resposta IA: {activeSnapshot?.autoReplyEnabled ? "Activa" : "Pausada"}
                      </button>
                    </div>

                    {activeSnapshot?.lastError && (
                      <p className="font-mono text-[12px] text-[#B45309]">
                        Diagnóstico: {activeSnapshot.lastError}
                      </p>
                    )}

                    {/* Real Baileys QR Image */}
                    {activeSnapshot?.status === "qr_required" && activeSnapshot.qrDataUrl && (
                      <div className="rounded-xl border border-[#146C53]/30 bg-[#EAF4F0] p-4 text-center">
                        <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[#0F5340]">
                          <QrCode className="h-4 w-4" aria-hidden="true" />
                          Lê este QR no teu WhatsApp
                        </p>
                        <div className="mx-auto mt-3 inline-block rounded-xl border border-[#E2E7E3] bg-white p-3">
                          <Image
                            src={activeSnapshot.qrDataUrl}
                            alt="Código QR Baileys para associar WhatsApp"
                            width={208}
                            height={208}
                            referrerPolicy="no-referrer"
                            className="h-52 w-52 object-contain"
                          />
                        </div>
                        <p className="mt-2.5 text-[12px] text-[#2B3933]">
                          WhatsApp → Definições → Dispositivos associados → Associar dispositivo
                        </p>
                      </div>
                    )}

                    {/* Sandbox pairing token preview */}
                    {activeSnapshot?.status === "qr_required"
                      && !activeSnapshot.qrDataUrl
                      && activeSnapshot.qr && (
                        <div className="rounded-xl border border-[#146C53]/30 bg-[#EAF4F0] p-4">
                          <p className="text-[13px] font-semibold text-[#0F5340]">
                            Emparelhamento Sandbox pendente
                          </p>
                          <p className="mt-1 font-mono text-[12px] text-[#2B3933] break-all">
                            {activeSnapshot.qr}
                          </p>
                          <button
                            type="button"
                            disabled={waBusy}
                            onClick={() => void handleConnect("sandbox", true)}
                            className="primary-button mt-3 !min-h-[40px]"
                          >
                            Confirmar ligação sandbox
                          </button>
                        </div>
                      )}

                    <div className="flex flex-wrap gap-2.5">
                      {(activeSnapshot?.status === "disconnected"
                        || activeSnapshot?.status === "logged_out"
                        || activeSnapshot?.status === "error"
                        || !activeSnapshot) && (
                        <>
                          <button
                            type="button"
                            disabled={waBusy}
                            onClick={() => void handleConnect("baileys")}
                            className="primary-button !min-h-[44px] flex-1"
                          >
                            {waBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <QrCode className="h-4 w-4" aria-hidden="true" />
                            )}
                            <span>Ligar Baileys (QR Code)</span>
                          </button>
                          <button
                            type="button"
                            disabled={waBusy}
                            onClick={() => void handleConnect("sandbox")}
                            className="quiet-button !min-h-[44px]"
                          >
                            <span>Sandbox</span>
                          </button>
                        </>
                      )}

                      {(activeSnapshot?.status === "connected"
                        || activeSnapshot?.status === "qr_required"
                        || activeSnapshot?.status === "connecting") && (
                        <>
                          <button
                            type="button"
                            disabled={waBusy}
                            onClick={() => void handleDisconnect(false)}
                            className="quiet-button !min-h-[42px] flex-1"
                          >
                            <Power className="h-4 w-4" aria-hidden="true" />
                            <span>Desligar</span>
                          </button>
                          <button
                            type="button"
                            disabled={waBusy}
                            onClick={() => void handleDisconnect(true)}
                            className="quiet-button !min-h-[42px]"
                          >
                            <span>Terminar sessão</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* First Guided WhatsApp + AI Test Card */}
          {canManage && activeConnection && (
            <section className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF4F0] text-[#146C53]">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#15201C]">Primeiro teste WhatsApp + IA</h2>
                  <p className="text-[12px] text-[#596660]">
                    Envia um teste real (Baileys ligado) ou valida o fluxo completo em sandbox
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-[12.5px] font-medium text-[#2B3933]">
                  Número do destinatário / remetente de teste
                  <input
                    type="tel"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="244923000111"
                    className="mt-1 w-full rounded-lg border border-[#C6D0C9] bg-[#F7F8F6] px-3 py-2 font-mono text-[13.5px] focus:border-[#146C53] focus:bg-white focus:outline-none"
                  />
                </label>

                <label className="block text-[12.5px] font-medium text-[#2B3933]">
                  Mensagem ou pergunta para a IA
                  <textarea
                    rows={2}
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#C6D0C9] bg-[#F7F8F6] px-3 py-2 text-[13.5px] focus:border-[#146C53] focus:bg-white focus:outline-none"
                  />
                </label>

                <label className="flex min-h-[36px] items-center gap-2.5 text-[13px] text-[#2B3933] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testUseAi}
                    onChange={(e) => setTestUseAi(e.target.checked)}
                    className="h-4 w-4 accent-[#146C53]"
                  />
                  <span>Gerar resposta com o modelo de IA antes do envio real</span>
                </label>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={waBusy || activeSnapshot?.status !== "connected"}
                    onClick={() => void handleRunFirstTest("live_send")}
                    className="primary-button !min-h-[44px] disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Enviar via Baileys</span>
                  </button>

                  <button
                    type="button"
                    disabled={waBusy}
                    onClick={() => void handleRunFirstTest("sandbox_inbound")}
                    className="quiet-button !min-h-[44px]"
                  >
                    <ShieldCheck className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                    <span>Testar com IA (Sandbox)</span>
                  </button>
                </div>

                {testResult && (
                  <div
                    role="status"
                    className="rounded-xl border border-[#146C53]/30 bg-[#EAF4F0] p-3.5 text-[13px] text-[#0F5340]"
                  >
                    {testResult}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Recent WhatsApp Conversations & Messages */}
          {canManage && (
            <section className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#146C53]" aria-hidden="true" />
                  <h2 className="text-[15px] font-bold text-[#15201C]">Mensagens recentes do WhatsApp</h2>
                </div>
                <span className="font-mono text-[12px] text-[#596660]">
                  {conversations.length} conversa(s)
                </span>
              </div>

              {!conversations.length ? (
                <p className="muted mt-3 text-[13px]">
                  Ainda não há conversas registadas. Executa um teste acima ou envia uma mensagem ao número ligado para ver o histórico em tempo real.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {conversations.slice(0, 6).map((conv) => (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => void refreshWhatsAppStatus(conv.id)}
                        className={`min-h-[34px] rounded-lg border px-2.5 py-1 text-[12px] font-medium ${
                          conv.id === activeConversationId
                            ? "border-[#146C53] bg-[#EAF4F0] text-[#0F5340]"
                            : "border-[#E2E7E3] bg-[#F7F8F6] text-[#2B3933]"
                        }`}
                      >
                        {conv.contact_name || conv.wa_contact.split("@")[0]}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-[220px] space-y-2 overflow-y-auto rounded-xl border border-[#E2E7E3] bg-[#F7F8F6] p-3">
                    {!waMessages.length ? (
                      <p className="text-[12.5px] text-[#596660]">Sem mensagens nesta conversa.</p>
                    ) : (
                      waMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`rounded-lg px-3 py-2 text-[12.5px] ${
                            msg.direction === "outbound"
                              ? "ml-6 bg-[#EAF4F0] text-[#0F5340]"
                              : "mr-6 border border-[#E2E7E3] bg-white text-[#15201C]"
                          }`}
                        >
                          <p className="font-semibold">
                            {msg.direction === "inbound" ? "Cliente" : "Edvânia"} ·{" "}
                            <span className="font-mono text-[11px] font-normal">{msg.delivery_status}</span>
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap">{msg.body || "—"}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </motion.div>
      </div>
    </div>
  );
}
