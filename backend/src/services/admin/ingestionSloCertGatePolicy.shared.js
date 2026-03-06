"use strict";

function evaluateEvidenceCompliance(params) {
  const failures = [];
  const warnings = [];
  if (params.required && params.evidenceMode !== "live_collection") {
    failures.push("NON_LIVE_EVIDENCE_NOT_ALLOWED_IN_REQUIRED_MODE");
  }
  if (params.required && params.collectionCapped) {
    failures.push("INGESTION_SLO_COLLECTION_INCOMPLETE");
  }
  if (!params.required && params.collectionCapped) {
    warnings.push("INGESTION_SLO_COLLECTION_INCOMPLETE_NON_BLOCKING");
  }
  return { failures, warnings };
}

async function collectEventsPaginated(params) {
  const { prisma, from, to, pageSize = 5000, maxEvents = 0 } = params;
  const events = [];
  let pagesFetched = 0;
  let capped = false;
  let cursorAt = null;
  let cursorId = null;

  while (true) {
    const where = { at: { gte: from, lt: to } };
    if (cursorAt !== null && cursorId !== null) {
      where.OR = [
        { at: { gt: cursorAt } },
        { at: cursorAt, id: { gt: cursorId } },
      ];
    }

    const rows = await prisma.ingestionEvent.findMany({
      where,
      select: {
        id: true,
        at: true,
        status: true,
        mimeType: true,
        durationMs: true,
        meta: true,
      },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      take: pageSize,
    });

    if (!rows.length) break;
    pagesFetched += 1;

    for (const row of rows) {
      if (maxEvents > 0 && events.length >= maxEvents) {
        capped = true;
        break;
      }
      events.push({
        status: row.status,
        mimeType: row.mimeType,
        durationMs: row.durationMs,
        meta: row.meta,
      });
    }

    if (capped) break;
    const last = rows[rows.length - 1];
    cursorAt = last.at;
    cursorId = last.id;
    if (rows.length < pageSize) break;
  }

  return { events, pagesFetched, capped };
}

module.exports = {
  evaluateEvidenceCompliance,
  collectEventsPaginated,
};
