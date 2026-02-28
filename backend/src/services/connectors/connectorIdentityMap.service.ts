import prisma from "../../config/database";
import type { ConnectorProvider } from "./connectorsRegistry";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class ConnectorIdentityMapService {
  async upsertSlackWorkspaceLink(input: {
    userId: string;
    teamId: string;
    externalUserId?: string | null;
    externalAccountEmail?: string | null;
  }): Promise<void> {
    const userId = asString(input.userId);
    const teamId = asString(input.teamId);
    if (!userId || !teamId) return;

    const delegate = (prisma as any)?.connectorIdentityMap;
    if (!delegate || typeof delegate.upsert !== "function") return;

    await delegate.upsert({
      where: {
        provider_externalWorkspaceId_userId: {
          provider: "slack",
          externalWorkspaceId: teamId,
          userId,
        },
      },
      create: {
        userId,
        provider: "slack",
        externalWorkspaceId: teamId,
        externalUserId: asString(input.externalUserId),
        externalAccountEmail: asString(input.externalAccountEmail),
      },
      update: {
        externalUserId: asString(input.externalUserId),
        externalAccountEmail: asString(input.externalAccountEmail),
      },
    });
  }

  async findUserIdsByWorkspace(
    provider: ConnectorProvider,
    externalWorkspaceId: string,
  ): Promise<string[]> {
    const workspaceId = asString(externalWorkspaceId);
    if (!workspaceId) return [];

    const delegate = (prisma as any)?.connectorIdentityMap;
    if (!delegate || typeof delegate.findMany !== "function") return [];

    const rows = (await delegate.findMany({
      where: { provider, externalWorkspaceId: workspaceId },
      select: { userId: true },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    })) as Array<{ userId?: unknown }>;

    return Array.from(
      new Set(rows.map((row) => asString(row?.userId)).filter(Boolean)),
    ) as string[];
  }
}

export default ConnectorIdentityMapService;
