# Virtual Room contracts

Version `1.0.0` includes the OpenAPI document, WebSocket message schema, room definition, and REST/WebSocket fixtures. Web and Web Admin should install the same package artifact built from the reviewed API revision and commit its lockfile entry.

Build the package from the API repository root with `pnpm --dir packages/contracts pack`. Pin the resulting tarball with `pnpm add --save-exact /path/to/test-workflow-virtual-room-contracts-1.0.0.tgz`.

| Package export | Content |
| --- | --- |
| `@test-workflow/virtual-room-contracts/openapi` | REST API v1 |
| `@test-workflow/virtual-room-contracts/websocket` | WebSocket JSON Schema |
| `@test-workflow/virtual-room-contracts/room` | Shared room and catalog |
| `@test-workflow/virtual-room-contracts/fixtures/rest` | REST request and response examples |
| `@test-workflow/virtual-room-contracts/fixtures/websocket` | WebSocket message examples |
