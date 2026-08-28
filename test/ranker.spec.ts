import { describe, expect, it } from "vitest";
import { rankGroups, type StreetMatch } from "../lib/search/ranker.ts";
import type { DecodedGroup } from "../lib/pack/types.ts";

function group(overrides: Partial<DecodedGroup>): DecodedGroup {
    return {
        streetId: 0,
        placeId: 0,
        postcodeId: 0,
        centroidLatE7: 334150000,
        centroidLonE7: -1118450000,
        chunkId: 0,
        rowOffset: 0,
        rowCount: 1,
        ...overrides,
    };
}

const PLACES = ["", "Mesa", "Chandler", "85201", "85224"];

describe("rankGroups", () => {
    it("ranks an exact street match above a fuzzy one", () => {
        const groups = [group({ streetId: 0 }), group({ streetId: 1 })];
        const matches: StreetMatch[] = [
            { streetId: 1, tier: "fuzzy", editDistance: 1 },
            { streetId: 0, tier: "exact", editDistance: 0 },
        ];
        const ranked = rankGroups(groups, matches, { places: PLACES, placeHint: null, postcodeHint: null, limit: 10 });
        expect(ranked[0]!.streetMatch.tier).toBe("exact");
    });

    it("filters by place hint", () => {
        const groups = [group({ streetId: 0, placeId: 1 }), group({ streetId: 0, placeId: 2 })];
        const matches: StreetMatch[] = [{ streetId: 0, tier: "exact", editDistance: 0 }];
        const ranked = rankGroups(groups, matches, { places: PLACES, placeHint: "Chandler", postcodeHint: null, limit: 10 });
        expect(ranked).toHaveLength(1);
        expect(ranked[0]!.group.placeId).toBe(2);
    });

    it("filters by postcode hint", () => {
        const groups = [group({ streetId: 0, postcodeId: 3 }), group({ streetId: 0, postcodeId: 4 })];
        const matches: StreetMatch[] = [{ streetId: 0, tier: "exact", editDistance: 0 }];
        const ranked = rankGroups(groups, matches, { places: PLACES, placeHint: null, postcodeHint: "85224", limit: 10 });
        expect(ranked).toHaveLength(1);
        expect(ranked[0]!.group.postcodeId).toBe(4);
    });

    it("ranks closer groups first when tiers are equal", () => {
        const near = group({ streetId: 0, centroidLatE7: 334150000, centroidLonE7: -1118450000 });
        const far = group({ streetId: 0, centroidLatE7: 400000000, centroidLonE7: -1000000000 });
        const matches: StreetMatch[] = [{ streetId: 0, tier: "exact", editDistance: 0 }];
        const ranked = rankGroups([far, near], matches, {
            places: PLACES,
            placeHint: null,
            postcodeHint: null,
            reference: { lat: 33.415, lon: -111.845 },
            limit: 10,
        });
        expect(ranked[0]).toBe(ranked.find((r) => r.group === near));
    });

    it("respects the limit", () => {
        const groups = Array.from({ length: 5 }, () => group({ streetId: 0 }));
        const matches: StreetMatch[] = [{ streetId: 0, tier: "exact", editDistance: 0 }];
        const ranked = rankGroups(groups, matches, { places: PLACES, placeHint: null, postcodeHint: null, limit: 2 });
        expect(ranked).toHaveLength(2);
    });
});
