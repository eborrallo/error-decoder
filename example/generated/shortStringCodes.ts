/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: example-contracts/src/ProtocolErrorCodes.sol, example-contracts/src/FileLevelErrorCodes.sol
 * Regenerate: npx error-decoder generate-short-codes -i ./example-contracts/src/ProtocolErrorCodes.sol,./example-contracts/src/FileLevelErrorCodes.sol -o ./example/generated/shortStringCodes.ts
 */
export const SHORT_STRING_ERROR_CODES: Readonly<Record<string, string>> =
	Object.freeze({
		A1: "ErrorText1",
		A2: "ErrorText2",
		A3: "ErrorText3",
		P1: "PlainErrorText1",
		P2: "PlainErrorText2",
	});

// Use with: createShortStringResolver(SHORT_STRING_ERROR_CODES) in createDecoder({ ... })

