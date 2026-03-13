import type { DocumentIntelligenceBanksService } from "../../../services/core/banks/documentIntelligenceBanks.service";

export type FileActionBankProvider =
  | Pick<DocumentIntelligenceBanksService, "getFileActionOperators">
  | ((bankId: string) => unknown | null);
