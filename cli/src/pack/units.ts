import { StringInterner } from "./strings.ts";

/** Shared sparse string table for unit strings. Id 0 is always "" (no unit). */
export function buildUnitInterner(): StringInterner {
    const interner = new StringInterner();
    interner.intern(""); // id 0 = no unit
    return interner;
}
