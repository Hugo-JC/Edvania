import {z} from "zod";
import {closeCashSchema,expenseSchema,idSchema,openCashSchema,purchaseSchema,saleSchema,searchSchema,type ToolContext} from "@/lib/domain/contracts";
import * as svc from "@/lib/domain/services";
type Def={description:string;inputSchema:z.ZodType;execute:(ctx:ToolContext,input:unknown)=>Promise<unknown>};
function define<S extends z.ZodType>(description:string,schema:S,run:(ctx:ToolContext,input:z.infer<S>)=>Promise<unknown>):Def{return{description,inputSchema:schema,execute:(ctx,input)=>{const p=schema.safeParse(input);return p.success?run(ctx,p.data):Promise.resolve({ok:false,error:{code:"VALIDATION",message:"Argumentos inválidos.",retryable:false}});}};}
export const backendTools={
 get_store_summary:define("Resumo comercial da loja autenticada.",z.object({}).strict(),c=>svc.getStoreSummary(c)),
 search_products:define("Pesquisa produtos activos.",searchSchema,(c,i)=>svc.searchProducts(c,i.query,i.limit)),
 get_product_details:define("Detalhes de produto.",idSchema,(c,i)=>svc.getProductDetails(c,i.id)),
 check_stock:define("Consulta saldos de inventário.",z.object({productId:z.string().uuid().optional()}).strict(),(c,i)=>svc.checkStock(c,i.productId)),
 search_customers:define("Pesquisa clientes activos.",searchSchema,(c,i)=>svc.searchCustomers(c,i.query,i.limit)),
 get_customer_balance:define("Saldo em aberto do cliente.",idSchema,(c,i)=>svc.getCustomerBalance(c,i.id)),
 get_sales_summary:define("Resumo de vendas recentes.",z.object({}).strict(),c=>svc.getSalesSummary(c)),
 get_cash_register_status:define("Sessões de caixa abertas.",z.object({}).strict(),c=>svc.getCashRegisterStatus(c)),
 create_sale:define("Regista venda após confirmação explícita.",saleSchema,(c,i)=>svc.createSale(c,i)),
 create_purchase:define("Cria compra e recebe artigos atomicamente; requer confirmação.",purchaseSchema,(c,i)=>svc.createPurchase(c,i)),
 receive_purchase:define("Não existe RPC de recepção posterior; a compra já é recebida no acto da criação.",idSchema,async()=>({ok:false,error:{code:"BUSINESS_RULE",message:"A compra é criada já recebida pela RPC transaccional existente.",retryable:false}})),
 register_expense:define("Regista despesa em sessão aberta; requer confirmação.",expenseSchema,(c,i)=>svc.registerExpense(c,i)),
 open_cash_session:define("Abre sessão de caixa; requer confirmação.",openCashSchema,(c,i)=>svc.openCashSession(c,i)),
 close_cash_session:define("Fecha sessão de caixa; requer confirmação.",closeCashSchema,(c,i)=>svc.closeCashSession(c,i)),
} satisfies Record<string,Def>;
export type BackendToolName=keyof typeof backendTools;
export async function executeBackendTool(name:BackendToolName,context:ToolContext,input:unknown){return backendTools[name].execute(context,input);}
