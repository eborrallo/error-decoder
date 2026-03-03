export interface SolidityErrorInput {
	name: string;
	type: string;
	indexed?: boolean;
	components?: SolidityErrorInput[];
}

/** Mirrors abitype's AbiError — defined locally to avoid import issues. */
export interface AbiErrorItem {
	type: "error";
	name: string;
	inputs: readonly {
		name?: string;
		type: string;
		components?: readonly { name?: string; type: string }[];
	}[];
}

export interface SolidityErrorABI {
	name: string;
	inputs: SolidityErrorInput[];
}

export interface DecodedError {
	name: string;
	selector: string;
	signature: string;
	args: Record<string, unknown>;
	rawArgs: readonly unknown[];
	contractName?: string;
}

export interface ErrorRegistryEntry {
	selector: string;
	signature: string;
	error: SolidityErrorABI;
	abiItem: AbiErrorItem;
	contractName?: string;
}

export interface DecoderOptions {
	/** Path to Foundry `out/` directory */
	foundryOut?: string;
	/** Path to Hardhat `artifacts/` directory */
	hardhatArtifacts?: string;
	/** Raw ABI arrays to register */
	abis?: readonly unknown[][];
	/** Include standard Error(string) and Panic(uint256) */
	includeBuiltins?: boolean;
}

export interface FormattedError {
	/** One-line: ErrorName(arg1=val1, arg2=val2) */
	oneline: string;
	/** Multi-line with aligned args */
	detailed: string;
	/** ANSI-colored version for terminals */
	colored: string;
}

export const PANIC_CODES: Record<number, string> = {
	0x00: "Generic compiler panic",
	0x01: "Assert failed",
	0x11: "Arithmetic overflow/underflow",
	0x12: "Division or modulo by zero",
	0x21: "Conversion to invalid enum value",
	0x22: "Access to incorrectly encoded storage byte array",
	0x31: "pop() on empty array",
	0x32: "Array index out of bounds",
	0x41: "Too much memory allocated",
	0x51: "Call to zero-initialized internal function",
};

export const BUILTIN_ERRORS: AbiErrorItem[] = [
	{
		type: "error",
		name: "Error",
		inputs: [{ name: "message", type: "string" }],
	},
	{
		type: "error",
		name: "Panic",
		inputs: [{ name: "code", type: "uint256" }],
	},
];
