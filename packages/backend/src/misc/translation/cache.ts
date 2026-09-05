/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { isTranslationUsage } from './types.js';
import type { TranslationResult } from './types.js';

async function withCacheTimeout<T>(operation: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('Translation cache timed out.')), 1000);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

export async function withTranslationCache(
	redis: Pick<Redis, 'get' | 'set'>,
	input: { noteId: string; text: string; targetLang: string; provider: string },
	translate: () => Promise<TranslationResult>,
): Promise<TranslationResult> {
	// Bump the version when changing translation instructions or response semantics.
	// Include note identity and its current content so edits never reuse an old result.
	const hash = createHash('sha256').update(JSON.stringify([
		input.noteId, input.text, input.targetLang.toLowerCase(), input.provider,
	])).digest('hex');
	const key = `note-translation:v2:${hash}`;
	try {
		const cached = await withCacheTimeout(redis.get(key));
		if (cached != null) {
			const value: unknown = JSON.parse(cached);
			if (typeof value === 'object' && value !== null &&
				'sourceLang' in value && typeof value.sourceLang === 'string' &&
				'text' in value && typeof value.text === 'string' && value.text.trim() &&
				(!('model' in value) || typeof value.model === 'string') &&
				(!('usage' in value) || isTranslationUsage(value.usage))) {
				return { ...(value as TranslationResult), cached: true };
			}
		}
	} catch {
		// Cache corruption or temporary Redis failures must not prevent translation.
	}

	const result = await translate();
	if (result.text.trim()) {
		try {
			await withCacheTimeout(redis.set(key, JSON.stringify(result), 'EX', 60 * 60 * 24 * 7));
		} catch {
			// A successful translation remains usable if caching fails.
		}
	}
	return { ...result, cached: false };
}
