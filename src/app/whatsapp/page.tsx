import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {WorkspaceShell} from "@/components/workspace-shell";
import {resolveConfiguredAssistantProviders} from "@/lib/domain/assistant-providers.server";
import {getSharedConfirmationDraftStore} from "@/lib/domain/confirmations.server";
import {createClient} from "@/lib/supabase/server";
import {getSandboxWhatsAppRuntime} from "@/lib/whatsapp/sandbox-runtime.server";
import {
  cancelAssistedOperation,
  confirmAssistedOperation,
  confirmSandboxSession,
  connectSandboxSession,
  disconnectSandboxSession,
  dispatchPendingOutbox,
  prepareAssistedSale,
  simulateInboundSandboxMessage,
} from "./actions";

type Props = {
  searchParams: Promise<{
    store?: string;
    conversation?: string;
    page?: string;
    notice?: string;
    error?: string;
    outbox?: string;
    claimed?: string;
    draft?: string;
  }>;
};

const PAGE_SIZE = 10;

const statusLabel: Record<string, string> = {
  disconnected: "Desligado",
  connecting: "A ligar…",
  qr_required: "A aguardar leitura de QR (Sandbox)",
  connected: "Ligado (Sandbox)",
  logged_out: "Sessão terminada (requer novo emparelhamento)",
  error: "Erro de ligação",
};

