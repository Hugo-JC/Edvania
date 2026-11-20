import {authorizeStore} from "./authorization";
import {failure,success,type ToolContext} from "./contracts";
export async function getSalePayments(context:ToolContext,saleId:string){const a=await authorizeStore(context);if(!a.ok)return a;const {data,error}=await a.data.supabase.from("payments").select("id,sale_id,method,status,amount,currency_code,paid_at,created_at").eq("store_id",context.storeId).eq("sale_id",saleId).order("created_at",{ascending:false});if(error)return failure("DEPENDENCY","Não foi possível consultar os pagamentos.",true);return success(data??[]);}
