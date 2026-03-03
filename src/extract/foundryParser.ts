import fs from "node:fs";
import path from "node:path";
import type { Abi } from "viem";
import type { AbiErrorItem, SolidityErrorABI } from "../types.js";

export interface FoundryArtifact {
	contractName: string;
	fileName: string;
	abi: Abi;
	errors: SolidityErrorABI[];
}

function extractErrorsFromAbi(abi: Abi): SolidityErrorABI[] {
	return abi
		.filter((item): item is AbiErrorItem => item.type === "error")
		.map((err) => ({
			name: err.name,
			inputs: (err.inputs ?? []).map((input) => ({
				name: input.name ?? "",
				type: input.type,
				components: input.components as SolidityErrorABI["inputs"] | undefined,
			})),
		}));
}

/**
 * Scan a Foundry `out/` directory and extract all custom error ABIs.
 * Foundry outputs `out/<ContractFile.sol>/<ContractName>.json`.
 */
export function scanFoundryOut(outDir: string): FoundryArtifact[] {
	const resolvedDir = path.resolve(outDir);

	if (!fs.existsSync(resolvedDir)) {
		throw new Error(`Foundry out directory not found: ${resolvedDir}`);
	}

	const artifacts: FoundryArtifact[] = [];

	function walk(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				walk(fullPath);
				continue;
			}

			if (!entry.name.endsWith(".json")) continue;

			try {
				const raw = fs.readFileSync(fullPath, "utf8");
				const json = JSON.parse(raw);

				if (!json.abi || !Array.isArray(json.abi)) continue;

				const errors = extractErrorsFromAbi(json.abi);
				if (errors.length === 0) continue;

				artifacts.push({
					contractName: entry.name.replace(".json", ""),
					fileName: path.relative(resolvedDir, fullPath),
					abi: json.abi,
					errors,
				});
			} catch {
				// Skip files that aren't valid JSON or lack ABI
			}
		}
	}

	walk(resolvedDir);
	return artifacts;
}

/**
 * Scan a Hardhat `artifacts/` directory and extract all custom error ABIs.
 * Hardhat outputs `artifacts/contracts/<File.sol>/<Contract>.json`.
 */
export function scanHardhatArtifacts(artifactsDir: string): FoundryArtifact[] {
	const resolvedDir = path.resolve(artifactsDir);

	if (!fs.existsSync(resolvedDir)) {
		throw new Error(`Hardhat artifacts directory not found: ${resolvedDir}`);
	}

	const artifacts: FoundryArtifact[] = [];

	function walk(dir: string) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				walk(fullPath);
				continue;
			}

			if (!entry.name.endsWith(".json") || entry.name.endsWith(".dbg.json"))
				continue;

			try {
				const raw = fs.readFileSync(fullPath, "utf8");
				const json = JSON.parse(raw);

				if (!json.abi || !Array.isArray(json.abi)) continue;

				const errors = extractErrorsFromAbi(json.abi);
				if (errors.length === 0) continue;

				artifacts.push({
					contractName: json.contractName ?? entry.name.replace(".json", ""),
					fileName: path.relative(resolvedDir, fullPath),
					abi: json.abi,
					errors,
				});
			} catch {
				// Skip invalid files
			}
		}
	}

	walk(resolvedDir);
	return artifacts;
}
