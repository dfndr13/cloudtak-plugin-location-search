# Graph Report - cloudtak-plugin-address-search  (2026-10-26)

## Corpus Check
- 111 files · ~52,402 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .ndjson 1)

## Summary
- 764 nodes · 1884 edges · 40 communities (34 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 61 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8ec206ec`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- search-index.ts
- upload.ts
- gazetteer-index.ts
- gnis.ts
- lib/pack/trigrams.ts
- AddressSearchBar.vue
- AddressSearchGear.vue
- src/pack/chunks.ts
- index.ts
- cli/package.json
- gazetteer-container-roundtrip.spec.ts
- state.ts
- build.ts
- package.json
- src/pack/cells.ts
- core-bridge.ts
- Pack format
- compilerOptions
- gazetteer.ts
- compilerOptions
- AddressSearchDropPrompt.vue
- src/index.ts
- CloudTAK Address Search — Plan
- public-pack-index.spec.ts
- cross-plugin-api.d.ts
- Setup, step by step
- 8. CloudTAK facts — verified from source
- 3. Data model
- Address Search updates
- cloudtak-plugin-address-search
- Hosting `.pack` files for the fetch-from-URL load path
- cloudtak-plugin-address-search
- Cross-plugin API
- 9. Decisions needed before Phase 1
- check-like-docker.sh
- vite-worker-url.d.ts

## God Nodes (most connected - your core abstractions)
1. `buildPack()` - 23 edges
2. `SearchIndex` - 21 edges
3. `PackSource` - 19 edges
4. `listDatasets()` - 19 edges
5. `buildGazetteerPack()` - 18 edges
6. `PackManifest` - 18 edges
7. `syncManifestKv()` - 17 edges
8. `SearchResult` - 17 edges
9. `loadFromUrl()` - 16 edges
10. `GazetteerIndex` - 15 edges

## Surprising Connections (you probably didn't know these)
- `10. Risks` --references--> `main()`  [INFERRED]
  docs/PLAN.md → bench/run.ts
- `Status` --references--> `AddressSearchResult`  [INFERRED]
  CHANGELOG.md → docs/cross-plugin-api.d.ts
- `Alternative: a separate static-file-server container` --references--> `loadFromUrl()`  [INFERRED]
  docs/HOSTING.md → lib/storage/upload.ts
- `8. CloudTAK facts — verified from source` --references--> `main()`  [INFERRED]
  docs/PLAN.md → bench/run.ts
- `8.2 Plugin surface (`api/web/plugin.ts`)` --references--> `feature()`  [INFERRED]
  docs/PLAN.md → cli/test/normalize.spec.ts

## Import Cycles
- None detected.

## Communities (40 total, 6 thin omitted)

### Community 0 - "search-index.ts"
Cohesion: 0.05
Nodes (57): Layout, Status, dropMarker(), DropMarkerOptions, decodeCellList(), PackSource, DecodedChunkRow, DecodedGroup (+49 more)

### Community 1 - "upload.ts"
Cohesion: 0.05
Nodes (72): AddressSearchManifest, AddressSearchManifestDataset, verifySection(), GazetteerManifest, PackManifest, BUNDLED_PACK_INDEX_PATH, bundledPackPath(), BundledSyncFailure (+64 more)

### Community 2 - "gazetteer-index.ts"
Cohesion: 0.10
Nodes (33): main(), bench(), mutateTypo(), percentile(), sampleAddresses(), SampledAddress, readI32Array(), readU32() (+25 more)

### Community 3 - "gnis.ts"
Cohesion: 0.09
Nodes (34): ColumnIndex, DEFAULT_GAZETTEER_CLASSES, FIELD_ALIASES, ParsedGnisLine, parseGnisFile(), parseGnisFiles(), resolveColumns(), dedupeKey() (+26 more)

### Community 4 - "lib/pack/trigrams.ts"
Cohesion: 0.13
Nodes (21): buildTrigramPostings(), decodeTrigramPostings(), encodeTrigramPostings(), CHAR_TO_CODE, codeOf(), packTrigram(), TRIGRAM_ALPHABET, trigramsOf() (+13 more)

### Community 5 - "AddressSearchBar.vue"
Cohesion: 0.09
Nodes (24): armReverseLookup(), datasets, defaultLoadError, defaultLoading, defaultPack, defaultProgress, disarmReverseLookup(), dropOpenIndex (+16 more)

### Community 6 - "AddressSearchGear.vue"
Cohesion: 0.10
Nodes (24): apiKeyProvider, apiKeyValue, datasets, defaultLabelInput, defaultPack, defaultUrlInput, errorMessage, loading (+16 more)

### Community 7 - "src/pack/chunks.ts"
Cohesion: 0.14
Nodes (17): ensureAligned(), buildChunks(), ChunkBuildResult, decodeChunk(), DecodedChunkRow, EncodedChunk, GroupPlacement, toE7() (+9 more)

### Community 8 - "index.ts"
Cohesion: 0.15
Nodes (14): feature(), 8.2 Plugin surface (`api/web/plugin.ts`), AddressSearchPlugin, idleBundledLoad, loadBundledPacks(), toPublicResult(), absolutePackUrl(), deleteManifestKv() (+6 more)

### Community 9 - "cli/package.json"
Cohesion: 0.09
Nodes (21): bin, cloudtak-address-pack, comment, dependencies, commander, description, devDependencies, @types/node (+13 more)

### Community 10 - "gazetteer-container-roundtrip.spec.ts"
Cohesion: 0.17
Nodes (18): assemble(), KNOWN_VERSIONS, readGazetteerManifest(), readManifestRaw(), readPackManifest(), readSection(), sha256(), writeGazetteerPack() (+10 more)

### Community 11 - "state.ts"
Cohesion: 0.13
Nodes (15): selectResult(), featsForShare, props, anchor, closestFixedAncestor(), coreControlStack(), reposition(), shellRef (+7 more)

### Community 12 - "build.ts"
Cohesion: 0.20
Nodes (16): BuildOptions, buildPack(), BuildResult, CellEntry, getSection(), buildGroups(), DecodedGroup, encodeGroups() (+8 more)

### Community 13 - "package.json"
Cohesion: 0.10
Nodes (20): comment, description, devDependencies, fake-indexeddb, @types/node, typescript, vitest, @types/node (+12 more)

### Community 14 - "src/pack/cells.ts"
Cohesion: 0.25
Nodes (14): buildCellIndex(), CellIndex, decodeCellDir(), decodeCellList(), encodeCellLists(), decodeVarint(), encodeVarint(), cellKeyOf() (+6 more)

### Community 15 - "core-bridge.ts"
Cohesion: 0.12
Nodes (10): DefaultPackConfig, DroppedFeature, isCoreDrawActive(), LocationStateMirror, Disabled, Live, Loading, Preset (+2 more)

### Community 16 - "Pack format"
Cohesion: 0.12
Nodes (16): `cellDir` / `cellLists` (reverse index, PLAN.md §4.2), `chunks` (`kind: "address-chunk-v1"`, one section per chunk, id `chunk:<n>`), Container, Gazetteer container (version 2), `gnCellDir` / `gnCellLists` (reverse index), `gnClasses` / `gnPlaces` (`kind: "string-table"`), `gnNames` / `gnNamesDisplay` (`kind: "string-table"`), `gnRecords` (`kind: "gazetteer-chunk-v1"`, one section per chunk, id `gnChunk:<n>`) (+8 more)

### Community 17 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmit (+7 more)

### Community 18 - "gazetteer.ts"
Cohesion: 0.21
Nodes (12): dedupeGazetteerKey(), ParseGnisOptions, encodeCellDir(), SectionInput, buildGazetteerPack(), buildNameTable(), buildGazetteerChunks(), DecodedGazetteerRow (+4 more)

### Community 19 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmit (+6 more)

### Community 20 - "AddressSearchDropPrompt.vue"
Cohesion: 0.19
Nodes (14): callsign, drop(), emit, errorMessage, flyToResult(), keepLocal(), KNOWN_POINT_TYPES, POINT_TYPE_OPTIONS (+6 more)

### Community 21 - "src/index.ts"
Cohesion: 0.26
Nodes (10): fmtBytes(), fmtMs(), printGazetteerReport(), printReport(), program, BuildStats, GazetteerBuildStats, DEFAULT_CELL_SIZE_DEG (+2 more)

### Community 22 - "CloudTAK Address Search — Plan"
Cohesion: 0.20
Nodes (10): 10. Risks, 1. Locked decisions, 2. Why the offline prep step, 4.1 Forward — address to point, 4.2 Reverse lookup — address at a point, 4. Search algorithm, 5. Storage and the iOS constraint, 6. Cross-plugin contract (+2 more)

### Community 23 - "public-pack-index.spec.ts"
Cohesion: 0.33
Nodes (4): isBundledPackHeader(), resolveWebRoot(), writePublicPackIndex(), dirs

### Community 24 - "cross-plugin-api.d.ts"
Cohesion: 0.25
Nodes (5): AddressSearchApi, AddressSearchManifest, AddressSearchManifestDataset, AddressSearchResult, Window

### Community 25 - "Setup, step by step"
Cohesion: 0.25
Nodes (8): 1. Get OpenAddresses data, 2. Build a `.pack` file, 3. Install the plugin into CloudTAK, 4. Host the `.pack` file (required for more than one user), 5. Load the data, Baked-in packs, Optional: place-name (gazetteer) data, from USGS GNIS, Setup, step by step

### Community 26 - "8. CloudTAK facts — verified from source"
Cohesion: 0.29
Nodes (7): 8.1 Plugin discovery and install, 8.3 Button placement, 8.4 `db.kv` — string values only, 8.5 Map and marker — persistence and distribution are separate, 8.6 GPS for ranking, 8.7 Available dependencies (`api/web/package.json`), 8. CloudTAK facts — verified from source

### Community 27 - "3. Data model"
Cohesion: 0.33
Nodes (6): 3.1 Source fields, 3.2 Normalization (CLI, once), 3.3 The hierarchy that makes this fast, 3.4 Address row encoding, 3.5 Pack container, 3. Data model

### Community 28 - "Address Search updates"
Cohesion: 0.33
Nodes (5): Address Search updates, After a later CloudTAK update, First deploy, This change, Verify

### Community 30 - "cloudtak-plugin-address-search"
Cohesion: 0.40
Nodes (5): cloudtak-plugin-address-search, Install and verify against CloudTAK, Plan status, Real data, Usage

### Community 31 - "Hosting `.pack` files for the fetch-from-URL load path"
Cohesion: 0.40
Nodes (4): Alternative: a separate static-file-server container, Hosting `.pack` files for the fetch-from-URL load path, Image build: `public/address-search`, Recommended: serve it directly from your own CloudTAK deployment

### Community 32 - "cloudtak-plugin-address-search"
Cohesion: 0.40
Nodes (5): cloudtak-plugin-address-search, Cross-plugin API, Real-data verification, Verifying a change, What's not built

### Community 33 - "Cross-plugin API"
Cohesion: 0.50
Nodes (4): Actually searching or geocoding, Cross-plugin API, Knowing what's loaded, without calling into the plugin, Why a `window` global, not something else

### Community 34 - "9. Decisions needed before Phase 1"
Cohesion: 0.50
Nodes (4): 9.1 Import style — resolved, 9.2 Online fallback — settled shape, 9.3 Remaining choices, 9. Decisions needed before Phase 1

## Knowledge Gaps
- **11 isolated node(s):** `@types/node`, `typescript`, `vitest`, `Loading`, `Disabled` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 282 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cloudtak-plugin-address-search` connect `cloudtak-plugin-address-search` to `search-index.ts`, `Setup, step by step`, `PLAN.md`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `SearchIndex` (e.g. with `Layout` and `Status`) actually correct?**
  _`SearchIndex` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/node`, `typescript`, `vitest` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `search-index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.052028732284993204 - nodes in this community are weakly interconnected._
- **Why does `commander` connect `src/index.ts` to `cli/package.json`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `PackSource` (e.g. with `Layout` and `Architecture`) actually correct?**
  _`PackSource` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `upload.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.053267326732673266 - nodes in this community are weakly interconnected._