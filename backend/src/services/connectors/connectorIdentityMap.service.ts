import prisma from "../../config/database";
import type { ConnectorProvider } from "./connectorsRegistry";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function delegate() {
  const d = (prisma as any)?.connectorIdentityMap;
  if (!d || typeof d.upsert !== "function") return null;
  return d;
}

export class ConnectorIdentityMapService {
  async upsertLink(input: {
    userId: string;
    provider: ConnectorProvider;
    externalWorkspaceId: string;
    externalUserId?: string | null;
    externalAccountEmail?: string | null;
  }): Promise<void> {
    const userId = asString(input.userId);
    const workspaceId = asString(input.externalWorkspaceId);
    if (!userId || !workspaceId) return;

    const d = delegate();
    if (!d) return;

    await d.upsert({
      where: {
        provider_externalWorkspaceId_userId: {
          provider: input.provider,
          externalWorkspaceId: workspaceId,
          userId,
        },
      },
      create: {
        userId,
        provider: input.provider,
        externalWorkspaceId: workspaceId,
        externalUserId: asString(input.externalUserId),
        externalAccountEmail: asString(input.externalAccountEmail),
      },
      update: {
        externalUserId: asString(input.externalUserId),
        externalAccountEmail: asString(input.externalAccountEmail),
      },
    });
  }

  async upsertSlackWorkspaceLink(input: {
    userId: string;
    teamId: string;
    externalUserId?: string | null;
    externalAccountEmail?: string | null;
  }): Promise<void> {
    return this.upsertLink({
      userId: input.userId,
      provider: "slack",
      externalWorkspaceId: input.teamId,
      externalUserId: input.externalUserId,
      externalAccountEmail: input.externalAccountEmail,
    });
  }

  async findUserIdsByWorkspace(
    provider: ConnectorProvider,
    externalWorkspaceId: string,
  ): Promise<string[]> {
    const workspaceId = asString(externalWorkspaceId);
    if (!workspaceId) return [];

    const d = delegate();
    if (!d) return [];

    const rows = (await d.findMany({
      where: { provider, externalWorkspaceId: workspaceId },
      select: { userId: true },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    })) as Array<{ userId?: unknown }>;

    return Array.from(
      new Set(rows.map((row) => asString(row?.userId)).filter(Boolean)),
    ) as string[];
  }

  async getSyncCursor(
    userId: string,
    provider: ConnectorProvider,
  ): Promise<string | null> {
    const d = delegate();
    if (!d) return null;

    const row = await d.findFirst({
      where: { userId, provider },
      select: { syncCursor: true },
      orderBy: { updatedAt: "desc" },
    });
    return row?.syncCursor ?? null;
  }

  async updateSyncCursor(
    userId: string,
    provider: ConnectorProvider,
    cursor: string,
  ): Promise<void> {
    const d = delegate();
    if (!d) return;

    await d.updateMany({
      where: { userId, provider },
      data: { syncCursor: cursor, lastSyncAt: new Date() },
    });
  }
}

export default ConnectorIdentityMapService;
