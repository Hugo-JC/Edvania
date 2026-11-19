# Migrações

O schema inicial foi aplicado ao projecto remoto Supabase em 2026-11-19 e está registado no histórico de migrações:

- `20261119165457_initial_commercial_core`
- `20261119165518_rls_hardening_and_indexes`
- `20261119165651_membership_role_hardening`
- `20261119165703_public_view_grants_hardening`

A integração Supabase utilizada nesta sessão confirmou a aplicação, o número de tabelas, RLS e advisors, mas não disponibiliza o corpo SQL das migrações já executadas. Por isso, não foi inventado um ficheiro SQL que pudesse divergir da base real.

Antes de abrir um segundo ambiente ou automatizar deploys, exportar o schema remoto para migrações SQL locais e validar a correspondência dos dois históricos. A partir daí, todas as alterações devem entrar por ficheiros SQL versionados e revisão de RLS. Não executar DDL avulso em produção.
