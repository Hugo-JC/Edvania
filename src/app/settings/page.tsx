import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ store?: string }> };

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  employee: "Operador",
};

export default async function SettingsPage({ searchParams }: Props) {
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

  const [{ data: store }, { data: team }, { data: registers }, { data: connections }] = await Promise.all([
    supabase
      .from("stores")
      .select("id,name,legal_name,currency_code,timezone,tax_number,phone_e164,email,address")
      .eq("id", storeId)
      .single(),
    supabase
      .from("store_memberships")
      .select("id,user_id,role,status,created_at")
      .eq("store_id", storeId)
      .order("created_at"),
    supabase
      .from("cash_registers")
      .select("id,name,status")
      .eq("store_id", storeId)
      .order("name"),
    supabase
      .from("whatsapp_connections")
      .select("id,provider,phone_e164,connection_status")
      .eq("store_id", storeId)
      .order("created_at"),
  ]);

  const canManage = ["owner", "admin", "manager"].includes(selected.role);

  return (
    <WorkspaceShell
      active="settings"
      sectionTitle="Definições da Loja"
      storeId={storeId}
      storeName={store?.name ?? "A tua loja"}
      role={selected.role}
    >
      <div className="dashboard-content space-y-6">
        <div>
          <p className="eyebrow">Configuração e equipa</p>
          <h1>Definições da loja.</h1>
          <p className="muted">
            Identidade comercial, caixas registadoras, ligações WhatsApp e membros com acesso a esta loja.
          </p>
        </div>

        <section className="panel-card">
          <div className="section-heading">
            <h2>Dados gerais</h2>
            <span>{store?.currency_code ?? "AOA"}</span>
          </div>
          <dl className="grid grid-cols-1 gap-4 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-[12px] font-medium text-[#596660]">Nome comercial</dt>
              <dd className="mt-1 font-semibold text-[#15201C]">{store?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-[#596660]">Fuso horário</dt>
              <dd className="mt-1 font-mono text-[#15201C]">{store?.timezone ?? "Africa/Luanda"}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-[#596660]">NIF</dt>
              <dd className="mt-1 font-mono text-[#15201C]">{store?.tax_number || "Por definir"}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-[#596660]">Telefone</dt>
              <dd className="mt-1 font-mono text-[#15201C]">{store?.phone_e164 || "Por definir"}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-[#596660]">Email</dt>
              <dd className="mt-1 text-[#15201C]">{store?.email || "Por definir"}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-[#596660]">Endereço</dt>
              <dd className="mt-1 text-[#15201C]">{store?.address || "Por definir"}</dd>
            </div>
          </dl>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="panel-card !mb-0">
            <div className="section-heading">
              <h2>Caixas registadoras</h2>
              <span>{registers?.length ?? 0} activa(s)</span>
            </div>
            {!registers?.length ? (
              <p className="muted">Sem caixas configuradas.</p>
            ) : (
              <ul className="divide-y divide-[#E2E7E3] text-[14px]">
                {registers.map((reg) => (
                  <li key={reg.id} className="flex items-center justify-between py-2.5">
                    <span className="font-medium text-[#15201C]">{reg.name}</span>
                    <span className="text-[13px] text-[#596660]">
                      {reg.status === "active" ? "Activa" : reg.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <div className="mt-4">
                <Link href={`/cash?store=${storeId}`} className="quiet-button">
                  Gerir turnos de caixa
                </Link>
              </div>
            )}
          </section>

          <section className="panel-card !mb-0">
            <div className="section-heading">
              <h2>Canais WhatsApp</h2>
              <span>{connections?.length ?? 0} ligação(ões)</span>
            </div>
            {!connections?.length ? (
              <p className="muted">Nenhuma ligação WhatsApp criada.</p>
            ) : (
              <ul className="divide-y divide-[#E2E7E3] text-[14px]">
                {connections.map((conn) => (
                  <li key={conn.id} className="flex items-center justify-between py-2.5">
                    <span>
                      <strong className="text-[#15201C]">{conn.provider}</strong>
                      <span className="ml-2 font-mono text-[12px] text-[#596660]">
                        {conn.phone_e164 || "Sandbox"}
                      </span>
                    </span>
                    <span className="text-[13px] text-[#596660]">{conn.connection_status}</span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <div className="mt-4">
                <Link href={`/whatsapp?store=${storeId}`} className="quiet-button">
                  Abrir painel WhatsApp
                </Link>
              </div>
            )}
          </section>
        </div>

        <section className="panel-card">
          <div className="section-heading">
            <h2>Membros da equipa</h2>
            <span>{team?.length ?? 0} utilizador(es)</span>
          </div>
          {!team?.length ? (
            <p className="muted">Sem membros listados.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Identificador de membro</th>
                    <th>Papel</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member) => (
                    <tr key={member.id}>
                      <td className="tabular">
                        {member.user_id === user.id ? "A tua conta" : `${member.user_id.slice(0, 8)}…`}
                      </td>
                      <td>{ROLE_LABELS[member.role] ?? member.role}</td>
                      <td>{member.status === "active" ? "Activo" : member.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel-card">
          <h2>Módulos previstos na documentação</h2>
          <p className="muted">
            Consoante a documentação de base de dados (`docs/DATABASE.md`), esta página está preparada para acolher: convites e gestão de papéis exclusiva do proprietário, selecção oficial de província/município em Angola e parametrização de pagamentos ProxyPay / Multicaixa Express.
          </p>
        </section>
      </div>
    </WorkspaceShell>
  );
}
