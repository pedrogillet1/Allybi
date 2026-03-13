import { getBankLoaderInstance } from "../../banks/bankLoader.service";
import {
  getDocumentIntelligenceBanksInstance,
} from "../../banks/documentIntelligenceBanks.service";
import {
  PrismaRetrievalAdapterFactory,
} from "../prismaRetrievalAdapters.service";
import { createDefaultQueryNormalizer } from "./DefaultQueryNormalizer.service";
import {
  UserScopedRetrievalRuntime,
  type UserScopedRetrievalRuntimeOptions,
} from "./UserScopedRetrievalRuntime.service";

export function buildDefaultUserScopedRetrievalRuntimeOptions(): UserScopedRetrievalRuntimeOptions {
  return {
    adapterFactory: new PrismaRetrievalAdapterFactory(),
    bankLoader: getBankLoaderInstance(),
    queryNormalizer: createDefaultQueryNormalizer(),
    documentIntelligenceBanks: getDocumentIntelligenceBanksInstance(),
  };
}

export function createUserScopedRetrievalRuntime(): UserScopedRetrievalRuntime {
  return new UserScopedRetrievalRuntime(
    buildDefaultUserScopedRetrievalRuntimeOptions(),
  );
}
