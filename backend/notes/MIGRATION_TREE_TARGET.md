# Migration Tree Target

Target folder structure after full migration (`tree -L 4`):

```
src/
├── app/                          # Composition root & entrypoints
│   ├── http/                     # Express app, route registration
│   │   └── index.ts
│   ├── workers/                  # BullMQ worker entrypoints
│   │   └── index.ts
│   └── index.ts
├── modules/                      # Vertical feature slices
│   ├── chat/                     # Chat / conversation module
│   │   ├── api/                  # (existing) API types
│   │   ├── application/          # (existing) use-cases
│   │   ├── domain/               # (existing) contracts, types
│   │   ├── runtime/              # (existing) orchestrator, delegate
│   │   ├── infra/                # Prisma repos, external adapters
│   │   ├── http/                 # Route handlers, middleware
│   │   └── index.ts
│   ├── retrieval/                # RAG / search module
│   │   ├── application/          # Retrieval engine, ranker, source buttons
│   │   ├── infra/                # Prisma adapters, vector store
│   │   ├── http/                 # Route handlers
│   │   └── index.ts
│   ├── documents/                # Document processing module
│   │   ├── application/          # Parsing, chunking, ingestion
│   │   ├── infra/                # Storage adapters, worker jobs
│   │   ├── http/                 # Upload routes
│   │   └── index.ts
│   ├── editing/                  # DOCX/XLSX editing module
│   │   ├── application/          # Edit handler, intent runtime
│   │   ├── infra/                # File I/O, patch appliers
│   │   ├── http/                 # Edit routes
│   │   └── index.ts
│   └── domain/                   # Cross-cutting domain logic
│       ├── application/          # Domain pack loader, scope service
│       ├── infra/                # Domain store adapters
│       └── index.ts
├── shared/                       # Pure utilities (no business logic)
│   ├── contracts/                # (existing)
│   ├── errors/                   # (existing)
│   ├── logging/                  # (existing)
│   ├── testkit/                  # (existing)
│   ├── text/                     # (existing)
│   ├── types/                    # (existing)
│   ├── utils/                    # (existing)
│   ├── validation/               # (existing)
│   └── index.ts
├── platform/                     # Infrastructure adapters (DB, LLM, queue, etc.)
│   ├── config/                   # (existing)
│   ├── db/                       # (existing)
│   ├── llm/                      # (existing)
│   ├── observability/            # (existing)
│   ├── queue/                    # (existing)
│   ├── security/                 # (existing)
│   ├── storage/                  # (existing)
│   └── index.ts
└── data_banks/                   # JSON-driven configuration (unchanged)
```

## Dependency rules

```
app/ → modules/* → shared/, platform/
modules/* → shared/, platform/
platform/ → shared/
shared/ → (nothing)
```

Modules MUST NOT import from each other directly; cross-module
communication goes through contracts defined in `shared/contracts/`.

## Migration phases

1. **Scaffold** (this commit) — create directories + empty barrels
2. **shared/** — move remaining utils/types into shared subfolders
3. **platform/** — move LLM, DB, queue adapters
4. **modules/** — move services into vertical slices
5. **app/** — move server.ts, route registration, worker entrypoints
6. **Cleanup** — remove old empty directories, update tsconfig paths
