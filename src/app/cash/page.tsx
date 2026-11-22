import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CashMovementAndCloseForms, OpenCashForm } from "./cash-forms";

type Props = { searchParams: Promise<{ store?: string; error?: string; saved?: string }> };
const money = new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 2 });

export default async function CashPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (!memberships?.length) redirect("/onboarding");

  const selected = memberships.find((membership) => membership.store_id === params.store) ?? memberships[0];
  const storeId = selected.store_id;
  if (!["owner", "admin", "manager"].includes(selected.role)) redirect("/dashboard");

  const [{ data: store }, { data: registers }, { data: sessions }, { data: movements }] = await Promise.all([
    supabase.from("stores").select("name").eq("id", storeId).single(),
    supabase.from("cash_registers").select("id,name,status").eq("store_id", storeId).eq("status", "active").order("name"),
    supabase
      .from("cash_sessions")
      .select("id,register_id,opening_amount,opened_at,closed_at,closing_amount,expected_amount,difference_amount")
      .eq("store_id", storeId)
      .order("opened_at", { ascending: false })
      .limit(15),
    supabase
      .from("cash_movements")
      .select("id,session_id,movement_type,direction,amount,description,created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const registerNames = new Map((registers ?? []).map((reg) => [reg.id, reg.name]));
  const openSession = (sessions ?? []).find((session) => session.closed_at == null);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link className="brand" href="/dashboard">Edvânia</Link>
        <nav className="header-actions">
          <Link href="/dashboard">Painel</Link>
          <Link href={`/sales?store=${storeId}`}>Vendas</Link>
          <span>{store?.name ?? "A tua loja"}</span>
        </nav>
      </header>
      <section className="dashboard-content">
        <p className="eyebrow">CAIXA E TESOURARIA</p>
        <h1>Caixa e movimentos.</h1>
        <p className="muted">Abre o turno de caixa, regista reforços, levantamentos ou despesas e fecha com reconciliação auditada.</p>
        {params.error && <p className="error" role="alert">Não foi possível concluir a operação de caixa. Verifica os valores e o estado da sessão.</p>}
        {params.saved && <p className="notice" role="status">Operação de caixa registada com sucesso.</p>}

        {!openSession ? (
          <section className="panel-card">
            <h2>Abrir sessão de caixa</h2>
            {!registers?.length ? (
              <p className="muted">Ainda não existe uma caixa registada nesta loja.</p>
            ) : (
              <OpenCashForm
                storeId={storeId}
                registers={registers}
                idempotencyKey={randomUUID()}
              />
            )}
          </section>
        ) : (
          <CashMovementAndCloseForms
            storeId={storeId}
            session={openSession}
            registerName={registerNames.get(openSession.register_id) ?? "Caixa"}
            movementKey={randomUUID()}
            expenseKey={randomUUID()}
            closeKey={randomUUID()}
          />
        )}

        <section className="panel-card">
          <div className="section-heading"><h2>Sessões de caixa</h2><span>{sessions?.length ?? 0} registos</span></div>
          {!sessions?.length ? <p className="muted">Ainda não existem sessões de caixa registadas.</p> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Caixa</th><th>Abertura</th><th>Estado</th><th>Esperado</th><th>Contado</th><th>Diferença</th></tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id}>
                      <td><strong>{registerNames.get(session.register_id) ?? "Caixa"}</strong><small>{new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Luanda" }).format(new Date(session.opened_at))}</small></td>
                      <td>{money.format(Number(session.opening_amount))}</td>
                      <td>{session.closed_at ? "Fechada" : "Aberta"}</td>
                      <td>{session.expected_amount != null ? money.format(Number(session.expected_amount)) : "—"}</td>
                      <td>{session.closing_amount != null ? money.format(Number(session.closing_amount)) : "—"}</td>
                      <td>{session.difference_amount != null ? money.format(Number(session.difference_amount)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="section-heading"><h2>Últimos movimentos</h2><span>{movements?.length ?? 0} movimentos</span></div>
          {!movements?.length ? <p className="muted">Sem movimentos registados.</p> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Descrição</th><th>Tipo</th><th>Direcção</th><th>Valor</th><th>Data</th></tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{movement.description}</td>
                      <td>{movement.movement_type}</td>
                      <td>{movement.direction === "in" ? "Entrada" : "Saída"}</td>
                      <td>{money.format(Number(movement.amount))}</td>
                      <td>{new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Luanda" }).format(new Date(movement.created_at))}</td>
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
