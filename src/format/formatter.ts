import chalk from "chalk";
import type { DecodedError, FormattedError } from "../types.js";

function formatValue(value: unknown): string {
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "string") return `"${value}"`;
	if (typeof value === "boolean") return value.toString();
	if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
	if (value === null || value === undefined) return "null";
	return String(value);
}

function formatOneline(decoded: DecodedError): string {
	const args = decoded.rawArgs
		.map((val, i) => {
			const input = Object.keys(decoded.args)[i];
			const name = input && !input.startsWith("_") ? input : `arg${i}`;
			return `${name}=${formatValue(val)}`;
		})
		.join(", ");

	const prefix = decoded.contractName ? `${decoded.contractName}.` : "";

	const shortDesc = decoded.args["_shortStringDescription"];
	const shortSuffix =
		typeof shortDesc === "string" ? ` [short: ${shortDesc}]` : "";

	return `${prefix}${decoded.name}(${args})${shortSuffix}`;
}

function formatDetailed(decoded: DecodedError): string {
	const lines: string[] = [];
	const prefix = decoded.contractName ? `${decoded.contractName}.` : "";

	lines.push(`${prefix}${decoded.name}`);
	lines.push(`  selector: ${decoded.selector}`);
	lines.push(`  signature: ${decoded.signature}`);

	if (decoded.rawArgs.length > 0) {
		lines.push("  args:");
		let i = 0;
		for (const [key, value] of Object.entries(decoded.args)) {
			if (key.startsWith("_")) continue;
			lines.push(`    ${key}: ${formatValue(value)}`);
			i++;
		}
	}

	if (decoded.name === "Panic" && decoded.args["_panicDescription"]) {
		lines.push(`  reason: ${decoded.args["_panicDescription"]}`);
	}

	if (decoded.name === "Error" && decoded.args["_shortStringDescription"]) {
		lines.push(`  short: ${decoded.args["_shortStringDescription"]}`);
	}

	return lines.join("\n");
}

function formatColored(decoded: DecodedError): string {
	const lines: string[] = [];
	const prefix = decoded.contractName
		? chalk.gray(`${decoded.contractName}.`)
		: "";

	lines.push(`${prefix}${chalk.red.bold(decoded.name)}`);
	lines.push(`  ${chalk.dim("selector:")} ${chalk.yellow(decoded.selector)}`);
	lines.push(`  ${chalk.dim("signature:")} ${chalk.cyan(decoded.signature)}`);

	if (decoded.rawArgs.length > 0) {
		lines.push(`  ${chalk.dim("args:")}`);
		for (const [key, value] of Object.entries(decoded.args)) {
			if (key.startsWith("_")) continue;
			lines.push(`    ${chalk.blue(key)}: ${chalk.white(formatValue(value))}`);
		}
	}

	if (decoded.name === "Panic" && decoded.args["_panicDescription"]) {
		lines.push(
			`  ${chalk.dim("reason:")} ${chalk.magenta(String(decoded.args["_panicDescription"]))}`,
		);
	}

	if (decoded.name === "Error" && decoded.args["_shortStringDescription"]) {
		lines.push(
			`  ${chalk.dim("short:")} ${chalk.green(String(decoded.args["_shortStringDescription"]))}`,
		);
	}

	return lines.join("\n");
}

export function formatError(decoded: DecodedError): FormattedError {
	return {
		oneline: formatOneline(decoded),
		detailed: formatDetailed(decoded),
		colored: formatColored(decoded),
	};
}

/**
 * Console.log a decoded error with colors.
 */
export function logError(decoded: DecodedError): void {
	const formatted = formatError(decoded);
	console.log(formatted.colored);
}
