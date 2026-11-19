# Migrações

O histórico remoto do projecto Supabase `Edivânia` contém:

- `20261119165457_initial_commercial_core`
- `20261119165518_rls_hardening_and_indexes`
- `20261119165651_membership_role_hardening`
- `20261119165703_public_view_grants_hardening`
- `20261119165840_inventory_view_privilege_lockdown`

## Snapshot de bootstrap

O ficheiro `20261119165457_initial_commercial_core.sql` é um snapshot consolidado do schema final, exportado do PostgreSQL remoto em 2026-11-19. Inclui tabelas, constraints, índices, funções, triggers, RLS, políticas, vista de stock e grants de acesso. Foi colocado na primeira versão para permitir reconstruir o estado actual num projecto limpo.

Os quatro ficheiros posteriores são marcadores sem DDL adicional. As alterações que representam já estão incluídas no snapshot. Esta organização preserva as versões remotas e permite bootstrap de uma instalação nova, mas não reproduz a sequência histórica exacta das alterações.

**Antes de usar o snapshot num segundo projecto:** aplicar primeiro num projecto Supabase de desenvolvimento isolado e confirmar que todas as tabelas, políticas e grants são criados sem erros. Não executar o snapshot sobre uma base que já contenha estas tabelas. A partir daqui, cada alteração nova deve ser uma migração incremental, versionada e testada.

O histórico remoto e os advisors foram verificados após a aplicação. As chaves secretas nunca devem ser guardadas nestes ficheiros.
