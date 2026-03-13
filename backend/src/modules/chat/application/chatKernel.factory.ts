import type { TurnExecutor } from "./handlers/types";
import { ConnectorTurnHandler } from "./handlers/connectorTurn.handler";
import { GeneralTurnHandler } from "./handlers/generalTurn.handler";
import { KnowledgeTurnHandler } from "./handlers/knowledgeTurn.handler";
import { TurnContextBuilder } from "./turnContext.builder";
import { TurnRoutePolicyService } from "./turnRoutePolicy.service";
import { TurnRouterService } from "./turnRouter.service";

export type ChatKernelRuntime = {
  contextBuilder: TurnContextBuilder;
  routePolicy: TurnRoutePolicyService;
  router: TurnRouterService;
  connectorHandler: ConnectorTurnHandler;
  knowledgeHandler: KnowledgeTurnHandler;
  generalHandler: GeneralTurnHandler;
};

export function createChatKernelRuntime(
  executor: TurnExecutor,
): ChatKernelRuntime {
  const routePolicy = new TurnRoutePolicyService();
  return {
    contextBuilder: new TurnContextBuilder(),
    routePolicy,
    router: new TurnRouterService(routePolicy),
    connectorHandler: new ConnectorTurnHandler(executor),
    knowledgeHandler: new KnowledgeTurnHandler(executor),
    generalHandler: new GeneralTurnHandler(executor),
  };
}
