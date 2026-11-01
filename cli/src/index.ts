#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { buildPack } from "./pack/build.ts";
import { buildGazetteerPack } from "./pack/gazetteer.ts";
import { printReport, printGazetteerReport } from "./bench/report.ts";
import { DEFAULT_CELL_SIZE_DEG, DEFAULT_GAZETTEER_CELL_SIZE_DEG } from "./pack/types.ts";
import { DEFAULT_GAZETTEER_CLASSES } from "./ingest/gnis.ts";
import { parseGeojsonPlaceFiles } from "./ingest/geojson-places.ts";

const program = new Command();

program
    .name("cloudtak-address-pack")
    .description("Convert OpenAddresses line-delimited GeoJSON into a CloudTAK address-search .pack file");

program
    .command("build")
    .description("Build a .pack file from one or more OpenAddresses export files")
    .argument("<inputs...>", "OpenAddresses line-delimited GeoJSON file(s)")
    .requiredOption("-o, --out <path>", "output .pack file path")
    .requiredOption("-r, --region <label>", 'region label, e.g. "AZ-Maricopa" or "AZ"')
    .option("--cell-size <degrees>", "reverse-geocode grid cell size in degrees", String(DEFAULT_CELL_SIZE_DEG))
    .option("--chunk-budget <bytes>", "uncompressed byte budget per address chunk")
    .action(async (inputs: string[], options: { out: string; region: string; cellSize: string; chunkBudget?: string }) => {
        const { pack, stats } = await buildPack({
            inputFiles: inputs,
            region: options.region,
            cellSizeDeg: Number.parseFloat(options.cellSize),
            chunkByteBudget: options.chunkBudget ? Number.parseInt(options.chunkBudget, 10) : undefined,
        });

        await writeFile(options.out, pack);
        console.log(`wrote ${options.out}`);
        console.log();
        printReport(stats);
    });

program
    .command("build-gazetteer")
    .description("Build a gazetteer (place-name) .pack file from one or more USGS GNIS National File exports")
    .argument("<inputs...>", "GNIS National File export(s), pipe-delimited with a header row")
    .requiredOption("-o, --out <path>", "output .pack file path")
    .requiredOption("-r, --region <label>", 'region label, e.g. "AZ"')
    .option("--source-name <name>", "source label recorded in the manifest", "USGS GNIS National File")
    .option("--cell-size <degrees>", "reverse-geocode grid cell size in degrees", String(DEFAULT_GAZETTEER_CELL_SIZE_DEG))
    .option("--classes <comma-list>", 'feature classes to include (case-insensitive), or "all"', "default")
    .action(async (
        inputs: string[],
        options: { out: string; region: string; sourceName: string; cellSize: string; classes: string },
    ) => {
        const classes =
            options.classes === "default"
                ? DEFAULT_GAZETTEER_CLASSES
                : options.classes === "all"
                  ? ("all" as const)
                  : new Set(options.classes.split(",").map((c) => c.trim().toUpperCase()));

        const { pack, stats } = await buildGazetteerPack({
            inputFiles: inputs,
            region: options.region,
            sourceName: options.sourceName,
            cellSizeDeg: Number.parseFloat(options.cellSize),
            classes,
        });

        await writeFile(options.out, pack);
        console.log(`wrote ${options.out}`);
        console.log();
        printGazetteerReport(stats);
    });

program
    .command("build-geojson-places")
    .description("Build a gazetteer .pack from a GeoJSON FeatureCollection of polygons, one searchable name per polygon centroid")
    .argument("<inputs...>", "GeoJSON FeatureCollection file(s) of Polygon/MultiPolygon features")
    .requiredOption("-o, --out <path>", "output .pack file path")
    .requiredOption("-r, --region <label>", 'region label, e.g. "WWR"')
    .requiredOption("--name <template>", 'searchable name built from feature properties, e.g. "WWR {name}"')
    .option("--class <template>", "feature class shown in results", "Lot")
    .option("--county <template>", 'shown in the county slot of results, e.g. "APN {APN}"', "")
    .option("--state <template>", "shown in the state slot of results", "")
    .option("--where <KEY=VALUE...>", "keep only features whose property equals the value (repeatable)")
    .option("--source-name <name>", "source label recorded in the manifest", "GeoJSON parcels")
    .option("--cell-size <degrees>", "reverse-geocode grid cell size in degrees", String(DEFAULT_GAZETTEER_CELL_SIZE_DEG))
    .action(async (
        inputs: string[],
        options: {
            out: string; region: string; name: string; class: string; county: string; state: string;
            where?: string[]; sourceName: string; cellSize: string;
        },
    ) => {
        const where: Record<string, string> = {};
        for (const clause of options.where ?? []) {
            const eq = clause.indexOf("=");
            if (eq <= 0) throw new Error(`--where expects KEY=VALUE, got "${clause}"`);
            where[clause.slice(0, eq)] = clause.slice(eq + 1);
        }

        const { pack, stats } = await buildGazetteerPack({
            inputFiles: inputs,
            source: parseGeojsonPlaceFiles(inputs, {
                nameTemplate: options.name,
                classTemplate: options.class,
                countyTemplate: options.county,
                stateTemplate: options.state,
                where,
            }),
            region: options.region,
            sourceName: options.sourceName,
            cellSizeDeg: Number.parseFloat(options.cellSize),
        });

        await writeFile(options.out, pack);
        console.log(`wrote ${options.out}`);
        console.log();
        printGazetteerReport(stats);
    });

program.parseAsync(process.argv);
