/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { Response } from 'node-fetch';
import type { Redis } from 'ioredis';
import Translate from '@/server/api/endpoints/notes/translate.js';
import type { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import type { GetterService } from '@/server/api/GetterService.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { RoleService } from '@/core/RoleService.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiMeta, MiNote } from '@/models/_.js';

vi.mock('@/core/entities/NoteEntityService.js', () => ({ NoteEntityService: class {} }));
vi.mock('@/server/api/GetterService.js', () => ({ GetterService: class {} }));
vi.mock('@/core/HttpRequestService.js', () => ({ HttpRequestService: class {} }));
vi.mock('@/core/RoleService.js', () => ({ RoleService: class {} }));
vi.mock('@/models/_.js', () => ({ MiMeta: class {} }));

describe('notes/translate', () => {
	const user = mockDeep<MiLocalUser>({ id: 'user1' });
	let settings: MiMeta;
	let notes: ReturnType<typeof mockDeep<NoteEntityService>>;
	let getter: ReturnType<typeof mockDeep<GetterService>>;
	let http: ReturnType<typeof mockDeep<HttpRequestService>>;
	let roles: ReturnType<typeof mockDeep<RoleService>>;
	let endpoint: Translate;
	let redis: ReturnType<typeof mockDeep<Redis>>;
	const exec = () => endpoint.exec({ noteId: 'note1', targetLang: 'ja-JP' }, user, null);

	beforeEach(() => {
		vi.stubEnv('MISSKEY_TRANSLATION_PROVIDER', '');
		vi.stubEnv('OPENAI_API_KEY', 'test-key');
		vi.stubEnv('OPENAI_PROJECT_ID', '');
		settings = mockDeep<MiMeta>({ deeplAuthKey: 'deepl-key', deeplIsPro: false, openaiTranslationModel: 'gpt-5.4-mini' });
		notes = mockDeep<NoteEntityService>();
		getter = mockDeep<GetterService>();
		http = mockDeep<HttpRequestService>();
		roles = mockDeep<RoleService>();
		roles.getUserPolicies.mockResolvedValue({ canUseTranslator: true } as Awaited<ReturnType<RoleService['getUserPolicies']>>);
		notes.isVisibleForMe.mockResolvedValue(true);
		getter.getNote.mockResolvedValue(mockDeep<MiNote>({ id: 'note1', text: 'Hello', cw: 'Warning' }));
		http.send.mockImplementation(async () => new Response(JSON.stringify({
			translations: [{ detected_source_language: 'EN', text: '注意\n-----\nこんにちは' }],
		})));
		redis = mockDeep<Redis>();
		const cache = new Map<string, string>();
		redis.get.mockImplementation(async (key) => cache.get(String(key)) ?? null);
		redis.set.mockImplementation(async (...args: unknown[]) => {
			cache.set(String(args[0]), String(args[1]));
			return 'OK';
		});
		endpoint = new Translate(settings, redis, notes, getter, http, roles);
	});
	afterEach(() => vi.unstubAllEnvs());

	it.each([false, true])('retains the DeepL request and response (Pro=%s)', async (pro) => {
		settings.deeplIsPro = pro;
		await expect(exec()).resolves.toEqual({ sourceLang: 'EN', text: '注意\n-----\nこんにちは', cached: false });
		const [url, request] = http.send.mock.calls[0];
		expect(url).toBe(pro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate');
		expect(request?.headers?.Authorization).toBe('DeepL-Auth-Key deepl-key');
		const params = new URLSearchParams(request?.body as string);
		expect(params.get('text')).toBe('Warning\n-----\nHello');
		expect(params.get('target_lang')).toBe('ja');
	});

	it('uses OpenAI without a DeepL key when explicitly selected', async () => {
		vi.stubEnv('MISSKEY_TRANSLATION_PROVIDER', 'openai');
		settings.deeplAuthKey = null;
		http.send.mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{
			type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '注意\n-----\nこんにちは' }],
		}] })));
		await expect(exec()).resolves.toEqual({ sourceLang: 'unknown', text: '注意\n-----\nこんにちは', model: 'gpt-5.4-mini', cached: false });
		expect(http.send.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
		expect(JSON.parse(http.send.mock.calls[0][1]?.body as string).input).toBe('Warning\n-----\nHello');
	});

	it('caches usage and starts a new translation when the model setting changes', async () => {
		vi.stubEnv('MISSKEY_TRANSLATION_PROVIDER', 'openai');
		http.send.mockImplementation(async () => new Response(JSON.stringify({
			status: 'completed', model: settings.openaiTranslationModel,
			output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'こんにちは' }] }],
			usage: { input_tokens: 55, output_tokens: 26, total_tokens: 81 },
		})));
		await expect(exec()).resolves.toMatchObject({ cached: false, usage: { totalTokens: 81 } });
		await expect(exec()).resolves.toMatchObject({ cached: true, usage: { totalTokens: 81 } });
		expect(http.send).toHaveBeenCalledTimes(1);
		settings.openaiTranslationModel = 'custom-model';
		await expect(exec()).resolves.toMatchObject({ cached: false, model: 'custom-model' });
		expect(http.send).toHaveBeenCalledTimes(2);
	});

	it.each(['deepl', 'openai'])('enforces policy and visibility before sending to %s', async (provider) => {
		vi.stubEnv('MISSKEY_TRANSLATION_PROVIDER', provider);
		roles.getUserPolicies.mockResolvedValueOnce({ canUseTranslator: false } as Awaited<ReturnType<RoleService['getUserPolicies']>>);
		await expect(exec()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		notes.isVisibleForMe.mockResolvedValue(false);
		await expect(exec()).rejects.toMatchObject({ code: 'CANNOT_TRANSLATE_INVISIBLE_NOTE' });
		expect(http.send).not.toHaveBeenCalled();
	});

	it('reuses a translation but checks visibility, policy and note existence on every request', async () => {
		await exec();
		await exec();
		expect(http.send).toHaveBeenCalledTimes(1);
		notes.isVisibleForMe.mockResolvedValueOnce(false);
		await expect(exec()).rejects.toMatchObject({ code: 'CANNOT_TRANSLATE_INVISIBLE_NOTE' });
		roles.getUserPolicies.mockResolvedValueOnce({ canUseTranslator: false } as Awaited<ReturnType<RoleService['getUserPolicies']>>);
		await expect(exec()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		getter.getNote.mockRejectedValueOnce({ id: '9725d0ce-ba28-4dde-95a7-2cbb2c15de24' });
		await expect(exec()).rejects.toMatchObject({ code: 'NO_SUCH_NOTE' });
		expect(http.send).toHaveBeenCalledTimes(1);
	});

	it('preserves missing-note and empty-note behavior', async () => {
		getter.getNote.mockRejectedValueOnce({ id: '9725d0ce-ba28-4dde-95a7-2cbb2c15de24' });
		await expect(exec()).rejects.toMatchObject({ code: 'NO_SUCH_NOTE' });
		getter.getNote.mockResolvedValue(mockDeep<MiNote>({ text: null, cw: null }));
		await expect(exec()).resolves.toBeUndefined();
		expect(http.send).not.toHaveBeenCalled();
	});

	it('fails closed for missing credentials and unknown providers', async () => {
		vi.stubEnv('MISSKEY_TRANSLATION_PROVIDER', 'openai');
		vi.stubEnv('OPENAI_API_KEY', '');
		await expect(exec()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		vi.stubEnv('MISSKEY_TRANSLATION_PROVIDER', 'typo');
		await expect(exec()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
		expect(http.send).not.toHaveBeenCalled();
	});

	it('returns a sanitized error without falling back to DeepL', async () => {
		vi.stubEnv('MISSKEY_TRANSLATION_PROVIDER', 'openai');
		http.send.mockRejectedValue(new Error('private upstream data'));
		await expect(exec()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
		expect(http.send).toHaveBeenCalledTimes(1);
	});
});
