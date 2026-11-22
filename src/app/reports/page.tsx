import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ store?: string }> };

const money = new Intl.NumberFormat("pt-AO", {
  style: "currency",
  currency: "AOA",
  maximumFractionDigits: 2,
});

export default async function ReportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (!memberships?.length) redirect("/onboarding");

  const selected = memberships.find((m) => m.store_id === params.store) ?? memberships[0];
  const storeId = selected.store_id;
  if (!["owner", "admin", "manager"].includes(selected.role)) redirect("/dashboard");

  const [{ data: store }, { data: sales }, { data: purchases }, { data: expenses }, { data: auditLogs }, { data: aiLogs }] =
    await Promise.all([
      supabase.from("stores").select("name").eq("id", storeId).single(),
      supabase.from("sales").select("total,status").eq("store_id", storeId).eq("status", "confirmed"),
      supabase.from("purchases").select("total,status").eq("store_id", storeId).eq("status", "received"),
      supabase.from("expenses").select("amount").eq("store_id", storeId),
      supabase
        .from("audit_logs")
        .select("id,action,entity_type,created_at,request_id")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("ai_usage_logs")
        .select("id,provider,model,success,latency_ms,task_type,created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

  const totalSales = (sales ?? []).reduce((sum, s) => sum + Number(s.total ?? 0), 0);
  const totalPurchases = (purchases ?? []).reduce((sum, p) => sum + Number(p.total ?? 0), 0);
  const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  const netFlow = totalSales - totalPurchases - totalExpenses;

  return (
    <WorkspaceShell
      active="reports"
      sectionTitle="Relatórios e Auditoria"
      storeId={storeId}
      storeName={store?.name ?? "A tua loja"}
      role={selected.role}
    >
      <div className="dashboard-content space-y-6">
        <div>
          <p className="eyebrow">Resumo financeiro e governação</p>
          <h1>Relatórios e auditoria.</h1>
          <p className="muted">
            Totais acumulados da loja, trilha imutável de operações comerciais e registos de utilização do assistente.
          </p>
        </div>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Totais financeiros">
          <div className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
            <p className="text-[12px] font-medium text-[#596660]">Receita de vendas</p>
            <p className="mt-2 font-mono text-[20px] font-semibold text-[#15201C] tabular-nums">
              {money.format(totalSales)}
            </p>
            <p className="mt-1 text-[12px] text-[#596660] tabular-nums">{sales?.length ?? 0} venda(s)</p>
          </div>
          <div className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
            <p className="text-[12px] font-medium text-[#596660]">Compras recebidas</p>
            <p className="mt-2 font-mono text-[20px] font-semibold text-[#15201C] tabular-nums">
              {money.format(totalPurchases)}
            </p>
            <p className="mt-1 text-[12px] text-[#596660] tabular-nums">{purchases?.length ?? 0} compra(s)</p>
          </div>
          <div className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
            <p className="text-[12px] font-medium text-[#596660]">Despesas operacionais</p>
            <p className="mt-2 font-mono text-[20px] font-semibold text-[#B45309] tabular-nums">
              {money.format(totalExpenses)}
            </p>
            <p className="mt-1 text-[12px] text-[#596660] tabular-nums">{expenses?.length ?? 0} despesa(s)</p>
          </div>
          <div className="rounded-[14px] border border-[#E2E7E3] bg-white p-5">
            <p className="text-[12px] font-medium text-[#596660]">Saldo líquido comercial</p>
            <p
              className={`mt-2 font-mono text-[20px] font-semibold tabular-nums ${
                netFlow >= 0 ? "text-[#15803D]" : "text-[#B91C1C]"
              }`}
            >
              {money.format(netFlow)}
            </p>
            <p className="mt-1 text-[12px] text-[#596660]">Vendas − compras − despesas</p>
          </div>
        </section>

        <section className="panel-card">
          <div className="section-heading">
            <h2>Registo de auditoria comercial</h2>
            <span>{auditLogs?.length ?? 0} eventos recentes</span>
          </div>
          {!auditLogs?.length ? (
            <p className="muted">
              Ainda não existem eventos de auditoria nesta loja. As vendas, compras, movimentos e cadastros aparecem aqui automaticamente.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Acção</th>
                    <th>Entidade</th>
                    <th>Referência</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td><strong>{log.action}</strong></td>
                      <td>{log.entity_type}</td>
                      <td className="tabular">{log.request_id || "—"}</td>
                      <td className="tabular">
                        {new Intl.DateTimeFormat("pt-AO", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "Africa/Luanda",
                        }).format(new Date(log.created_at))}
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
            <h2>Utilização do assistente de IA</h2>
            <span>{aiLogs?.length ?? 0} chamadas recentes</span>
          </div>
          {!aiLogs?.length ? (
            <p className="muted">
              Sem registos de IA guardados ainda. Quando o assistente processar consultas via Supabase, a latência e o estado aparecem aqui sem dados pessoais.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tarefa</th>
                    <th>Modelo</th>
                    <th>Estado</th>
                    <th>Latência</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {aiLogs.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.task_type || "consulta"}</td>
                      <td className="tabular">{entry.model}</td>
                      <td className={entry.success ? "text-[#15803D] font-medium" : "text-[#B91C1C] font-medium"}>
                        {entry.success ? "Concluído" : "Falha"}
                      </td>
                      <td className="tabular">{entry.latency_ms != null ? `${entry.latency_ms} ms` : "—"}</td>
                      <td className="tabular">
                        {new Intl.DateTimeFormat("pt-AO", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: "Africa/Luanda",
                        }).format(new Date(entry.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel-card">
          <h2>Evolução prevista para relatórios</h2>
          <p className="muted">
            De acordo com a arquitectura documentada, esta secção receberá filtros por intervalo de datas, exportação CSV/PDF e controlo de orçamento diário de IA agregado por loja no PostgreSQL.
          </p>
        </section>
      </div>
    </WorkspaceShell>
  );
}
