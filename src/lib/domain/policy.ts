import type { StoreRole } from "./contracts";
const grants={read:["owner","admin","manager","employee"],catalog_write:["owner","admin","manager"],commercial_write:["owner","admin","manager","employee"],finance_write:["owner","admin","manager"],cash_manage:["owner","admin","manager"]} as const satisfies Record<string,readonly StoreRole[]>;
export type DomainPermission=keyof typeof grants;
export function roleCan(role:StoreRole,permission:DomainPermission){return grants[permission].includes(role);}
