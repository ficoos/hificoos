Execution Plan: Migrate DAL from SharedWorker to Dedicated Web Worker + tab-election (Hub/Spoke)

1.  Current state (what we're replacing)

┌────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ File │ Role │ Notes │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ src/lib/database_worker.ts │ SharedWorker script. Loads sqlite-wasm, opens hificoos.sqlite3 with the opfs backend, │ Fails because navigator.storage (OPFS) is unavailable in a SharedWorker. deleteOpfsFile() also uses │
│ │ runs Kysely (SqliteDriver/SqliteConnection), handles a SYNC command per MessagePort, │ navigator.storage.getDirectory(). │
│ │ READY handshake via 50 ms polling │ │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ src/lib/database.svelte.ts │ DAL class wrapping the SharedWorker (import ... from './database_worker?sharedworker') │ Half-wired: handleResponse only console.logs, never resolves pendingRequests; syncDB() sends no credentials though the worker │
│ │ │ expects payload.credentials. Also contains dead code at the bottom (an experimental navigator.locks.request('sqlite_db_leader', │
│ │ │ ...) referencing a non-existent my-sqlite-worker.js) that runs on import. │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ src/routes/+page.svelte │ let dal: DAL = new DAL() + Sync button │ Instantiated unconditionally — would also throw during SSR (no browser guard, no ssr = false). │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ src/lib/database_types.ts │ Kysely Database type + SQL schema generation │ Broken for fresh-DB init (see Phase 0). │
├────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ vite.config.ts │ Already has worker: { format: 'es' }, optimizeDeps.exclude: ['@sqlite.org/sqlite-wasm'], │ No changes needed, possibly none at all. │
│ │ COOP/COEP headers │ │
└────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

2.  Target architecture

One dedicated worker per tab. Each worker runs a Hub (from tab-election/hub). tab-election's Tab core elects exactly one leader across all tabs using the Locks API (lock name hub/hificoos-db/<version>) + BroadcastChannel. Only the leader's worker ever
loads the WASM module or opens the OPFS database; followers stay idle and forward RPCs to the leader automatically. Each tab's Spoke exposes a typed service stub, so the UI code is identical whether its tab is the leader or not — that's the abstraction we
want.

```
  Tab A (UI)                          Tab B (UI)
    │ DAL (Spoke)                      │ DAL (Spoke)
    ▼                                  ▼
  Worker A: Hub ◄── BroadcastChannel (tab-election) ──► Worker B: Hub
    │  LEADER: sqlite-wasm + OPFS db, Kysely, sync     FOLLOWER: idle,
    ▼                                                  forwards RPCs
  OPFS: hificoos.sqlite3
```

Mechanics (verified against the library source):

- new Hub(initialize, name, version) inside the worker. On leadership win: initialize(hub) runs → hub.register(...) services get service.init(hub) called → services are exposed as the callable API (namespace.method). Heartbeats every 2 s.
- new Spoke({ workerUrl, name, version }) in the tab. Default (useSharedWorker: false) creates new Worker(url, { type: 'module', name: 'name:version' }) per tab. spoke.getService<DatabaseService>('db') returns a typed proxy; calls go through Tab.call,  
  which routes to the leader if this tab isn't it.
- Free robustness we get: leader crash → lock released → another tab's waiting worker takes over; leader wedge → spoke heartbeat monitoring (5–10 s checks) + per-method call-stall detection auto-respawns the worker with backoff (onRecovery /
  onRecoveryFailed hooks); late-joining tabs fetch current state from the leader.
- At-least-once delivery: calls in-flight during a leader handoff are re-delivered to the successor → service handlers must be idempotent (ours already is: full replace inside one transaction).

### Three library gotchas that drive design decisions (all verified in source)

