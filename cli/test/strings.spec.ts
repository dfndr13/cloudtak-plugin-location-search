import { describe, expect, it } from "vitest";
import { encodeStringTable, decodeStringTable, StringInterner } from "../src/pack/strings.ts";

describe("string table codec", () => {
    it("round-trips a list of strings", () => {
        const values = ["", "N MAIN ST", "S OAK AVE", "unicode: café"];
        const decoded = decodeStringTable(encodeStringTable(values));
        expect(decoded).toEqual(values);
    });

    it("round-trips an empty table", () => {
        expect(decodeStringTable(encodeStringTable([]))).toEqual([]);
    });

    it("round-trips through a byte-offset-shifted buffer (alignment guard)", () => {
        const values = ["A", "BB", "CCC"];
        const encoded = encodeStringTable(values);
        // Simulate an unaligned slice, as a naive subarray of a larger file buffer would produce.
        const padded = Buffer.concat([Buffer.alloc(3), encoded]);
        const shifted = padded.subarray(3);
        expect(shifted.byteOffset % 4).not.toBe(0);
        expect(decodeStringTable(shifted)).toEqual(values);
    });
});

describe("StringInterner", () => {
    it("assigns stable ids and dedupes", () => {
        const interner = new StringInterner();
        expect(interner.intern("a")).toBe(0);
        expect(interner.intern("b")).toBe(1);
        expect(interner.intern("a")).toBe(0);
        expect(interner.size).toBe(2);
        expect(interner.toArray()).toEqual(["a", "b"]);
    });
});
