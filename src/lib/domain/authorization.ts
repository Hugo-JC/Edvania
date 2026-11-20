import {createClient} from "@/lib/supabase/server";
import {failure,success,type ToolContext,type StoreRole} from "./contracts";
export async function authorizeStore(context:ToolContext,allowedRoles?:readonly StoreRole[]){
 if(!context.storeId||!context.userId)return failure("UNAUTHENTICATED","Contexto de utilizador incompleto.");
 const supabase=await createClient();
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)return failure("UNAUTHENTICATED","É necessária uma sessão autenticada.");
 if(user.id!==context.userId)return failure("FORBIDDEN","O contexto não corresponde ao utilizador autenticado.");
 const {data:membership,error}=await supabase.from("store_memberships").select("role,status").eq("store_id",context.storeId).eq("user_id",user.id).eq("status","active").maybeSingle();
 if(error)return failure("DEPENDENCY","Não foi possível validar a associação à loja.",true);
 if(!membership)return failure("FORBIDDEN","O utilizador não pertence a esta loja.");
 const role=membership.role as StoreRole;
 if(allowedRoles&&!allowedRoles.includes(role))return failure("FORBIDDEN","O papel actual não permite esta operação.");
 return success({supabase,user,role,storeId:context.storeId});
}
