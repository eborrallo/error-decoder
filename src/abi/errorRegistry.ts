import { keccak256, toBytes, type Abi } from "viem";
import type {
	AbiErrorItem,
	ErrorRegistryEntry,
	SolidityErrorABI,
	SolidityErrorInput,
} from "../types.js";
import { BUILTIN_ERRORS } from "../types.js";

function inputsToSignaturePart(inputs: SolidityErrorInput[]): string {
	return inputs
		.map((i) => {
			if (i.components && i.components.length > 0) {
				return `(${inputsToSignaturePart(i.components)})`;
			}
			return i.type;
		})
		.join(",");
}

function computeSelector(name: string, inputs: SolidityErrorInput[]): string {
	const sig = `${name}(${inputsToSignaturePart(inputs)})`;
	return keccak256(toBytes(sig)).slice(0, 10);
}

function computeSignature(name: string, inputs: SolidityErrorInput[]): string {
	return `${name}(${inputsToSignaturePart(inputs)})`;
}

export class ErrorRegistry {
	private selectorMap = new Map<string, ErrorRegistryEntry>();
	private allErrors: ErrorRegistryEntry[] = [];

	constructor(includeBuiltins = true) {
		if (includeBuiltins) {
			this.registerAbiErrors(BUILTIN_ERRORS);
		}
	}

	get size(): number {
		return this.selectorMap.size;
	}

	get entries(): ReadonlyArray<ErrorRegistryEntry> {
		return this.allErrors;
	}

	getBySelector(selector: string): ErrorRegistryEntry | undefined {
		return this.selectorMap.get(selector.toLowerCase());
	}

	registerAbi(abi: Abi, contractName?: string): void {
		const errors = abi.filter(
			(item): item is AbiErrorItem => item.type === "error",
		);
		this.registerAbiErrors(errors, contractName);
	}

	registerAbiErrors(errors: AbiErrorItem[], contractName?: string): void {
		for (const err of errors) {
			const inputs: SolidityErrorInput[] = (err.inputs ?? []).map((i) => ({
				name: i.name ?? "",
				type: i.type,
				components: i.components as SolidityErrorInput[] | undefined,
			}));

			const selector = computeSelector(err.name, inputs);
			const signature = computeSignature(err.name, inputs);

			if (this.selectorMap.has(selector.toLowerCase())) continue;

			const entry: ErrorRegistryEntry = {
				selector,
				signature,
				error: { name: err.name, inputs },
				abiItem: err,
				contractName,
			};

			this.selectorMap.set(selector.toLowerCase(), entry);
			this.allErrors.push(entry);
		}
	}

	registerErrorDefs(errors: SolidityErrorABI[], contractName?: string): void {
		const abiErrors: AbiErrorItem[] = errors.map((e) => ({
			type: "error" as const,
			name: e.name,
			inputs: e.inputs.map((i) => ({
				name: i.name,
				type: i.type,
				...(i.components
					? { components: i.components as AbiErrorItem["inputs"] }
					: {}),
			})),
		}));

		this.registerAbiErrors(abiErrors, contractName);
	}

	/** Check if a hex-encoded revert data has a matching error */
	hasSelector(data: string): boolean {
		if (data.length < 10) return false;
		return this.selectorMap.has(data.slice(0, 10).toLowerCase());
	}

	/** Get all selectors as a flat array */
	getSelectors(): string[] {
		return Array.from(this.selectorMap.keys());
	}

	/** Merge another registry into this one */
	merge(other: ErrorRegistry): void {
		for (const entry of other.entries) {
			if (!this.selectorMap.has(entry.selector.toLowerCase())) {
				this.selectorMap.set(entry.selector.toLowerCase(), entry);
				this.allErrors.push(entry);
			}
		}
	}
}
