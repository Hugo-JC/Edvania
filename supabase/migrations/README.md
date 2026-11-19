# Migrações

O schema inicial e o endurecimento RLS foram aplicados no projecto Supabase remoto em 2026-11-19 e estão registados na tabela de histórico do Supabase:

- `20261119165457_initial_commercial_core`
- `20261119165518_rls_hardening_and_indexes`

A integração Supabase utilizada nesta sessão confirmou as versões e a aplicação, mas não disponibiliza o corpo SQL das migrações já executadas. Por isso, não foi inventado um ficheiro SQL que pudesse divergir da base real. Antes de abrir um segundo ambiente ou automatizar deploys, exportar o schema remoto para migrações locais e validar a correspondência dos dois históricos. A partir daí, todas as alterações devem entrar por ficheiros SQL versionados e revisão de RLS.