1.  tab.send/hub.emit do NOT loop back to the sender (_isToMe(to, sending=true) is false for To.Others). So the leader's own tab never receives service events it emitted. Decision: carry sync progress in leader state — hub.updateState({ sync: ... }) —  
    which IS applied locally on the leader and broadcast to others. Client listens with spoke.onState(state => state.sync). (This matches the library's own README recommendation: use state() to let tabs know the leader is syncing.)
2.  Tab.call times out after 30 s by default (callTimeout in SpokeOptions). A full Navidrome sync will exceed this. Decision: set callTimeout high on the Spoke (e.g. 30 * 60 * 1000) and keep sync() as a single awaitable RPC; progress streams via state.  
    (Alternative considered: fire-and-forget startSync() + await state completion — more moving parts, no benefit since the leader keeps syncing even if the caller tab dies.)
3.  sqlite-wasm locates sqlite3.wasm via new URL('sqlite3.wasm', import.meta.url) — which breaks once Vite bundles the worker into a single file. It supports Module.locateFile(path) override (sqlite3InitModule({ locateFile }), verified in dist/index.mjs  
    line ~310). Decision: import the wasm as an asset URL and pass locateFile.

4.  Phased execution

### Phase 0 — Prerequisite fixes (small, in existing files; required for the new path to work at all)

1.  Fix schema generation in src/lib/database_types.ts (fresh-DB init currently throws, which wedges worker startup):
    - generateSchema() concatenates the version INSERT as a plain string, so SQL contains the literal text ${SCHEMA_VERSION} → syntax error. Make it a template literal (or a separate statement) and use the real value.
    - generateSchemaBase() pushes column definitions without commas between fields → CREATE TABLE syntax error. Add commas.
    - Inverted nullability: ${field.isNullable ? 'NOT NULL' : ''} should be ? '' : 'NOT NULL'.
    - Version mismatch: worker compares CURRENT_SCHEMA_VERSION = 1 (number) against a stored value that would be the md5 hex SCHEMA_VERSION from database_types.ts. Consolidate to a single exported numeric SCHEMA_VERSION = 1 used by both the schema  
      generator and the worker's check.
    - schema.sql is dead/contradictory (table names artists/albums/songs, invalid ${...}) — delete it (nothing imports it).
2.  SSR guard: the DAL must not construct workers/BroadcastChannel on the server. Either export const ssr = false (or csr = true) from the route that uses the DAL, or (preferred) guard construction with browser from $app/environment. Applies to  
    +page.svelte and the DAL.
3.  Remove the dead navigator.locks block at the bottom of database.svelte.ts (it runs at import time and spawns a 404'ing worker).
4.  Credentials flow: syncDB() currently sends nothing while the worker expects credentials. Define the contract as sync(credentials: Credentials), sourced from getCredentials() in auth.svelte.ts.

### Phase 1 — Add the dependency

```
  npm install tab-election          # v4.6.2, ESM, dual entry: 'tab-election' + 'tab-election/hub'
```

### Phase 2 — Build the Hub worker (the new DAL server side)

New directory src/lib/db/:

src/lib/db/database-service.ts — the service class (pure, no worker globals, unit-testable):

```ts
  import { type Service, type Hub } from 'tab-election/hub';

  interface DbEvents { 'sync-complete': { ok: boolean; error?: string }; } // reserved; state is primary

  export class DatabaseService implements Service {
    readonly namespace = 'db' as const;
    readonly __events?: DbEvents;               // phantom, for typed stubs
    private sqlite3?: Sqlite3Static;
    private kysely?: Kysely<Database>;
    private hub?: Hub;
    private syncRunning = false;

    async init(hub: Hub) {
      // ONLY RUNS ON THE LEADER — this is the whole point of the migration.
      this.hub = hub;
      this.sqlite3 = await sqlite3InitModule({ locateFile: () => wasmUrl });
      // openDB(name,'c','opfs'), check version, (re)init schema if mismatch,
      // build Kysely with the existing SqliteDriver/SqliteConnection (port from database_worker.ts)
      hub.updateState({ db: { ready: true } });
    }
    close() { this.kysely?.destroy(); }

    // RPC surface (public methods become `db.<name>` calls):
    async sync(credentials: Credentials): Promise<SyncResult> { /* ported from database_worker.ts */ }
    async getArtists(): Promise<Artist[]> { ... }
    async getAlbums(filter?): Promise<Album[]> { ... }
    async getSongs(filter?): Promise<Song[]> { ... }
    async getSyncStatus(): Promise<SyncUpdate | null> { ... }
  }
```

Porting notes for the move from database_worker.ts:

- Move SqliteConnection, SqliteDriver, the Kysely setup, openDB, checkDBVersion, initDB, deleteOpfsFile, and all sync* functions verbatim into this service (or small helpers beside it). openDB keeps new sqlite3.oo1.DB(DB_NAME, 'c', 'opfs') — this now  
  works because a dedicated worker has navigator.storage.
- sync(): keep the delete-all + re-insert-in-one-transaction shape (it's idempotent, which is exactly what tab-election's re-delivery needs). Replace the updateCallback closure with this.hub?.updateState({ sync: status }) after each batch — all tabs  
  (including the leader's) see progress via spoke.onState. Set state.sync to a final { isDone: true, ... } on success and { isDone: true, error } on failure; guard with syncRunning so a re-delivered duplicate while one is already in flight is rejected  
  ('sync already in progress') rather than double-run.
- Capability probe: if navigator.storage?.getDirectory is unavailable (old Firefox/Safari), set hub.updateState({ db: { ready: false, error: 'OPFS unavailable in this context' } }) and throw from init so spokes can surface a graceful message instead of  
  every call timing out.

src/lib/db/hub.worker.ts — tiny entry file (must be plain TS, not .svelte.ts):

```ts
  import { Hub } from 'tab-election/hub';
  import { DatabaseService } from './database-service';

  new Hub((hub) => {
    hub.register(new DatabaseService());
  }, 'hificoos-db', '1');   // name = lock/namespace, version = bump on breaking worker changes
```

Notes:

- No ctx.onconnect, no READY polling, no initializeDatabaseWorker() at module end — the Hub constructor starts leadership election itself (verified in hub.ts).
- Keep the existing /// <reference lib="webworker" />-style triple-slash header so TS gives worker globals.

### Phase 3 — Rewrite the client (src/lib/database.svelte.ts)

Replace the DAL class with a Spoke wrapper. Keep the filename/export so +page.svelte barely changes:

```ts
  import { browser } from '$app/environment';
  import { Spoke } from 'tab-election/hub';
  import HubWorkerUrl from '$lib/db/hub.worker?worker&url';   // Vite bundles it as an ESM worker, returns a URL string
  import { DatabaseService, type SyncUpdate } from '$lib/db/database-service';

  export class DAL {
    private spoke: Spoke | undefined;
    readonly db: ServiceStub<DatabaseService> | undefined;
    state = $state<{ ready: boolean; isLeader: boolean; sync?: SyncUpdate; error?: string }>({ ready: false, isLeader: false });

    constructor() {
      if (!browser) return;                       // SSR safety
      this.spoke = new Spoke({
        workerUrl: HubWorkerUrl,
        name: 'hificoos-db',
        version: '1',
        callTimeout: 30 * 60 * 1000,              // long syncs (gotcha #2)
      });
      this.db = this.spoke.getService<DatabaseService>('db');
      this.spoke.onState((s) => { this.state.ready = !!s.db?.ready; this.state.sync = s.sync; this.state.error = s.db?.error; });
      this.spoke.onLeaderChange((isLeader) => (this.state.isLeader = isLeader));
      this.spoke.onRecoveryFailed(({ attempts }) => (this.state.error = `DB worker recovery failed after ${attempts} attempts`));
    }

    syncDB(credentials = getCredentials()) { return this.db!.sync(credentials); }
    getArtists() { return this.db!.getArtists(); }
    // ... getAlbums, getSongs, getSyncStatus
    close() { this.spoke?.close(); }              // terminates this tab's dedicated worker
  }

  let instance: DAL | undefined;
  export function getDAL(): DAL { return (instance ??= new DAL()); }  // ONE spoke/worker per tab — singleton
```

Key points:

- ?worker&url is the load-bearing choice: it yields a URL string (what Spoke needs) and makes Vite bundle the worker graph (sqlite-wasm, kysely, tab-election) into one ESM worker file — compatible with tab-election's internal new Worker(url, { type:  
  'module' }) and the existing worker.format: 'es' config. (The new URL('./x.ts', import.meta.url) pattern won't work here because Vite can't see the new Worker call inside tab-election.)
- useSharedWorker stays at its default false — this is the dedicated-worker mode the migration is about.
- Use the $state object (project is forced runes mode) so the page can render dal.state.isLeader / dal.state.sync reactively without stores.
- Switch the page from new DAL() to getDAL() (or keep the class export for compatibility) and add the browser guard/ssr = false.

WASM asset (gotcha #3), in database-service.ts or the worker entry:

```ts
  import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url';   // package exports ./sqlite3.wasm
  await sqlite3InitModule({ locateFile: () => wasmUrl });
```

This emits sqlite3.wasm as a normal asset (not base64-inlined) and works in both dev and build.

### Phase 4 — Wire the page

src/routes/+page.svelte:

- import { getDAL } from '$lib/database.svelte' → const dal = getDAL();
- Sync button: dal.syncDB().catch(err => ...); render progress from dal.state.sync (artistsSynced/albumsSynced/songsSynced/isDone), leader badge from dal.state.isLeader, error from dal.state.error.
- Credentials come from getCredentials() (already in auth.svelte.ts).

### Phase 5 — Remove the old world

- Delete src/lib/database_worker.ts (SharedWorker) and src/lib/schema.sql.
- Delete the ?sharedworker import and the old pendingRequests/nextId/handleResponse plumbing (replaced by the typed stub).
- Keep src/lib/database_types.ts (Kysely Database type, SCHEMA, SCHEMA_VERSION — after Phase 0 fixes) as the shared contract imported by the service.
- Grep for leftovers: SharedWorker, ?sharedworker

### Phase 6 — Verification

Unit (existing vitest browser project, chromium):

- Spoke→Hub round-trip in one tab: getDAL().getArtists() resolves after a small sync() with fake data (or a seeded DB) — proves the worker bundle, wasm loading, and RPC path.
- Service-level: DatabaseService.sync idempotency (run twice, row counts stable), and the syncRunning guard.

Manual multi-tab matrix (the real point of the exercise:

1.  Single tab: fresh profile → sync → data present → hard reload → data still there (OPFS persistence in dedicated worker).
2.  Two tabs: sync in tab A; tab B reads the data (cross-tab RPC through the leader). Verify in tab B's console/state that isLeader === false and tab A true.
3.  Close the leader tab (A) while B is open → B's worker is elected, next read works, DB intact. (Watch the 2 s heartbeat stop then leadershipchange.)
4.  Sync from tab B while A is leader → progress visible in both tabs (validates the updateState/onState choice over emit).
5.  Reload the leader tab mid-sync → call re-delivered; sync either completes or restarts cleanly (idempotent) — no corruption, no stuck pending promise (or a clean Call timed out if you let it).
6.  Kill the leader worker (e.g. worker.terminate() via devtools / crash it) → spoke auto-recovery respawns it; onRecovery fires; app recovers.
7.  Mixed versions: temporarily bump version in one tab → observe version-mismatch behavior (library default: separate namespaces; no cross-talk).

Build checks: npm run check (svelte-check), npm run build, npm run test:unit; confirm sqlite3.wasm appears as an emitted asset in build/ and the worker chunk is self-contained ESM.

4.  Risks & mitigations (summary)

┌─────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐  
│ Risk │ Mitigation │  
├─────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
│ WASM 404 inside bundled worker │ ?url import + locateFile (Phase 2/3); verify in build, not just dev │  
├─────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
│ Long sync vs 30 s callTimeout │ callTimeout: 30 min on Spoke; progress via state so UI never depends on the call settling │  
├─────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
│ Duplicate sync after leader handoff (at-least-once) │ syncRunning guard + inherently idempotent transaction (delete-all/re-insert) │  
├─────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
│ Leader tab never sees its own emit() events │ Use updateState/onState for all progress (Phase 2 decision) │  
├─────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
│ Multiple new DAL() → multiple idle workers per tab │ getDAL() singleton (Phase 3) │  
├─────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
│ SSR crash on BroadcastChannel/Worker │ browser guard in constructor + ssr = false on the route │  
├─────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
│ OPFS still missing in some Firefox/Safari contexts │ Capability probe in init → state.error, graceful UI message instead of call timeouts │  
├─────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
│ Breaking worker protocol change with tabs open │ Bump version in new Hub(...) + Spoke options (separate election namespace; onVersionMismatch hook available) │  
└─────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

5.  Suggested commit sequence

1.  fix: schema generation + shared SCHEMA_VERSION (Phase 0)
1.  feat: db hub worker with DatabaseService (leader-only sqlite/OPFS) (Phase 1–2)
1.  feat: rewrite DAL as tab-election Spoke client (Phase 3–4)
1.  refactor: remove SharedWorker DAL (Phase 5)
1.  test: unit tests for service + DAL round-trip (Phase 6)

The end state: UI code calls dal.db.* exactly the same in every tab; one elected worker owns the OPFS-backed SQLite database; leader crashes, tab closes, and wedged workers are handled by tab-election's election + heartbeat/recovery machinery instead of the old  
SharedWorker's single point of failure.
