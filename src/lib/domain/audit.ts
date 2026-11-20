import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/lib/supabase/database.types";
import type {ToolContext} from "./contracts";
export async function writeAudit(supabase:SupabaseClient<Database>,context:ToolContext,action:string,entityType:string,entityId:string|null,metadata:Record<string,string|number|boolean|null>={}){
 const rpc=supabase.rpc as unknown as (name:string,args:Record<string,unknown>)=>Promise<{error:{message:string}|null}>;
 const {error}=await rpc("write_audit_log",{p_store_id:context.storeId,p_action:action,p_entity_type:entityType,p_entity_id:entityId,p_request_id:context.requestId??null,p_metadata:metadata});
 if(error)throw new Error("audit_write_failed");
}
