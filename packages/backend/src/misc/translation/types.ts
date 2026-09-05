/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type TranslationUsage = { inputTokens: number; outputTokens: number; totalTokens: number };

export type TranslationResult = {
	sourceLang: string;
	text: string;
	model?: string;
	usage?: TranslationUsage;
	cached?: boolean;
};

export function isTranslationUsage(value: unknown): value is TranslationUsage {
	return typeof value === 'object' && value !== null &&
		['inputTokens', 'outputTokens', 'totalTokens'].every(key => {
			const count = (value as Record<string, unknown>)[key];
			return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
		});
}