export default async function WhatsAppPage({searchParams}: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {data: memberships} = await supabase
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (!memberships?.length) redirect("/onboarding");

  const selected = memberships.find((membership) => membership.store_id === params.store) ?? memberships[0];
  const storeId = selected.store_id;
  if (!["owner", "admin", "manager"].includes(selected.role)) redirect("/dashboard");

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [{data: store}, {data: connections}, conversationsRes, {data: products}] =
    await Promise.all([
      supabase.from("stores").select("name").eq("id", storeId).single(),
      supabase
        .from("whatsapp_connections")
        .select("id,provider,phone_e164,connection_status,last_connected_at")
        .eq("store_id", storeId)
        .order("created_at"),
      supabase
        .from("whatsapp_conversations")
        .select("id,connection_id,wa_contact,contact_name,last_message_at", {count: "exact"})
        .eq("store_id", storeId)
        .order("last_message_at", {ascending: false})
        .range(from, to),
      supabase
        .from("products")
        .select("id,name,sale_price")
        .eq("store_id", storeId)
        .eq("status", "active")
        .order("name")
        .limit(50),
    ]);

  let conversations = conversationsRes.data;
  let totalConversations = conversationsRes.count;
  let pendingMigrations = Boolean(conversationsRes.error);
  if (conversationsRes.error) {
    const fallback = await supabase
      .from("whatsapp_conversations")
      .select("id,wa_contact,contact_name,last_message_at", {count: "exact"})
      .eq("store_id", storeId)
      .order("last_message_at", {ascending: false})
      .range(from, to);
    conversations = (fallback.data ?? []).map((c) => ({...c, connection_id: ""}));
    totalConversations = fallback.count;
  }

  const primaryConnectionId = connections?.[0]?.id ?? randomUUID();
  const runtime = getSandboxWhatsAppRuntime();
  const snapshot = runtime.getSnapshot(storeId, primaryConnectionId);
  const assistantProviders = resolveConfiguredAssistantProviders();
  const pendingDraft =
    params.draft && /^[0-9a-f-]{36}$/i.test(params.draft)
      ? getSharedConfirmationDraftStore().getForContext(params.draft, storeId, user.id)
      : null;

  const selectedConversationId =
    conversations?.find((c) => c.id === params.conversation)?.id ?? conversations?.[0]?.id;

  const [{data: messages}, outboxRes] = await Promise.all([
    selectedConversationId
      ? supabase
          .from("whatsapp_messages")
          .select("id,direction,body,delivery_status,sent_at,created_at")
          .eq("store_id", storeId)
          .eq("conversation_id", selectedConversationId)
          .order("created_at", {ascending: false})
          .limit(20)
      : Promise.resolve({data: []}),
    supabase
      .from("whatsapp_outbox")
      .select("id,recipient,body,status,attempts,last_error,updated_at")
      .eq("store_id", storeId)
      .order("created_at", {ascending: false})
      .limit(10),
  ]);
  if (outboxRes.error) {
    pendingMigrations = true;
  }
  const outboxItems = outboxRes.data ?? [];

  const totalPages = Math.max(1, Math.ceil((totalConversations ?? 0) / PAGE_SIZE));

  return (
    <WorkspaceShell
      active="whatsapp"
      sectionTitle="WhatsApp e Assistente"
      storeId={storeId}
      storeName={store?.name ?? "A tua loja"}
      role={selected.role}
    >
      <div className="dashboard-content">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Atendimento WhatsApp · Caixa e Fila Outbox</p>
            <h1>Ligação e caixa de mensagens.</h1>
            <p className="muted">
              Painel operacional de fila outbox, simulação sandbox e confirmação assistida. Para ligar um número real via Baileys (QR Code) e conversar directamente com a IA, usa o novo painel unificado.
            </p>
          </div>
          <Link href={`/assistant?store=${storeId}`} className="primary-button shrink-0">
            Abrir painel Assistente IA e Baileys
          </Link>
        </div>

        {pendingMigrations && (
          <div
            role="status"
            className="mt-4 rounded-[14px] border border-[#F59E0B]/40 bg-[#FEF7EA] px-5 py-4 text-[13.5px] text-[#78350F]"
          >
            <p className="font-semibold">Migrações pendentes detectadas no Supabase</p>
            <p className="mt-1">
              A fila <code>whatsapp_outbox</code> ou a coluna <code>connection_id</code> ainda não foram criadas no teu projecto Supabase. Executa{" "}
              <code>supabase/APPLY_PENDING_IN_SUPABASE_SQL_EDITOR.sql</code> no SQL Editor do Supabase.
            </p>
          </div>
        )}

        {params.error && (
          <p className="error" role="alert">
            Não foi possível concluir a acção. Confirma os dados introduzidos e o estado da ligação.
          </p>
        )}
        {params.notice === "qr" && (
          <p className="notice" role="status">Sessão sandbox iniciada. Confirma o QR efémero abaixo.</p>
        )}
        {params.notice === "connected" && (
          <p className="notice" role="status">Ligação sandbox confirmada e activa.</p>
        )}
        {params.notice === "disconnected" && (
          <p className="notice" role="status">Ligação sandbox desligada com segurança.</p>
        )}
        {params.notice === "simulated" && (
          <p className="notice" role="status">
            Mensagem inbound processada pelo assistente. Estado da resposta na outbox: {params.outbox ?? "queued"}.
          </p>
        )}
        {params.notice === "dispatched" && (
          <p className="notice" role="status">
            Lote da fila outbox processado ({params.claimed ?? "0"} mensagens verificadas).
          </p>
        )}
        {params.notice === "confirmed" && (
          <p className="notice" role="status">
            Operação assistida confirmada e executada com chave idempotente única.
          </p>
        )}
        {params.notice === "cancelled" && (
          <p className="notice" role="status">Pré-visualização de operação descartada sem alterações.</p>
        )}

        <section className="panel-card">
          <div className="section-heading">
            <h2>Estado da ligação sandbox</h2>
            <span>{statusLabel[snapshot.status] ?? snapshot.status}</span>
          </div>
          <p className="muted">
            Ligação: <code>{primaryConnectionId.slice(0, 8)}…</code> · Tentativas: {snapshot.retryAttempt} · Assistente:{" "}
            {assistantProviders.mode === "configured" ? "LLM configurado" : "Sandbox determinístico"}
            {snapshot.lastError ? ` · Último código: ${snapshot.lastError}` : ""}
          </p>

          {snapshot.status === "qr_required" && snapshot.qr && (
            <div className="mt-4 rounded-xl bg-[#EAF4F0] p-5" aria-live="polite">
              <h3>QR Efémero (Sandbox)</h3>
              <p>Código temporário de emparelhamento: <code>{snapshot.qr}</code></p>
              <p className="muted">Expira automaticamente em 2 minutos. Nunca partilhar códigos de sessão reais.</p>
              <form action={confirmSandboxSession} className="mt-3">
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="connectionId" value={primaryConnectionId} />
                <button className="primary-button" type="submit">Confirmar emparelhamento sandbox</button>
              </form>
            </div>
          )}

          <div className="store-actions mt-4">
            {(snapshot.status === "disconnected" || snapshot.status === "logged_out" || snapshot.status === "error") && (
              <form action={connectSandboxSession}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="connectionId" value={primaryConnectionId} />
                <button className="primary-button" type="submit">Iniciar ligação e gerar QR</button>
              </form>
            )}
            {(snapshot.status === "connected" || snapshot.status === "qr_required" || snapshot.status === "connecting") && (
              <>
                <form action={disconnectSandboxSession}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="connectionId" value={primaryConnectionId} />
                  <input type="hidden" name="logout" value="false" />
                  <button className="quiet-button" type="submit">Desligar</button>
                </form>
                <form action={disconnectSandboxSession}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="connectionId" value={primaryConnectionId} />
                  <input type="hidden" name="logout" value="true" />
                  <button className="quiet-button" type="submit">Terminar sessão (Logout)</button>
                </form>
              </>
            )}
          </div>
        </section>

        <section className="panel-card">
          <h2>Simular mensagem recebida (Inbound → Assistente → Outbox)</h2>
          <form className="form" action={simulateInboundSandboxMessage}>
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="connectionId" value={primaryConnectionId} />
            <div className="form-grid">
              <label>
                Número do cliente (dígitos E.164 sem +)
                <input name="senderPhone" defaultValue="244923000111" required pattern="[0-9]{6,15}" />
              </label>
              <label>
                Nome do contacto (opcional)
                <input name="contactName" defaultValue="Cliente Teste" maxLength={100} />
              </label>
            </div>
            <label>
              Mensagem de texto
              <input name="body" required maxLength={1000} placeholder="Ex.: Qual é o preço do arroz?" />
            </label>
            <button className="primary-button" type="submit">Processar mensagem sandbox</button>
          </form>
        </section>

        <section className="panel-card">
          <h2>Operação assistida com confirmação explícita (Meta H)</h2>
          <p className="muted">
            Prepara um resumo autoritativo no servidor antes de executar uma venda, vinculando tenant, utilizador e expiração curta de uso único.
          </p>

          {pendingDraft ? (
            <div className="mt-4 rounded-xl bg-[#EAF4F0] p-5" aria-live="polite">
              <h3>Confirmar operação preparada</h3>
              <p><strong>Resumo:</strong> {pendingDraft.summary}</p>
              <p className="muted">
                Expira em:{" "}
                <span className="tabular">
                  {new Intl.DateTimeFormat("pt-AO", {
                    dateStyle: "short",
                    timeStyle: "medium",
                    timeZone: "Africa/Luanda",
                  }).format(new Date(pendingDraft.expiresAt))}
                </span>
              </p>
              <div className="store-actions mt-4">
                <form action={confirmAssistedOperation}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="draftId" value={pendingDraft.draftId} />
                  <button className="primary-button" type="submit">Confirmar e executar operação</button>
                </form>
                <form action={cancelAssistedOperation}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <input type="hidden" name="draftId" value={pendingDraft.draftId} />
                  <button className="quiet-button" type="submit">Cancelar</button>
                </form>
              </div>
            </div>
          ) : !products?.length ? (
            <p className="muted">Adiciona pelo menos um produto activo na loja para preparar uma venda assistida.</p>
          ) : (
            <form className="form" action={prepareAssistedSale}>
              <input type="hidden" name="storeId" value={storeId} />
              {selectedConversationId && (
                <input type="hidden" name="conversationId" value={selectedConversationId} />
              )}
              <div className="form-grid">
                <label>
                  Produto
                  <select name="productId" required defaultValue={products[0].id}>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({Number(product.sale_price).toFixed(2)} AOA)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantidade
                  <input name="quantity" type="number" min="1" step="1" defaultValue="1" required />
                </label>
                <label>
                  Valor recebido (AOA)
                  <input name="paidAmount" type="number" min="0" step="0.01" defaultValue={String(products[0].sale_price ?? 0)} required />
                </label>
                <label>
                  Método de pagamento
                  <select name="paymentMethod" defaultValue="cash">
                    <option value="cash">Numerário</option>
                    <option value="multicaixa_express">Multicaixa Express</option>
                    <option value="multicaixa_reference">Referência Multicaixa</option>
                    <option value="bank_transfer">Transferência bancária</option>
                    <option value="other">Outro</option>
                  </select>
                </label>
              </div>
              <button className="quiet-button" type="submit">Preparar resumo de confirmação</button>
            </form>
          )}
        </section>

        <section className="panel-card">
          <div className="section-heading">
            <h2>Conversas</h2>
            <span>Página {page} de {totalPages} · {totalConversations ?? 0} conversa(s)</span>
          </div>
          {!conversations?.length ? (
            <p className="muted">Ainda não existem conversas nesta loja. Usa o simulador acima para testar uma entrada.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Contacto</th><th>JID</th><th>Última actividade</th><th>Acção</th></tr>
                  </thead>
                  <tbody>
                    {conversations.map((conversation) => (
                      <tr key={conversation.id}>
                        <td><strong>{conversation.contact_name || "Sem nome"}</strong></td>
                        <td>{conversation.wa_contact}</td>
                        <td>
                          {conversation.last_message_at
                            ? new Intl.DateTimeFormat("pt-AO", {
                                dateStyle: "short",
                                timeStyle: "short",
                                timeZone: "Africa/Luanda",
                              }).format(new Date(conversation.last_message_at))
                            : "—"}
                        </td>
                        <td>
                          <Link
                            className="quiet-button"
                            href={`/whatsapp?store=${storeId}&page=${page}&conversation=${conversation.id}`}
                          >
                            Ver mensagens
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="store-actions mt-4">
                {page > 1 && (
                  <Link className="quiet-button" href={`/whatsapp?store=${storeId}&page=${page - 1}`}>
                    Página anterior
                  </Link>
                )}
                {page < totalPages && (
                  <Link className="quiet-button" href={`/whatsapp?store=${storeId}&page=${page + 1}`}>
                    Página seguinte
                  </Link>
                )}
              </div>
            </>
          )}
        </section>

        <section className="panel-card">
          <div className="section-heading">
            <h2>Mensagens da conversa seleccionada</h2>
            <span>{messages?.length ?? 0} recentes</span>
          </div>
          {!messages?.length ? (
            <p className="muted">Sem mensagens para mostrar nesta conversa.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Direcção</th><th>Conteúdo</th><th>Estado</th><th>Data</th></tr></thead>
                <tbody>
                  {messages.map((message) => (
                    <tr key={message.id}>
                      <td><strong>{message.direction === "inbound" ? "Recebida" : "Enviada"}</strong></td>
                      <td>{message.body || "—"}</td>
                      <td>{message.delivery_status}</td>
                      <td>
                        {new Intl.DateTimeFormat("pt-AO", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "Africa/Luanda",
                        }).format(new Date(message.sent_at ?? message.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="section-heading">
            <h2>Fila Outbox</h2>
            <span>{outboxItems?.length ?? 0} registos</span>
          </div>
          <form action={dispatchPendingOutbox} className="mb-3.5">
            <input type="hidden" name="storeId" value={storeId} />
            <button className="quiet-button" type="submit">Processar fila outbox</button>
          </form>
          {!outboxItems?.length ? (
            <p className="muted">Nenhuma resposta na fila outbox.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Destinatário</th><th>Mensagem</th><th>Estado</th><th>Tentativas</th><th>Erro</th></tr></thead>
                <tbody>
                  {outboxItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.recipient}</td>
                      <td>{item.body}</td>
                      <td><strong>{item.status}</strong></td>
                      <td>{item.attempts}</td>
                      <td>{item.last_error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
