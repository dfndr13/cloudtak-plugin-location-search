import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** Raw OpenAddresses GeoJSON Feature properties (see PLAN.md §3.1). */
export interface RawOAFeature {
    number: string;
    street: string;
    unit: string;
    city: string;
    district: string;
    region: string;
    postcode: string;
    hash: string;
    lon: number;
    lat: number;
}

export type ParsedLine =
    | { ok: true; feature: RawOAFeature }
    | { ok: false; reason: "invalid-json" | "not-a-feature" | "invalid-geometry" };

interface GeoJSONFeatureLine {
    type?: string;
    properties?: Record<string, unknown>;
    geometry?: { type?: string; coordinates?: unknown };
}

function str(props: Record<string, unknown>, key: string): string {
    const v = props[key];
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * Streams one OpenAddresses line-delimited GeoJSON file (a single county export), yielding one
 * `ParsedLine` per non-blank source line — never silently dropped, so a caller can count exactly
 * how many rows were malformed vs. how many were normalized away later (PLAN.md §3.2 drops those
 * with no number+street, which is a separate, later check on an otherwise-valid feature).
 */
export async function* parseOpenAddressesFile(filePath: string): AsyncGenerator<ParsedLine> {
    const rl = createInterface({
        input: createReadStream(filePath, { encoding: "utf8" }),
        crlfDelay: Number.POSITIVE_INFINITY,
    });

    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: GeoJSONFeatureLine;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            yield { ok: false, reason: "invalid-json" };
            continue;
        }

        if (parsed.type !== "Feature") {
            yield { ok: false, reason: "not-a-feature" };
            continue;
        }

        if (parsed.geometry?.type !== "Point") {
            yield { ok: false, reason: "invalid-geometry" };
            continue;
        }
        const coords = parsed.geometry.coordinates;
        const [lon, lat] = Array.isArray(coords) ? (coords as [unknown, unknown]) : [undefined, undefined];
        if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
            yield { ok: false, reason: "invalid-geometry" };
            continue;
        }

        const props = parsed.properties ?? {};
        yield {
            ok: true,
            feature: {
                number: str(props, "number"),
                street: str(props, "street"),
                unit: str(props, "unit"),
                city: str(props, "city"),
                district: str(props, "district"),
                region: str(props, "region"),
                postcode: str(props, "postcode"),
                hash: str(props, "hash"),
                lon,
                lat,
            },
        };
    }
}

/** Streams every OpenAddresses file in `filePaths`, in order, as one logical line stream. */
export async function* parseOpenAddressesFiles(filePaths: readonly string[]): AsyncGenerator<ParsedLine> {
    for (const filePath of filePaths) {
        yield* parseOpenAddressesFile(filePath);
    }
}
