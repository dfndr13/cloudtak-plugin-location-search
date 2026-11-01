import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGeojsonPlaceFiles, polygonLabelPoint, fillTemplate, type ParseGeojsonPlacesOptions } from "../src/ingest/geojson-places.ts";
import type { NormalizedGazetteerRecord } from "../src/pack/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../fixtures/sample-parcels.geojson");

const OPTS: ParseGeojsonPlacesOptions = {
    nameTemplate: "WWR {name}",
    classTemplate: "Lot",
    countyTemplate: "APN {APN}",
    stateTemplate: "AZ",
    where: { OWNERORMAN: "Private" },
};

async function collect(): Promise<{ ok: NormalizedGazetteerRecord[]; dropped: string[] }> {
    const ok: NormalizedGazetteerRecord[] = [];
    const dropped: string[] = [];
    for await (const line of parseGeojsonPlaceFiles([FIXTURE], OPTS)) {
        if (line.ok) ok.push(line.record);
        else dropped.push(line.reason);
    }
    return { ok, dropped };
}

describe("GeoJSON places ingest", () => {
    it("keeps Private polygons and reports why every other feature was skipped", async () => {
        const { ok, dropped } = await collect();
        expect(ok.map((r) => r.nameDisplay)).toEqual(["WWR 101", "WWR 102", "WWR 104", "WWR 104"]);
        expect(dropped.sort()).toEqual(["blank-name", "filtered", "unsupported-geometry"]);
    });

    it("fills class/county/state templates from feature properties", async () => {
        const { ok } = await collect();
        expect(ok[0]).toMatchObject({ nameMatch: "WWR 101", featureClass: "Lot", county: "APN 1001", state: "AZ" });
    });

    it("places a square lot at its center", async () => {
        const { ok } = await collect();
        expect(ok[0]!.lon).toBeCloseTo(-111.995, 6);
        expect(ok[0]!.lat).toBeCloseTo(35.005, 6);
    });

    it("moves an L-shaped lot's off-shape centroid to a point inside the lot", async () => {
        const { ok } = await collect();
        const lot = ok[1]!;
        // The thin vertical leg is lon -112.0..-111.999; the thin horizontal leg is lat 35.02..35.021.
        const inVerticalLeg = lot.lon >= -112.0 && lot.lon <= -111.999 && lot.lat >= 35.02 && lot.lat <= 35.05;
        const inHorizontalLeg = lot.lat >= 35.02 && lot.lat <= 35.021 && lot.lon >= -112.0 && lot.lon <= -111.97;
        expect(inVerticalLeg || inHorizontalLeg).toBe(true);
    });

    it("weights a MultiPolygon's centroid across its parts", async () => {
        const { ok } = await collect();
        // Two equal squares centered at -112.195 and -112.175: area centroid is between them,
        // which falls in the gap, so it is pulled into one of the parts.
        const lot = ok[2]!;
        expect(lot.lat).toBeCloseTo(35.005, 6);
        expect(lot.lon <= -112.19 || lot.lon >= -112.18).toBe(true);
    });

    it("subtracts holes and is indifferent to ring winding", () => {
        const outerCw = [[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]] as [number, number][];
        const hole = [[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]] as [number, number][];
        // Hole covers the left half, so the remaining area's centroid is at x=3.
        const [x, y] = polygonLabelPoint([[outerCw, hole]])!;
        expect(x).toBeCloseTo(3, 9);
        expect(y).toBeCloseTo(2, 9);
    });

    it("renders missing template properties as empty", () => {
        expect(fillTemplate("WWR {name}", { name: null })).toBe("WWR");
        expect(fillTemplate("{a}-{b}", { a: 1 })).toBe("1-");
    });
});
