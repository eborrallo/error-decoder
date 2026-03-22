import type { ShortStringResolveFn } from "../types.js";

/**
 * Build a resolver from a code → constant-name map (typically generated from Solidity).
 *
 * @example
 * ```ts
 * import { SHORT_STRING_ERROR_CODES } from "@example/generated/shortStringCodes.js";
 * const decoder = createDecoder({
 *   resolveShortStringMessage: createShortStringResolver(SHORT_STRING_ERROR_CODES),
 * });
 * ```
 */
export function createShortStringResolver(
	map: Readonly<Record<string, string>>,
): ShortStringResolveFn {
	return (message: string) => {
		const key = message.trim();
		return map[key] ?? null;
	};
}
