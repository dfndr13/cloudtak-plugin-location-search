#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { buildPack } from "./pack/build.ts";
import { buildGazetteerPack } from "./pack/gazetteer.ts";
import { printReport, printGazetteerReport } from "./bench/report.ts";
import { DEFAULT_CELL_SIZE_DEG, DEFAULT_GAZETTEER_CELL_SIZE_DEG } from "./pack/types.ts";
import { DEFAULT_GAZETTEER_CLASSES } from "./ingest/gnis.ts";
import { buildPackList, parseLabels } from "./pack/pack-list.ts";

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
    .command("pack-list")
    .description("Write the packs.json list that CloudTAK browsers sync their datasets from")
    .argument("<packs...>", ".pack files (packs.json must be served from the same folder)")
    .requiredOption("-o, --out <path>", "output packs.json path")
    .option("--label <id=Text>", "display label for a pack (repeatable); defaults to the file name", (v: string, acc: string[]) => [...acc, v], [] as string[])
    .action(async (packs: string[], options: { out: string; label: string[] }) => {
        const list = await buildPackList(packs, parseLabels(options.label));
        await writeFile(options.out, JSON.stringify(list, null, 2) + "\n");
        console.log(`wrote ${options.out} (${list.packs.length} packs)`);
    });

program.parseAsync(process.argv);
