import type { StoreRole } from "./contracts";
export type DomainPermission="read"|"catalog_write"|"commercial_write"|"finance_write"|"cash_manage";
const grants:Record<DomainPermission,readonly StoreRole[]>={read:["owner","admin","manager","employee"],catalog_write:["owner","admin","manager"],commercial_write:["owner","admin","manager","employee"],finance_write:["owner","admin","manager"],cash_manage:["owner","admin","manager"]};
export function roleCan(role:StoreRole,permission:DomainPermission){return grants[permission].includes(role);}
