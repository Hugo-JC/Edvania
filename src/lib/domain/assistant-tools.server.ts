import "server-only";
import {checkStock, getProductDetails, searchProducts} from "./services";
import type {ToolContext} from "./contracts";
import {executeAssistantTool, type AssistantToolHandlers} from "./assistant-tools";

const domainHandlers: AssistantToolHandlers = {
  searchProducts,
  getProductDetails,
  checkStock: (context, productId) => checkStock(context, productId),
};

export function executeDomainAssistantTool(context: ToolContext, name: unknown, input: unknown) {
  return executeAssistantTool(context, name, input, domainHandlers);
}
