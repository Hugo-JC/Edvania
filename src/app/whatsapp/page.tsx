import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {getSandboxWhatsAppRuntime} from "@/lib/whatsapp/sandbox-runtime.server";
import {
  confirmSandboxSession,
  connectSandboxSession,
  disconnectSandboxSession,
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

  const [{data: store}, {data: connections}, {data: conversations, count: totalConversations}] = await Promise.all([
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
  ]);

  const primaryConnectionId = connections?.[0]?.id ?? randomUUID();
  const runtime = getSandboxWhatsAppRuntime();
  const snapshot = runtime.getSnapshot(storeId, primaryConnectionId);

  const selectedConversationId =
    conversations?.find((c) => c.id === params.conversation)?.id ?? conversations?.[0]?.id;

  const [{data: messages}, {data: outboxItems}] = await Promise.all([
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

  const totalPages = Math.max(1, Math.ceil((totalConversations ?? 0) / PAGE_SIZE));

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link className="brand" href="/dashboard">Edvânia</Link>
        <nav className="header-actions">
          <Link href="/dashboard">Painel</Link>
          <Link href={`/products?store=${storeId}`}>Produtos</Link>
          <span>{store?.name ?? "A tua loja"}</span>
        </nav>
      </header>
      <section className="dashboard-content">
        <p className="eyebrow">ATENDIMENTO WHATSAPP · SANDBOX</p>
        <h1>Ligação e caixa de mensagens.</h1>
        <p className="muted">
          Painel operacional em modo sandbox para validar ciclo de sessão, QR efémero, recepção normalizada, assistente read-only e fila outbox sem ligar números reais.
        </p>

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

        <section className="panel-card">
          <div className="section-heading">
            <h2>Estado da ligação sandbox</h2>
            <span>{statusLabel[snapshot.status] ?? snapshot.status}</span>
          </div>
          <p className="muted">
            Ligação: <code>{primaryConnectionId.slice(0, 8)}…</code> · Tentativas: {snapshot.retryAttempt}
            {snapshot.lastError ? ` · Último código: ${snapshot.lastError}` : ""}
          </p>

          {snapshot.status === "qr_required" && snapshot.qr && (
            <section className="panel-card" aria-live="polite">
              <h3>QR Efémero (Sandbox)</h3>
              <p>Código temporário de emparelhamento: <code>{snapshot.qr}</code></p>
              <p className="muted">Expira automaticamente em 2 minutos. Nunca partilhar códigos de sessão reais.</p>
              <form action={confirmSandboxSession}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="connectionId" value={primaryConnectionId} />
                <button className="primary-button" type="submit">Confirmar emparelhamento sandbox</button>
              </form>
            </section>
          )}

          <div className="store-actions" style={{marginTop: 16}}>
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
              <div className="store-actions" style={{marginTop: 16}}>
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
      </section>
    </main>
  );
}
