# Hosting `.pack` files for the fetch-from-URL load path

**Required for any shared/production CloudTAK instance** — see the main
[README's setup walkthrough](../README.md#4-host-the-pack-file-required-for-more-than-one-user)
for why. Address data lives in each browser's own local IndexedDB, never on a server, so there is
no way for one person's file-picker upload to reach anyone else. The gear panel's "Load from URL"
field (`lib/storage/upload.ts`'s `loadFromUrl`) is the only path that lets everyone get the same
data without you handing each person the `.pack` file directly — and that only works once
something is actually serving it over HTTP.

This works with **any** reachable static host — it doesn't need to be CloudTAK-specific, and per
decision #14 nothing about it requires touching CloudTAK itself.

Two things that were ruled out, and why (see the Phase 3 planning discussion for the full
reasoning): `api/web/plugins/<name>/` can't serve raw files — Vite bundles everything there as JS
source, not static passthrough. `api/web/public/` technically could (Vite copies it verbatim to
the served dist), but it's **git-tracked** in most CloudTAK forks, so a 40–200MB binary there would
bloat that repo's history.

## Recommended: a plain static-file-server container

A minimal, dependency-free container in whatever stack you run CloudTAK in — nginx, or something
even simpler like [`halverneus/static-file-server`](https://github.com/halverneus/static-file-server),
serving a directory of `.pack` files:

```yaml
# docker-compose.yml (illustrative — merge into your existing stack)
services:
  address-packs:
    image: halverneus/static-file-server:latest
    ports:
      - "8081:8080"
    volumes:
      - ./data/address-packs:/web
    environment:
      CORS: "true"
```

Drop `az-statewide.pack` (or whatever regions you need) into `./data/address-packs/`, and it's
reachable at `http://<host>:8081/az-statewide.pack`.

## The part that actually matters: CORS

The browser fetch in `loadFromUrl` runs from CloudTAK's own origin, so the static host **must**
send `Access-Control-Allow-Origin` covering that origin (or `*`, if the files aren't sensitive —
they're derived from public OpenAddresses data, so `*` is reasonable here). Without it, the
fetch fails silently-ish with a CORS error in the console, not a clean HTTP error — this is
exactly the "CORS spike" PLAN.md's Phase 0 flagged as outstanding, now resolved by testing against
a real mocked host in `test/upload.spec.ts` and documented here for the real deployment case.

`halverneus/static-file-server`'s `CORS: "true"` environment variable sends a permissive
`Access-Control-Allow-Origin: *`. If you use plain nginx instead, add:

```nginx
location /address-packs/ {
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS";
    add_header Access-Control-Allow-Headers "Range";
}
```

`Range` matters specifically: `loadFromUrl` probes for `Range` support (HTTP 206) on the first
request so section reads stay small and constant-memory, per PLAN.md §3.5. Most static file
servers (nginx included) support `Range` requests out of the box for static files — just make sure
CORS headers don't strip the `Range` request header or the `Content-Range`/`Accept-Ranges`
response headers, which some default CORS configs do by only allowlisting a narrow header set.
