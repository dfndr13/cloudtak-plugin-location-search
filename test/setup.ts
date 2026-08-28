// Polyfills `indexedDB`/`IDBKeyRange` globals for lib/storage/'s tests — Node has no native
// IndexedDB. Only ever loaded by vitest (see vitest.config.ts's `setupFiles`); lib/storage/
// itself has no dependency on this package, real or otherwise.
import "fake-indexeddb/auto";
