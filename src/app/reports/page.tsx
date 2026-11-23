import Link from "next/link";
import {redirect} from "next/navigation";
import {Download} from "lucide-react";
import {WorkspaceShell} from "@/components/workspace-shell";
import {DAILY_AI_STORE_BUDGET} from "@/lib/domain/assistant-rate-limit.server";
import {getTodayAiUsageCount} from "@/lib/domain/assistant-usage.server";
import {parseDateRangeFilters} from "@/lib/reports-csv";
import {createClient} from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{
    store?: string;
    from?: string;
    to?: string;
  }>;
};

const money = new Intl.NumberFormat("pt-AO", {
  style: "currency",
  currency: "AOA",
  maximumFractionDigits: 2,
});

export default async function ReportsPage({searchParams}: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {data: memberships} = await supabase
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (!memberships?.length) redirect("/onboarding");

  const selected = memberships.find((m) => m.store_id === params.store) ?? memberships[0];
  const storeId = selected.store_id;
  if (!["owner", "admin", "manager"].includes(selected.role)) redirect("/dashboard");

  const {fromDate, toDate, fromIso, toIso} = parseDateRangeFilters(params.from, params.to);

  let salesQuery = supabase.from("sales").select("total,status,sold_at").eq("store_id", storeId).eq("status", "confirmed");
  if (fromIso) salesQuery = salesQuery.gte("sold_at", fromIso);
  if (toIso) salesQuery = salesQuery.lte("sold_at", toIso);

  let purchasesQuery = supabase.from("purchases").select("total,status,received_at").eq("store_id", storeId).eq("status", "received");
  if (fromIso) purchasesQuery = purchasesQuery.gte("received_at", fromIso);
  if (toIso) purchasesQuery = purchasesQuery.lte("received_at", toIso);

  let expensesQuery = supabase.from("expenses").select("amount,created_at").eq("store_id", storeId);
  if (fromIso) expensesQuery = expensesQuery.gte("created_at", fromIso);
  if (toIso) expensesQuery = expensesQuery.lte("created_at", toIso);

  let auditQuery = supabase
    .from("audit_logs")
    .select("id,action,entity_type,created_at,request_id")
    .eq("store_id", storeId)
    .order("created_at", {ascending: false})
    .limit(25);
  if (fromIso) auditQuery = auditQuery.gte("created_at", fromIso);
  if (toIso) auditQuery = auditQuery.lte("created_at", toIso);

  let aiQuery = supabase
    .from("ai_usage_logs")
    .select("id,provider,model,success,latency_ms,task_type,created_at")
    .eq("store_id", storeId)
    .order("created_at", {ascending: false})
    .limit(20);
  if (fromIso) aiQuery = aiQuery.gte("created_at", fromIso);
  if (toIso) aiQuery = aiQuery.lte("created_at", toIso);

  const [
    {data: store},
    {data: sales},
    {data: purchases},
    {data: expenses},
    {data: auditLogs},
    {data: aiLogs},
    dailyAiCount,
  ] = await Promise.all([
    supabase.from("stores").select("name").eq("id", storeId).single(),
    salesQuery,
    purchasesQuery,
    expensesQuery,
    auditQuery,
    aiQuery,
    getTodayAiUsageCount(storeId),
  ]);

  const totalSales = (sales ?? []).reduce((sum, s) => sum + Number(s.total ?? 0), 0);
  const totalPurchases = (purchases ?? []).reduce((sum, p) => sum + Number(p.total ?? 0), 0);
  const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  const netFlow = totalSales - totalPurchases - totalExpenses;

  const exportParams = new URLSearchParams({store: storeId});
  if (fromDate) exportParams.set("from", fromDate);
  if (toDate) exportParams.set("to", toDate);

  return (
    <WorkspaceShell
      active="reports"
      sectionTitle="Relatórios e Auditoria"
      storeId={storeId}
      storeName={store?.name ?? "A tua loja"}
      role={selected.role}
    >
      <div className="dashboard-content space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Resumo financeiro e governação</p>
            <h1>Relatórios e auditoria.</h1>
            <p className="muted">
              Totais financeiros filtráveis por período, exportação CSV auditável, trilha de operações e quota diária de IA.
            </p>
          </div>

          <a
            href={`/api/reports/export?${exportParams.toString()}`}
            className="primary-button shrink-0"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Exportar CSV</span>
          </a>
        </div>

        {/* Date Filter Bar */}
        <section className="panel-card">
          <form method="GET" action="/reports" className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="store" value={storeId} />
            <label className="text-[13px] font-medium text-[#2B3933]">
              De (data)
              <input
                type="date"
                name="from"
                defaultValue={fromDate}
                className="mt-1 block min-h-[42px] rounded-lg border border-[#C6D0C9] bg-white px-3 text-[13.5px]"
              />
            </label>
            <label className="text-[13px] font-medium text-[#2B3933]">
              Até (data)
              <input
                type="date"
                name="to"
                defaultValue={toDate}
                className="mt-1 block min-h-[42px] rounded-lg border border-[#C6D0C9] bg-white px-3 text-[13.5px]"
              />
            </label>
            <button type="submit" className="quiet-button !min-h-[42px]">
              Aplicar período
            </button>
            {(fromDate || toDate) && (
              <Link href={`/reports?store=${storeId}`} className="quiet-button !min-h-[42px]">
                Limpar filtros
              </Link>
            )}
          </form>
        </section>

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
            <h2>Orçamento diário e utilização de IA</h2>
            <span className="font-mono tabular-nums">
              Hoje: {dailyAiCount} / {DAILY_AI_STORE_BUDGET} chamadas
            </span>
          </div>
          {!aiLogs?.length ? (
            <p className="muted">
              Sem registos de IA para o período seleccionado. Conversa com o assistente no painel IA e WhatsApp para validar respostas e latência.
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
          <div className="section-heading">
            <h2>Registo de auditoria comercial</h2>
            <span>{auditLogs?.length ?? 0} eventos recentes</span>
          </div>
          {!auditLogs?.length ? (
            <p className="muted">
              Ainda não existem eventos de auditoria no período seleccionado. As vendas, compras, movimentos e cadastros aparecem aqui automaticamente.
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
      </div>
    </WorkspaceShell>
  );
}
