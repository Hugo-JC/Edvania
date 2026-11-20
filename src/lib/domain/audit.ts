import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/lib/supabase/database.types";
import type {ToolContext} from "./contracts";
export async function writeAudit(supabase:SupabaseClient<Database>,context:ToolContext,action:string,entityType:string,entityId:string|null,metadata:Record<string,string|number|boolean|null>={}){
 const {error}=await supabase.from("audit_logs").insert({store_id:context.storeId,actor_user_id:context.userId,action,entity_type:entityType,entity_id:entityId,request_id:context.requestId??null,metadata});
 if(error)throw new Error("audit_write_failed");
}
