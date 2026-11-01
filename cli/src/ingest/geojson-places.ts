/**
 * Ingest adapter for a plain GeoJSON FeatureCollection of polygons (e.g. a subdivision's parcel
 * layer) -> one gazetteer record per feature, located at the polygon's centroid. A sibling of
 * `ingest/gnis.ts`, producing the same `NormalizedGazetteerRecord` shape so `pack/gazetteer.ts`
 * builds the pack without knowing the origin.
 *
 * Every text field is a `{PROPERTY}` template filled from the feature's own properties, so the
 * searchable name is whatever the operator makes it — `"WWR {name}"` turns a parcel whose `name`
 * property is "405" into a searchable "WWR 405".
 */
import { readFile } from "node:fs/promises";
import { normalizeGazetteerNameForMatch, normalizeGazetteerNameForDisplay } from "../../../lib/normalize.ts";
import type { NormalizedGazetteerRecord } from "../pack/types.ts";

type Position = [number, number, ...number[]];
type Ring = Position[];

interface Feature {
    type: "Feature";
    properties: Record<string, unknown> | null;
    geometry: { type: string; coordinates: unknown } | null;
}

export type ParsedGeojsonPlace =
    | { ok: true; record: NormalizedGazetteerRecord }
    | { ok: false; reason: "filtered" | "blank-name" | "unsupported-geometry" };

export interface ParseGeojsonPlacesOptions {
    /** Searchable name, e.g. `"WWR {name}"`. */
    nameTemplate: string;
    /** Shown after the name in results, e.g. `"Lot"`. */
    classTemplate: string;
    /** Shown in the result's county slot — `"APN {APN}"` tells apart two parcels sharing a lot number. */
    countyTemplate?: string;
    stateTemplate?: string;
    /** Keep only features where every listed property equals its value (string comparison). */
    where?: Record<string, string>;
}

/** Fills `{KEY}` from `props`; a missing/null property becomes "". */
export function fillTemplate(template: string, props: Record<string, unknown>): string {
    return template
        .replace(/\{([^{}]+)\}/g, (_, key: string) => {
            const value = props[key];
            return value === null || value === undefined ? "" : String(value);
        })
        .trim();
}

/** True when every `{KEY}` in `template` has a non-empty value — a name like "WWR {name}" on a
 *  feature with no `name` must count as blank, not become a bare "WWR" record. */
function templateFullyFilled(template: string, props: Record<string, unknown>): boolean {
    return [...template.matchAll(/\{([^{}]+)\}/g)].every(([, key]) => {
        const value = props[key!];
        return value !== null && value !== undefined && String(value).trim() !== "";
    });
}

/** Signed shoelace area and area-weighted centroid of one ring (lon/lat treated as planar —
 *  fine at parcel scale). */
function ringMoments(ring: Ring): { area: number; cx: number; cy: number } {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x0, y0] = ring[j]!;
        const [x1, y1] = ring[i]!;
        const cross = x0 * y1 - x1 * y0;
        area += cross;
        cx += (x0 + x1) * cross;
        cy += (y0 + y1) * cross;
    }
    return { area: area / 2, cx, cy };
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function pointInPolygons(x: number, y: number, polygons: Ring[][]): boolean {
    return polygons.some(([outer, ...holes]) => pointInRing(x, y, outer!) && !holes.some((h) => pointInRing(x, y, h)));
}

/**
 * Midpoint of the widest interior span along the horizontal line `y` — the fallback for an L- or
 * U-shaped parcel whose true centroid lands outside it, so the map never pans to a neighbor's lot.
 */
function interiorPointOnLine(y: number, polygons: Ring[][]): [number, number] | undefined {
    const xs: number[] = [];
    for (const polygon of polygons) {
        for (const ring of polygon) {
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const [xi, yi] = ring[i]!;
                const [xj, yj] = ring[j]!;
                if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
            }
        }
    }
    xs.sort((a, b) => a - b);
    let best: [number, number] | undefined;
    let bestWidth = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
        const width = xs[i + 1]! - xs[i]!;
        if (width > bestWidth) {
            bestWidth = width;
            best = [(xs[i]! + xs[i + 1]!) / 2, y];
        }
    }
    return best;
}

/**
 * Area-weighted centroid across all polygons (holes subtract), moved to an interior point when the
 * centroid falls outside the shape. Returns [lon, lat], or undefined for a degenerate geometry.
 */
export function polygonLabelPoint(polygons: Ring[][]): [number, number] | undefined {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (const polygon of polygons) {
        polygon.forEach((ring, index) => {
            const m = ringMoments(ring);
            // Normalize winding: outer rings add area, holes subtract, whatever the source's orientation.
            const sign = (index === 0 ? 1 : -1) * Math.sign(m.area);
            area += sign * m.area;
            cx += sign * m.cx;
            cy += sign * m.cy;
        });
    }
    if (area === 0) return undefined;
    const x = cx / (6 * area);
    const y = cy / (6 * area);
    if (pointInPolygons(x, y, polygons)) return [x, y];
    return interiorPointOnLine(y, polygons) ?? [x, y];
}

function toPolygons(geometry: Feature["geometry"]): Ring[][] | undefined {
    if (!geometry) return undefined;
    if (geometry.type === "Polygon") return [geometry.coordinates as Ring[]];
    if (geometry.type === "MultiPolygon") return geometry.coordinates as Ring[][];
    return undefined;
}

export function parseGeojsonPlaceFeature(feature: Feature, opts: ParseGeojsonPlacesOptions): ParsedGeojsonPlace {
    const props = feature.properties ?? {};
    for (const [key, value] of Object.entries(opts.where ?? {})) {
        if (String(props[key] ?? "") !== value) return { ok: false, reason: "filtered" };
    }

    const rawName = fillTemplate(opts.nameTemplate, props);
    if (!templateFullyFilled(opts.nameTemplate, props) || !normalizeGazetteerNameForMatch(rawName)) {
        return { ok: false, reason: "blank-name" };
    }

    const polygons = toPolygons(feature.geometry);
    const point = polygons && polygonLabelPoint(polygons);
    if (!point) return { ok: false, reason: "unsupported-geometry" };

    return {
        ok: true,
        record: {
            nameMatch: normalizeGazetteerNameForMatch(rawName),
            nameDisplay: normalizeGazetteerNameForDisplay(rawName),
            featureClass: fillTemplate(opts.classTemplate, props),
            county: opts.countyTemplate ? fillTemplate(opts.countyTemplate, props) : "",
            state: opts.stateTemplate ? fillTemplate(opts.stateTemplate, props) : "",
            lat: point[1],
            lon: point[0],
        },
    };
}

/** Reads each FeatureCollection file whole (parcel layers are small) and yields one result per feature. */
export async function* parseGeojsonPlaceFiles(
    filePaths: readonly string[],
    opts: ParseGeojsonPlacesOptions,
): AsyncGenerator<ParsedGeojsonPlace> {
    for (const filePath of filePaths) {
        const collection = JSON.parse(await readFile(filePath, "utf8")) as { type?: string; features?: Feature[] };
        if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
            throw new Error(`${filePath} is not a GeoJSON FeatureCollection`);
        }
        for (const feature of collection.features) {
            yield parseGeojsonPlaceFeature(feature, opts);
        }
    }
}
