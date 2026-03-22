/**
 * viem .extend() integration — transparent error decoding.
 *
 * The plugin overrides `call`, `simulateContract`, `writeContract`,
 * and `sendTransaction` so reverts automatically throw
 * DecodedRevertError with full error details.
 *
 * Extend both public and wallet clients — every revert is decoded.
 *
 * Prerequisites:
 *   pnpm example:generate   (includes generate-short-codes for SHORT_STRING_ERROR_CODES)
 *
 * Run:
 *   npx tsx example/viem_run.ts
 */

import { createAnvil } from "@viem/anvil";
import {
	type Hex,
	createPublicClient,
	createWalletClient,
	encodeFunctionData,
	getContract,
	http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createShortStringResolver } from "../src/index.js";
import { DecodedRevertError, errorDecoder } from "../src/viem/index.js";

import {
	DEXABI,
	DEXBytecode,
	ERROR_ABI,
	LendingABI,
	LendingBytecode,
	SHORT_STRING_ERROR_CODES,
	VaultABI,
	VaultBytecode,
} from "./generated/index.js";

const resolveShortStringMessage = createShortStringResolver(
	SHORT_STRING_ERROR_CODES,
);

const deployer = privateKeyToAccount(
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const attacker = privateKeyToAccount(
	"0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

async function main() {
	console.log("=".repeat(60));
	console.log(" viem .extend(errorDecoder()) — transparent overrides");
	console.log("=".repeat(60));

	const anvil = createAnvil();
	await anvil.start();
	const url = `http://${anvil.host}:${anvil.port}`;
	console.log(`\nAnvil → ${url}`);

	const transport = http(url);
	const plugin = errorDecoder({
		errorAbis: [ERROR_ABI],
		resolveShortStringMessage,
	});

	// ── Extend BOTH clients — all reverts are now auto-decoded ──

	const client = createPublicClient({ chain: foundry, transport }).extend(
		plugin,
	);

	const wallet = createWalletClient({
		account: deployer,
		chain: foundry,
		transport,
	}).extend(plugin);

	console.log(
		`Clients extended: ${client.errorRegistrySize} error selectors\n`,
	);

	try {
		// ── Deploy (use raw wallet — deploy shouldn't revert) ──

		const rawWallet = createWalletClient({
			account: deployer,
			chain: foundry,
			transport,
		});

		async function deploy(
			abi: readonly unknown[],
			bytecode: Hex,
		): Promise<Hex> {
			const hash = await rawWallet.deployContract({
				abi: [...abi],
				bytecode,
				account: deployer,
			});
			const receipt = await client.waitForTransactionReceipt({ hash });
			return receipt.contractAddress!;
		}

		const vaultAddr = await deploy(VaultABI, VaultBytecode);
		const dexAddr = await deploy(DEXABI, DEXBytecode);
		const lendingAddr = await deploy(LendingABI, LendingBytecode);

		const vault = getContract({
			address: vaultAddr,
			abi: [...VaultABI],
			client: { public: client, wallet },
		});

		console.log(`Vault   → ${vaultAddr}`);
		console.log(`DEX     → ${dexAddr}`);
		console.log(`Lending → ${lendingAddr}`);

		// ── Error(string) short codes (library + file-level constants) ──

		console.log("\n--- Error(string) short codes (plugin + generated map) ---\n");

		const shortDemos = [
			{
				label: "Vault.demoShortStringProtocol — A1 → ErrorText1",
				address: vaultAddr,
				abi: VaultABI,
				fn: "demoShortStringProtocol" as const,
			},
			{
				label: "DEX.demoShortStringFileLevel — P1 → PlainErrorText1",
				address: dexAddr,
				abi: DEXABI,
				fn: "demoShortStringFileLevel" as const,
			},
			{
				label: "Lending.demoShortStringProtocol2 — A2 → ErrorText2",
				address: lendingAddr,
				abi: LendingABI,
				fn: "demoShortStringProtocol2" as const,
			},
		] as const;

		for (const d of shortDemos) {
			try {
				console.log(`${d.label}`);
				await client.simulateContract({
					address: d.address,
					abi: [...d.abi],
					functionName: d.fn as any,
					args: [],
					account: deployer.address,
				});
				console.log("  (did not revert — unexpected)\n");
			} catch (err) {
				if (err instanceof DecodedRevertError) {
					const { message, _shortStringDescription } = err.decoded.args as {
						message?: string;
						_shortStringDescription?: string;
					};
					console.log(
						`  ✗ ${err.decoded.name}: message=${JSON.stringify(message)} short=${_shortStringDescription}\n`,
					);
				} else {
					throw err;
				}
			}
		}

		// ── Happy path ──

		console.log("\n--- Happy path ---\n");

		await vault.write.deposit({ value: 5000n });
		const bal = await vault.read.balances([deployer.address]);
		console.log(`vault.deposit{ 5000 } + balances() = ${bal}`);

		// ── simulateContract — transparent error decoding ──

		console.log("\n--- simulateContract (try/catch) ---\n");

		// 1. ZeroAmount
		try {
			console.log("vault.simulate.deposit{ value: 0 }");
			await client.simulateContract({
				address: vaultAddr,
				abi: [...VaultABI],
				functionName: "deposit",
				account: deployer.address,
				value: 0n,
			});
		} catch (err) {
			if (err instanceof DecodedRevertError) {
				console.log(`  ✗ ${err.decoded.name}`);
				console.log(`    selector: ${err.decoded.selector}`);
				console.log(`    signature: ${err.decoded.signature}\n`);
			}
		}

		// 2. InsufficientBalance
		try {
			console.log("vault.simulate.withdraw(99999)");
			await client.simulateContract({
				address: vaultAddr,
				abi: [...VaultABI],
				functionName: "withdraw",
				args: [99999n],
				account: deployer.address,
			});
		} catch (err) {
			if (err instanceof DecodedRevertError) {
				console.log(`  ✗ ${err.decoded.name}`);
				console.log(`    args:`, err.decoded.args, "\n");
			}
		}

		// 3. Unauthorized
		try {
			console.log("vault.simulate.adminWithdraw(1) — from attacker");
			await client.simulateContract({
				address: vaultAddr,
				abi: [...VaultABI],
				functionName: "adminWithdraw",
				args: [1n],
				account: attacker.address,
			});
		} catch (err) {
			if (err instanceof DecodedRevertError) {
				console.log(`  ✗ ${err.message}\n`);
			}
		}

		// 4. DeadlineExpired
		try {
			console.log("dex.simulate.swap() — deadline=1");
			await client.simulateContract({
				address: dexAddr,
				abi: [...DEXABI],
				functionName: "swap",
				args: [
					"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
					"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
					1000n,
					1n,
					1n,
				],
				account: deployer.address,
			});
		} catch (err) {
			if (err instanceof DecodedRevertError) {
				console.log(
					`  ✗ ${err.decoded.name}(deadline=${err.decoded.args.deadline}, currentTime=${err.decoded.args.currentTime})\n`,
				);
			}
		}

		// 5. PositionNotFound
		try {
			console.log("lending.simulate.borrow(999, 1000)");
			await client.simulateContract({
				address: lendingAddr,
				abi: [...LendingABI],
				functionName: "borrow",
				args: [999n, 1000n],
				account: deployer.address,
			});
		} catch (err) {
			if (err instanceof DecodedRevertError) {
				console.log(
					`  ✗ ${err.decoded.name}(positionId=${err.decoded.args.positionId})\n`,
				);
			}
		}

		// ── raw client.call ──

		console.log("--- client.call ---\n");

		try {
			const data = encodeFunctionData({
				abi: [...VaultABI],
				functionName: "withdraw",
				args: [99999n],
			});
			await client.call({ to: vaultAddr, data, account: deployer.address });
		} catch (err) {
			if (err instanceof DecodedRevertError) {
				console.log(`  client.call → ${err.decoded.name}`);
				console.log(`    revert data: ${err.revertData}\n`);
			}
		}

		// ── writeContract — wallet client is extended too ──

		console.log("--- writeContract (wallet extended) ---\n");

		try {
			console.log("vault.write.withdraw(99999) — decoded automatically");
			await vault.write.withdraw([99999n]);
		} catch (err) {
			if (err instanceof DecodedRevertError) {
				console.log(`  ✗ ${err.decoded.name}`);
				console.log(`    args:`, err.decoded.args, "\n");
			}
		}

		// ── Simulate → Execute pattern ──

		console.log("--- Simulate → Execute ---\n");

		try {
			console.log(
				"vault.simulate.withdraw(99999) — simulate catches it before tx",
			);
			await client.simulateContract({
				address: vaultAddr,
				abi: [...VaultABI],
				functionName: "withdraw",
				args: [99999n],
				account: deployer.address,
			});

			await vault.write.withdraw([99999n]);
			console.log("  This line never runs — simulation caught it.\n");
		} catch (err) {
			if (err instanceof DecodedRevertError) {
				console.log(`  ✗ Simulation prevented tx: ${err.decoded.name}`);
				console.log(`    args:`, err.decoded.args);
				console.log(`    No gas wasted!\n`);
			}
		}

		// ── Helper methods ──

		console.log("--- Helper methods ---\n");

		const raw =
			"0xdb42144d000000000000000000000000000000000000000000000000000000000000dead00000000000000000000000000000000000000000000000000000000000003e800000000000000000000000000000000000000000000000000000000000001f4" as Hex;

		const fmt = client.formatError(raw)!;
		console.log(`  formatError → ${fmt.oneline}`);

		const decoded = client.decodeError(raw)!;
		console.log(`  decodeError → ${decoded.name}`, decoded.args);

		console.log("\n" + "=".repeat(60));
		console.log(" Done!");
		console.log("=".repeat(60) + "\n");
	} finally {
		await anvil.stop();
		console.log("Anvil stopped.");
	}
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
