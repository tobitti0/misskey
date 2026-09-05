/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { Redis } from 'ioredis';
import { withTranslationCache } from '@/misc/translation/cache.js';

describe('translation cache', () => {
	const redis = mockDeep<Redis>();
	const result = { sourceLang: 'EN', text: 'こんにちは\n🙂 https://example.com\n' };
	const translate = vi.fn(async () => result);
	const input = { noteId: 'note1', text: 'Hello', targetLang: 'ja-JP', provider: 'openai:gpt-5.4-mini' };
	const cache = new Map<string, string>();
	beforeEach(() => {
		cache.clear();
		vi.resetAllMocks();
		translate.mockResolvedValue(result);
		redis.get.mockImplementation(async (key) => cache.get(String(key)) ?? null);
		redis.set.mockImplementation(async (...args: unknown[]) => {
			cache.set(String(args[0]), String(args[1]));
			return 'OK';
		});
	});
	afterEach(() => vi.useRealTimers());

	it('reuses successful translations for seven days without extending the expiry on reads', async () => {
		await expect(withTranslationCache(redis, input, translate)).resolves.toEqual({ ...result, cached: false });
		await expect(withTranslationCache(redis, input, translate)).resolves.toEqual({ ...result, cached: true });
		expect(translate).toHaveBeenCalledTimes(1);
		expect(redis.set).toHaveBeenCalledTimes(1);
		expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^note-translation:v2:[a-f0-9]{64}$/), JSON.stringify(result), 'EX', 604800);
	});

	it.each([
		{ text: 'Edited text or CW' },
		{ targetLang: 'en-US' },
		{ provider: 'deepl:free' },
		{ noteId: 'note2' },
	])('separates cached results for %j', async (change) => {
		await withTranslationCache(redis, input, translate);
		await withTranslationCache(redis, { ...input, ...change }, translate);
		expect(translate).toHaveBeenCalledTimes(2);
	});

	it('retranslates after expiry or eviction', async () => {
		await withTranslationCache(redis, input, translate);
		cache.clear();
		await withTranslationCache(redis, input, translate);
		expect(translate).toHaveBeenCalledTimes(2);
	});

	it.each(['invalid JSON', 'null', '{"text":123}', '{"sourceLang":"EN","text":" "}'])('replaces corrupt entries: %s', async (cached) => {
		redis.get.mockResolvedValueOnce(cached);
		await expect(withTranslationCache(redis, input, translate)).resolves.toEqual({ ...result, cached: false });
		expect(translate).toHaveBeenCalledTimes(1);
	});

	it('returns translations when Redis reads and writes fail', async () => {
		redis.get.mockRejectedValue(new Error('offline'));
		redis.set.mockRejectedValue(new Error('offline'));
		await expect(withTranslationCache(redis, input, translate)).resolves.toEqual({ ...result, cached: false });
	});

	it('bounds the wait when Redis never settles', async () => {
		vi.useFakeTimers();
		redis.get.mockImplementation(() => new Promise(() => {}));
		redis.set.mockImplementation(() => new Promise(() => {}));
		const pending = withTranslationCache(redis, input, translate);
		await vi.advanceTimersByTimeAsync(2000);
		await expect(pending).resolves.toEqual({ ...result, cached: false });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('does not cache errors or empty translations', async () => {
		translate.mockRejectedValueOnce(new Error('upstream failure'));
		await expect(withTranslationCache(redis, input, translate)).rejects.toThrow('upstream failure');
		translate.mockResolvedValueOnce({ sourceLang: 'unknown', text: '' });
		await withTranslationCache(redis, input, translate);
		expect(redis.set).not.toHaveBeenCalled();
	});
});
