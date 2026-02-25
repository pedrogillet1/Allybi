/* eslint-disable no-console */
import * as fs from "fs";
import * as path from "path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");

type Assertion = {
  label: string;
  ok: boolean;
};

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function has(pattern: RegExp, text: string): boolean {
  return pattern.test(text);
}

function resolveChatRoutesPath(initialPath: string): string {
  if (!fs.existsSync(initialPath)) return initialPath;
  const source = read(initialPath);
  const reexport = source.match(
    /export\s+\{\s*default\s*\}\s+from\s+["'](.+)["'];?/,
  );
  if (!reexport?.[1]) return initialPath;
  const base = path.resolve(path.dirname(initialPath), reexport[1]);
  if (fs.existsSync(base)) return base;
  if (fs.existsSync(`${base}.ts`)) return `${base}.ts`;
  return initialPath;
}

function run(): void {
  const assertions: Assertion[] = [];
  const chatRoutesPath = resolveChatRoutesPath(
    path.join(root, "src", "routes", "chat.routes.ts"),
  );
  const chatServicePath = path.join(root, "src", "services", "prismaChat.service.ts");

  assertions.push({
    label: "chat.routes.ts exists",
    ok: fs.existsSync(chatRoutesPath),
  });
  assertions.push({
    label: "prismaChat.service.ts exists",
    ok: fs.existsSync(chatServicePath),
  });

  if (!assertions.every((a) => a.ok)) {
    assertions.forEach((a) => console.error(`${a.ok ? "OK" : "FAIL"}: ${a.label}`));
    process.exit(1);
  }

  const chatRoutes = read(chatRoutesPath);
  const chatService = read(chatServicePath);

  // Conversation CRUD routes must exist.
  assertions.push({
    label: "list conversations route exists",
    ok: has(/router\.get\(\s*["']\/conversations["']/, chatRoutes),
  });
  assertions.push({
    label: "create conversation route exists",
    ok: has(/router\.post\(\s*["']\/conversations["']/, chatRoutes),
  });
  assertions.push({
    label: "get conversation route exists",
    ok: has(/router\.get\(\s*["']\/conversations\/:conversationId["']/, chatRoutes),
  });
  assertions.push({
    label: "delete conversation route exists",
    ok: has(/router\.delete\(\s*["']\/conversations\/:conversationId["']/, chatRoutes),
  });

  // Ensure routes return normalized envelopes for conversation APIs.
  assertions.push({
    label: "list route returns ok/data envelope",
    ok:
      has(/res\.json\(\{\s*ok:\s*true,\s*data:\s*\{\s*conversations\s*\}\s*\}\)/, chatRoutes) ||
      has(/toChatHttpEnvelope\(/, chatRoutes),
  });
  assertions.push({
    label: "create route returns ok/data envelope",
    ok:
      has(/res\.status\(201\)\.json\(\{\s*ok:\s*true,\s*data:\s*conv\s*\}\)/, chatRoutes) ||
      has(/toChatHttpEnvelope\(/, chatRoutes),
  });
  assertions.push({
    label: "get route returns ok/data envelope",
    ok:
      has(/res\.json\(\{\s*ok:\s*true,\s*data:\s*\{[\s\S]*messages:/, chatRoutes) ||
      has(/toChatHttpEnvelope\(/, chatRoutes),
  });

  // Prisma chat service must support multi-conversation behavior.
  assertions.push({
    label: "service has listConversations",
    ok: has(/\blistConversations\s*\(/, chatService),
  });
  assertions.push({
    label: "service has createConversation",
    ok: has(/\bcreateConversation\s*\(/, chatService),
  });
  assertions.push({
    label: "service has getConversationWithMessages",
    ok: has(/\bgetConversationWithMessages\s*\(/, chatService),
  });

  const failed = assertions.filter((a) => !a.ok);
  assertions.forEach((a) => console.log(`${a.ok ? "OK" : "FAIL"}: ${a.label}`));

  if (failed.length) {
    console.error(`[conversation-flow] failed ${failed.length} assertion(s)`);
    process.exit(1);
  }

  console.log(`[conversation-flow] ${quick ? "quick" : "full"} checks passed (${assertions.length} assertions)`);
}

run();
