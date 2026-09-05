/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiMeta } from '@/models/Meta.js';

type TranslationSettings = Pick<MiMeta, 'translationProvider' | 'openaiApiKey' | 'deeplAuthKey'>;

export function getTranslationProvider(settings: TranslationSettings): string {
	return process.env.MISSKEY_TRANSLATION_PROVIDER?.trim() || settings.translationProvider;
}

export function getOpenAiTranslationConfig(settings: TranslationSettings): { apiKey: string; projectId?: string } | null {
	const apiKey = process.env.OPENAI_API_KEY?.trim() || settings.openaiApiKey?.trim();
	if (!apiKey) return null;

	return {
		apiKey,
		projectId: process.env.OPENAI_PROJECT_ID?.trim() || undefined,
	};
}

export function isTranslationAvailable(settings: TranslationSettings): boolean {
	switch (getTranslationProvider(settings)) {
		case 'deepl': return settings.deeplAuthKey != null;
		case 'openai': return getOpenAiTranslationConfig(settings) != null;
		default: return false;
	}
}
