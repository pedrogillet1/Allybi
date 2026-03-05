import { PrismaRetrievalAdapterFactory as PrismaRetrievalAdapterFactoryV1 } from "./prismaRetrievalAdapters.service";
import { PrismaRetrievalAdapterFactoryV2 } from "./prismaRetrievalAdapters.v2.service";

const PRISMA_RETRIEVAL_SELECTOR_FLAG = "RETRIEVAL_V2_PRISMA_ADAPTERS";

function isFlagEnabled(flagName: string, defaultValue: boolean): boolean {
  const raw = String(process.env[flagName] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

type PrismaRetrievalRuntimeMode = "v1" | "v2";

function resolvePrismaRetrievalRuntimeMode(): PrismaRetrievalRuntimeMode {
  return isFlagEnabled(PRISMA_RETRIEVAL_SELECTOR_FLAG, false) ? "v2" : "v1";
}

const prismaRetrievalRuntimeMode = resolvePrismaRetrievalRuntimeMode();

export const prismaRetrievalRuntimeMetadata = {
  flag: PRISMA_RETRIEVAL_SELECTOR_FLAG,
  mode: prismaRetrievalRuntimeMode,
} as const;

export function getPrismaRetrievalRuntimeMetadata() {
  return prismaRetrievalRuntimeMetadata;
}

export const PrismaRetrievalAdapterFactory = (prismaRetrievalRuntimeMode === "v2"
  ? PrismaRetrievalAdapterFactoryV2
  : PrismaRetrievalAdapterFactoryV1) as typeof PrismaRetrievalAdapterFactoryV1;
