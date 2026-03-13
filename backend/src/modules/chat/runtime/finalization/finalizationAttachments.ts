import type { ChatSourceDTO } from "../../domain/chat.contracts";
import type { Attachment } from "../../../../types/attachments.types";

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  const left = Number.isFinite(Number(a)) ? Number(a) : Number.MAX_SAFE_INTEGER;
  const right = Number.isFinite(Number(b)) ? Number(b) : Number.MAX_SAFE_INTEGER;
  return left - right;
}

function toAttachmentArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") return [value];
  return [];
}

export function sortSources(sources: ChatSourceDTO[]): ChatSourceDTO[] {
  return [...sources].sort((a, b) => {
    const leftDoc = String(a.documentId || "").trim();
    const rightDoc = String(b.documentId || "").trim();
    if (leftDoc !== rightDoc) return leftDoc.localeCompare(rightDoc);
    const byPage = compareNullableNumber(a.page, b.page);
    if (byPage !== 0) return byPage;
    const bySlide = compareNullableNumber(a.slide, b.slide);
    if (bySlide !== 0) return bySlide;
    return String(a.locationKey || "").localeCompare(String(b.locationKey || ""));
  });
}

export function toEnforcerAttachments(value: unknown): Attachment[] {
  return toAttachmentArray(value).filter(
    (attachment): attachment is Attachment =>
      Boolean(attachment) && typeof attachment === "object",
  );
}

export function filterAttachmentsForSources(
  attachmentsPayload: unknown,
  allowedDocumentIds: Set<string>,
): Attachment[] {
  const attachments = toAttachmentArray(attachmentsPayload);
  if (allowedDocumentIds.size === 0) {
    return attachments.filter((attachment) => {
      if (!attachment || typeof attachment !== "object") return true;
      return String((attachment as Record<string, unknown>).type || "").trim() !== "source_buttons";
    }) as Attachment[];
  }

  return attachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== "object") return attachment;
      if (String((attachment as Record<string, unknown>).type || "").trim() !== "source_buttons") {
        return attachment;
      }
      const buttons = Array.isArray((attachment as Record<string, unknown>).buttons)
        ? ((attachment as Record<string, unknown>).buttons as unknown[])
        : [];
      const filteredButtons = buttons.filter((button): boolean => {
        if (!button || typeof button !== "object") return false;
        const documentId = String((button as Record<string, unknown>).documentId || "").trim();
        return allowedDocumentIds.has(documentId);
      });
      if (filteredButtons.length === 0) return null;
      return {
        ...attachment,
        buttons: filteredButtons,
      };
    })
    .filter((attachment): attachment is Attachment => Boolean(attachment));
}
