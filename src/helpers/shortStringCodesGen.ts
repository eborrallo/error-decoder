import fs from "node:fs";
import path from "node:path";

// Matches anywhere in the file (library, contract, or file-level):
//   string constant FOO = "A1";
//   string internal|public|private constant FOO = "A1";
const CONSTANT_RE =
	/string\s+(?:(?:internal|public|private)\s+)?constant\s+(\w+)\s*=\s*"([^"]*)"\s*;/g;

export interface StringConstantPair {
	name: string;
	code: string;
}

export function parseSolidityStringConstants(
	source: string,
): StringConstantPair[] {
	const pairs: StringConstantPair[] = [];
	const codeToName = new Map<string, string>();

	const re = new RegExp(CONSTANT_RE.source, "g");
	for (const m of source.matchAll(re)) {
		const name = m[1];
		const code = m[2];
		const prev = codeToName.get(code);
		if (prev !== undefined) {
			if (prev !== name) {
				throw new Error(`Duplicate short code "${code}": ${prev} vs ${name}`);
			}
			continue;
		}
		codeToName.set(code, name);
		pairs.push({ name, code });
	}

	return pairs;
}

function isValidObjectKey(code: string): boolean {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(code);
}

function escapeTsString(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * TypeScript module: only the lookup map. Use `createShortStringResolver` from the package
 * with this map when creating a decoder.
 */
export function generateShortStringCodesModule(
	pairs: StringConstantPair[],
	sourceRelPath: string,
	regenerateHint: string,
): string {
	const lines: string[] = [];
	lines.push("/**");
	lines.push(" * AUTO-GENERATED — do not edit by hand.");
	lines.push(` * Source: ${sourceRelPath.replace(/\\/g, "/")}`);
	lines.push(` * Regenerate: ${regenerateHint}`);
	lines.push(" */");
	lines.push(
		"export const SHORT_STRING_ERROR_CODES: Readonly<Record<string, string>> =",
	);
	lines.push("\tObject.freeze({");

	for (const { code, name } of pairs) {
		const key = isValidObjectKey(code) ? code : JSON.stringify(code);
		const val = escapeTsString(name);
		lines.push(`\t\t${key}: "${val}",`);
	}

	lines.push("\t});");
	lines.push("");
	lines.push(
		"// Use with: createShortStringResolver(SHORT_STRING_ERROR_CODES) in createDecoder({ ... })",
	);
	lines.push("");

	return `${lines.join("\n")}\n`;
}

/**
 * Read one or more Solidity files and merge all `string … constant` lines into one map.
 * Use multiple files when codes are split (e.g. a `library` module + file-level constants).
 */
export function writeShortStringCodesFromSolidity(options: {
	/** One path, or use `inputPaths` instead */
	inputPath?: string;
	/** Preferred: one or more Solidity files (merged in order; duplicate short codes must agree on the constant name) */
	inputPaths?: string[];
	outputPath: string;
	cwd: string;
	regenerateHint: string;
}): { count: number; outputPath: string } {
	const paths =
		options.inputPaths && options.inputPaths.length > 0
			? options.inputPaths
			: options.inputPath
				? [options.inputPath]
				: [];

	if (paths.length === 0) {
		throw new Error("Provide inputPath or inputPaths");
	}

	const absPaths = paths.map((p) => path.resolve(options.cwd, p));
	for (const abs of absPaths) {
		if (!fs.existsSync(abs)) {
			throw new Error(`Input not found: ${abs}`);
		}
	}

	const combinedSource = absPaths
		.map((abs) => fs.readFileSync(abs, "utf8"))
		.join("\n\n");
	const pairs = parseSolidityStringConstants(combinedSource);
	if (pairs.length === 0) {
		throw new Error(
			`No string constants matched in: ${absPaths.join(", ")}. Expected lines like: string constant NAME = "CODE"; or string internal constant NAME = "CODE"; (library, contract, or file-level).`,
		);
	}

	const sourceRel = absPaths
		.map((abs) => path.relative(options.cwd, abs) || path.basename(abs))
		.join(", ");
	const ts = generateShortStringCodesModule(
		pairs,
		sourceRel,
		options.regenerateHint,
	);
	const out = path.resolve(options.cwd, options.outputPath);
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, ts, "utf8");

	return { count: pairs.length, outputPath: out };
}
