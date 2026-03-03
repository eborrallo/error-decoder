import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanFoundryOut } from "../src/extract/foundryParser.js";

const FOUNDRY_OUT = path.resolve(__dirname, "../example-contracts/out");

describe("scanFoundryOut", () => {
	it("should find all contracts with custom errors", () => {
		const artifacts = scanFoundryOut(FOUNDRY_OUT);
		const contractNames = artifacts.map((a) => a.contractName).sort();

		expect(contractNames).toContain("Vault");
		expect(contractNames).toContain("DEX");
		expect(contractNames).toContain("Lending");
	});

	it("should extract Vault errors correctly", () => {
		const artifacts = scanFoundryOut(FOUNDRY_OUT);
		const vault = artifacts.find((a) => a.contractName === "Vault");

		expect(vault).toBeDefined();
		const errorNames = vault!.errors.map((e) => e.name).sort();

		expect(errorNames).toContain("InsufficientBalance");
		expect(errorNames).toContain("Unauthorized");
		expect(errorNames).toContain("VaultLocked");
		expect(errorNames).toContain("ZeroAmount");
		expect(errorNames).toContain("InvalidToken");
		expect(errorNames).toContain("SlippageExceeded");
	});

	it("should extract error inputs correctly", () => {
		const artifacts = scanFoundryOut(FOUNDRY_OUT);
		const vault = artifacts.find((a) => a.contractName === "Vault");
		const insufficient = vault!.errors.find(
			(e) => e.name === "InsufficientBalance",
		);

		expect(insufficient).toBeDefined();
		expect(insufficient!.inputs).toHaveLength(3);
		expect(insufficient!.inputs[0]).toEqual({ name: "user", type: "address" });
		expect(insufficient!.inputs[1]).toEqual({
			name: "requested",
			type: "uint256",
		});
		expect(insufficient!.inputs[2]).toEqual({
			name: "available",
			type: "uint256",
		});
	});

	it("should extract DEX errors including complex types", () => {
		const artifacts = scanFoundryOut(FOUNDRY_OUT);
		const dex = artifacts.find((a) => a.contractName === "DEX");

		expect(dex).toBeDefined();
		const errorNames = dex!.errors.map((e) => e.name).sort();

		expect(errorNames).toContain("PairNotFound");
		expect(errorNames).toContain("InsufficientLiquidity");
		expect(errorNames).toContain("DeadlineExpired");
		expect(errorNames).toContain("PriceImpactTooHigh");
	});

	it("should throw on non-existent directory", () => {
		expect(() => scanFoundryOut("/nonexistent")).toThrow();
	});

	it("should extract ZeroAmount with no inputs", () => {
		const artifacts = scanFoundryOut(FOUNDRY_OUT);
		const vault = artifacts.find((a) => a.contractName === "Vault");
		const zeroAmount = vault!.errors.find((e) => e.name === "ZeroAmount");

		expect(zeroAmount).toBeDefined();
		expect(zeroAmount!.inputs).toHaveLength(0);
	});
});
