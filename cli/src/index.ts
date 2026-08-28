#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { buildPack } from "./pack/build.ts";
import { printReport } from "./bench/report.ts";
import { DEFAULT_CELL_SIZE_DEG } from "./pack/types.ts";

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

program.parseAsync(process.argv);
