import Link from "next/link";
import {redirect} from "next/navigation";
import {WorkspaceShell} from "@/components/workspace-shell";
import {createClient} from "@/lib/supabase/server";
import {updateMemberAccess, updateStoreProfile} from "./actions";

type Props = {
  searchParams: Promise<{
    store?: string;
    notice?: string;
    error?: string;
  }>;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  employee: "Operador",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-profile": "Verifica o nome comercial e os dados preenchidos antes de guardar.",
  "invalid-phone": "Número de telefone inválido. Usa formato E.164 ou Angola (ex.: +244923000111).",
  "update-failed": "Não foi possível guardar as alterações na base de dados.",
  "owner-only": "Apenas o proprietário da loja pode alterar papéis ou suspender membros.",
  "last-owner": "A loja precisa de manter pelo menos um proprietário activo.",
  "member-not-found": "O membro seleccionado não foi encontrado nesta loja.",
  "invalid-member": "Dados de acesso inválidos.",
};

export default async function SettingsPage({searchParams}: Props) {
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

  const [{data: store}, {data: team}, {data: registers}, {data: connections}] = await Promise.all([
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
  const isOwner = selected.role === "owner";

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
            Identidade comercial editável, caixas registadoras, canais WhatsApp registados e controlo de acesso da equipa.
          </p>
        </div>

        {params.error && (
          <p className="error" role="alert">
            {ERROR_MESSAGES[params.error] ?? "Não foi possível concluir a acção solicitada."}
          </p>
        )}
        {params.notice === "profile-updated" && (
          <p className="notice" role="status">
            Dados comerciais da loja actualizados com sucesso.
          </p>
        )}
        {params.notice === "member-updated" && (
          <p className="notice" role="status">
            Permissões do membro actualizadas com sucesso.
          </p>
        )}

        <section className="panel-card">
          <div className="section-heading">
            <h2>Dados gerais da loja</h2>
            <span>
              {store?.currency_code ?? "AOA"} · {store?.timezone ?? "Africa/Luanda"}
            </span>
          </div>

          {canManage ? (
            <form action={updateStoreProfile} className="form">
              <input type="hidden" name="storeId" value={storeId} />
              <div className="form-grid">
                <label>
                  Nome comercial
                  <input name="name" required minLength={2} maxLength={120} defaultValue={store?.name ?? ""} />
                </label>
                <label>
                  Denominação legal (opcional)
                  <input name="legalName" maxLength={160} defaultValue={store?.legal_name ?? ""} />
                </label>
                <label>
                  NIF
                  <input name="taxNumber" maxLength={40} defaultValue={store?.tax_number ?? ""} placeholder="Ex.: 5410000000" />
                </label>
                <label>
                  Telefone principal
                  <input name="phone" type="tel" maxLength={32} defaultValue={store?.phone_e164 ?? ""} placeholder="+244923000000" />
                </label>
                <label>
                  Email comercial
                  <input name="email" type="email" maxLength={160} defaultValue={store?.email ?? ""} placeholder="contacto@loja.ao" />
                </label>
                <label>
                  Endereço físico
                  <input name="address" maxLength={250} defaultValue={store?.address ?? ""} placeholder="Luanda, Angola" />
                </label>
              </div>
              <button type="submit" className="primary-button">
                Guardar identidade da loja
              </button>
            </form>
          ) : (
            <dl className="grid grid-cols-1 gap-4 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-[12px] font-medium text-[#596660]">Nome comercial</dt>
                <dd className="mt-1 font-semibold text-[#15201C]">{store?.name ?? "—"}</dd>
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
          )}
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
                        {conn.phone_e164 || "Por registar"}
                      </span>
                    </span>
                    <span className="text-[13px] text-[#596660]">{conn.connection_status}</span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <div className="mt-4 flex flex-wrap gap-2.5">
                <Link href={`/assistant?store=${storeId}`} className="primary-button">
                  Gerir Baileys e IA
                </Link>
                <Link href={`/whatsapp?store=${storeId}`} className="quiet-button">
                  Fila outbox
                </Link>
              </div>
            )}
          </section>
        </div>

        <section className="panel-card">
          <div className="section-heading">
            <h2>Membros da equipa e acessos</h2>
            <span>{team?.length ?? 0} utilizador(es)</span>
          </div>
          {!team?.length ? (
            <p className="muted">Sem membros listados.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Utilizador</th>
                    <th>Papel</th>
                    <th>Estado</th>
                    {isOwner && <th>Gestão (Proprietário)</th>}
                  </tr>
                </thead>
                <tbody>
                  {team.map((member) => (
                    <tr key={member.id}>
                      <td className="tabular">
                        {member.user_id === user.id ? "A tua conta" : `${member.user_id.slice(0, 8)}…`}
                      </td>
                      <td>{ROLE_LABELS[member.role] ?? member.role}</td>
                      <td>
                        {member.status === "active"
                          ? "Activo"
                          : member.status === "archived"
                            ? "Arquivado"
                            : "Inactivo"}
                      </td>
                      {isOwner && (
                        <td>
                          <form action={updateMemberAccess} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="storeId" value={storeId} />
                            <input type="hidden" name="membershipId" value={member.id} />
                            <select
                              name="role"
                              defaultValue={member.role}
                              aria-label="Papel do membro"
                              className="min-h-[38px] rounded-lg border border-[#C6D0C9] bg-white px-2.5 text-[13px]"
                            >
                              <option value="owner">Proprietário</option>
                              <option value="admin">Administrador</option>
                              <option value="manager">Gestor</option>
                              <option value="employee">Operador</option>
                            </select>
                            <select
                              name="status"
                              defaultValue={member.status}
                              aria-label="Estado do membro"
                              className="min-h-[38px] rounded-lg border border-[#C6D0C9] bg-white px-2.5 text-[13px]"
                            >
                              <option value="active">Activo</option>
                              <option value="inactive">Inactivo</option>
                              <option value="archived">Arquivado</option>
                            </select>
                            <button type="submit" className="quiet-button !min-h-[38px] !px-3 text-[12.5px]">
                              Aplicar
                            </button>
                          </form>
                        </td>
                      )}
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
