import { PrismaRetrievalAdapterFactory as PrismaRetrievalAdapterFactoryV1 } from "./prismaRetrievalAdapters.service";
import { PrismaRetrievalAdapterFactoryV2 } from "./prismaRetrievalAdapters.v2.service";

function isFlagEnabled(flagName: string, defaultValue: boolean): boolean {
  const raw = String(process.env[flagName] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

export const PrismaRetrievalAdapterFactory = (isFlagEnabled(
  "RETRIEVAL_V2_PRISMA_ADAPTERS",
  false,
)
  ? PrismaRetrievalAdapterFactoryV2
  : PrismaRetrievalAdapterFactoryV1) as typeof PrismaRetrievalAdapterFactoryV1;
