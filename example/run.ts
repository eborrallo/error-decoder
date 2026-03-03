/**
 * End-to-end example using pre-generated contract artifacts.
 *
 * Build step (run once after forge build):
 *   npx @abiregistry/error-decoder generate --foundry ./example-contracts/out --output ./example/generated --contracts
 *
 * Run:
 *   npx tsx example/run.ts
 */

import { createAnvil } from "@viem/anvil";
import {
	createPublicClient,
	createWalletClient,
	encodeAbiParameters,
	encodeFunctionData,
	http,
	keccak256,
	toBytes,
	type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createDecoder } from "../src/index.js";

// Pre-generated at build time — no runtime FS scanning
import {
	ERROR_ABI,
	VaultABI,
	VaultBytecode,
	DEXABI,
	DEXBytecode,
	LendingABI,
	LendingBytecode,
} from "./generated/index.js";

const deployer = privateKeyToAccount(
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const user2 = privateKeyToAccount(
	"0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

// ── Helpers ─────────────────────────────────────────────────────────────

function separator() {
	console.log("\n" + "-".repeat(60));
}

async function rawCall(
	client: ReturnType<typeof createPublicClient>,
	to: Hex,
	abi: readonly unknown[],
	functionName: string,
	args: unknown[],
	opts?: { from?: Hex; value?: bigint },
): Promise<Hex | null> {
	const data = encodeFunctionData({ abi: [...abi], functionName, args });
	try {
		await client.call({ to, data, account: opts?.from, value: opts?.value });
		return null;
	} catch (err: any) {
		return extractRevertData(err);
	}
}

function extractRevertData(err: any): Hex | null {
	if (err?.data && typeof err.data === "string" && err.data.startsWith("0x"))
		return err.data as Hex;
	if (err?.cause) return extractRevertData(err.cause);
	const match = err?.message?.match(/(0x[0-9a-fA-F]{8,})/);
	return match ? (match[1] as Hex) : null;
}

// ── Contracts map — fully static, from generated imports ────────────────

const contracts = {
	Vault: { abi: VaultABI, bytecode: VaultBytecode },
	DEX: { abi: DEXABI, bytecode: DEXBytecode },
	Lending: { abi: LendingABI, bytecode: LendingBytecode },
} as const;

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
	console.log("=".repeat(60));
	console.log(" @abiregistry/error-decoder — End-to-End Example");
	console.log("=".repeat(60));

	// ── Spawn anvil ──

	console.log("\n[0] Starting local anvil instance...");
	const anvil = createAnvil();
	await anvil.start();
	const rpcUrl = `http://${anvil.host}:${anvil.port}`;
	console.log(`    Anvil running at ${rpcUrl}`);

	const transport = http(rpcUrl);
	const publicClient = createPublicClient({ chain: foundry, transport });
	const walletClient = createWalletClient({
		account: deployer,
		chain: foundry,
		transport,
	});

	try {
		// ── Step 1: Create decoder from the pre-generated ERROR_ABI ──

		console.log("\n[1] Creating decoder from pre-generated ERROR_ABI...");
		const decoder = createDecoder({
			abis: [ERROR_ABI as any[]],
		});
		console.log(`    Registry: ${decoder.registrySize} error selectors loaded`);

		// ── Step 2: Deploy contracts using pre-generated ABIs + bytecodes ──

		console.log("\n[2] Deploying contracts (from generated artifacts)...");

		const deployed: Record<string, Hex> = {};
		for (const [name, { abi, bytecode }] of Object.entries(contracts)) {
			const hash = await walletClient.deployContract({
				abi: [...abi] as any,
				bytecode: bytecode as Hex,
			});
			const receipt = await publicClient.waitForTransactionReceipt({ hash });
			if (!receipt.contractAddress) throw new Error(`Failed to deploy ${name}`);
			deployed[name] = receipt.contractAddress as Hex;
			console.log(`  ${name} → ${receipt.contractAddress}`);
		}

		// ── Step 3: Trigger errors and decode them ──

		console.log("\n[3] Triggering custom errors and decoding...");

		const scenarios: {
			label: string;
			to: Hex;
			abi: readonly unknown[];
			fn: string;
			args: unknown[];
			opts?: { from?: Hex; value?: bigint };
		}[] = [
			{
				label: "Vault.deposit{ value: 0 }()",
				to: deployed.Vault,
				abi: VaultABI,
				fn: "deposit",
				args: [],
				opts: { from: deployer.address, value: 0n },
			},
			{
				label: "Vault.withdraw(1000) — no balance",
				to: deployed.Vault,
				abi: VaultABI,
				fn: "withdraw",
				args: [1000n],
				opts: { from: deployer.address },
			},
			{
				label: "Vault.adminWithdraw(1) — wrong sender",
				to: deployed.Vault,
				abi: VaultABI,
				fn: "adminWithdraw",
				args: [1n],
				opts: { from: user2.address },
			},
			{
				label: "DEX.swap() — deadline expired",
				to: deployed.DEX,
				abi: DEXABI,
				fn: "swap",
				args: [
					"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
					"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
					1000n,
					1n,
					1n,
				],
				opts: { from: deployer.address },
			},
			{
				label: "Lending.borrow(999, 1000) — no position",
				to: deployed.Lending,
				abi: LendingABI,
				fn: "borrow",
				args: [999n, 1000n],
				opts: { from: deployer.address },
			},
			{
				label: "Lending.repay(42, 500) — no position",
				to: deployed.Lending,
				abi: LendingABI,
				fn: "repay",
				args: [42n, 500n],
				opts: { from: deployer.address },
			},
		];

		for (const s of scenarios) {
			separator();
			console.log(`\n  ${s.label}`);
			const revertData = await rawCall(
				publicClient,
				s.to,
				s.abi,
				s.fn,
				s.args,
				s.opts,
			);
			if (revertData) {
				console.log(`  revert data: ${revertData}\n`);
				decoder.decodeAndLog(revertData);
			} else {
				console.log("  (did not revert)");
			}
		}

		// ── Step 4: All 3 format modes ──

		separator();
		console.log("\n[4] All output formats for InsufficientBalance:\n");

		const insufficientData = await rawCall(
			publicClient,
			deployed.Vault,
			VaultABI,
			"withdraw",
			[1000n],
			{ from: deployer.address },
		);
		if (insufficientData) {
			const fmt = decoder.decodeAndFormat(insufficientData);
			if (fmt) {
				console.log("  --- One-line ---");
				console.log(`  ${fmt.oneline}\n`);
				console.log("  --- Detailed ---");
				fmt.detailed.split("\n").forEach((l) => console.log(`  ${l}`));
				console.log("\n  --- Colored (ANSI) ---");
				fmt.colored.split("\n").forEach((l) => console.log(`  ${l}`));
			}
		}

		// ── Step 5: Builtin errors ──

		separator();
		console.log("\n[5] Builtin Error(string) and Panic(uint256):\n");

		const errSel = keccak256(toBytes("Error(string)")).slice(0, 10);
		const errArgs = encodeAbiParameters(
			[{ type: "string" }],
			["Insufficient funds for transfer"],
		);
		console.log("  Error(string):");
		decoder.decodeAndLog(`${errSel}${errArgs.slice(2)}` as Hex);

		const panicSel = keccak256(toBytes("Panic(uint256)")).slice(0, 10);

		const p1 = encodeAbiParameters([{ type: "uint256" }], [0x11n]);
		console.log("\n  Panic(uint256) — overflow:");
		decoder.decodeAndLog(`${panicSel}${p1.slice(2)}` as Hex);

		const p2 = encodeAbiParameters([{ type: "uint256" }], [0x12n]);
		console.log("\n  Panic(uint256) — division by zero:");
		decoder.decodeAndLog(`${panicSel}${p2.slice(2)}` as Hex);

		// ── Step 6: Unknown error ──

		separator();
		console.log("\n[6] Unknown error selector:\n");
		const unknown = decoder.tryDecode("0xdeadbeef1122334455667788");
		console.log("  Result:", JSON.stringify(unknown, null, 2));

		console.log("\n" + "=".repeat(60));
		console.log(" Done! All errors decoded successfully.");
		console.log("=".repeat(60) + "\n");
	} finally {
		await anvil.stop();
		console.log("Anvil stopped.");
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
