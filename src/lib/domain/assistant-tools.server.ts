import "server-only";
import {
  checkStock,
  getCashRegisterStatus,
  getCustomerBalance,
  getProductDetails,
  getSalesSummary,
  getStoreSummary,
  searchCustomers,
  searchProducts,
} from "./services";
import type {ToolContext} from "./contracts";
import {executeAssistantTool, type AssistantToolHandlers} from "./assistant-tools";

const domainHandlers: AssistantToolHandlers = {
  searchProducts,
  getProductDetails,
  checkStock: (context, productId) => checkStock(context, productId),
  getStoreSummary,
  searchCustomers,
  getCustomerBalance,
  getSalesSummary,
  getCashRegisterStatus,
};

export function executeDomainAssistantTool(context: ToolContext, name: unknown, input: unknown) {
  return executeAssistantTool(context, name, input, domainHandlers);
}
