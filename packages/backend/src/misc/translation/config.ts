/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Keep fork-specific configuration out of the database and public/admin meta.
export function getTranslationProvider(): string {
	return process.env.MISSKEY_TRANSLATION_PROVIDER?.trim() || 'deepl';
}

export function getOpenAiTranslationConfig(): { apiKey: string; projectId?: string } | null {
	const apiKey = process.env.OPENAI_API_KEY?.trim();
	if (!apiKey) return null;

	return {
		apiKey,
		projectId: process.env.OPENAI_PROJECT_ID?.trim() || undefined,
	};
}

export function isTranslationAvailable(deeplAuthKey: string | null): boolean {
	switch (getTranslationProvider()) {
		case 'deepl': return deeplAuthKey != null;
		case 'openai': return getOpenAiTranslationConfig() != null;
		default: return false;
	}
}
