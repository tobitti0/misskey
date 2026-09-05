/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/no-default-export */
import type { StoryObj } from '@storybook/vue3';
import MkTranslationInfo from './MkTranslationInfo.vue';

export const Default = {
	render(args) {
		return {
			components: { MkTranslationInfo },
			setup() {
				return { args };
			},
			template: '<MkTranslationInfo v-bind="args"/>',
		};
	},
	args: {
		translation: {
			sourceLang: 'unknown', text: '', model: 'gpt-5.4-mini',
			usage: { inputTokens: 155, outputTokens: 26, totalTokens: 181 },
			cached: false,
		},
	},
	parameters: { layout: 'padded' },
} satisfies StoryObj<typeof MkTranslationInfo>;

export const Cached = {
	...Default,
	args: { translation: { ...Default.args.translation, cached: true } },
} satisfies StoryObj<typeof MkTranslationInfo>;

export const CachedDeepL = {
	...Default,
	args: { translation: { sourceLang: 'EN', text: '', cached: true } },
} satisfies StoryObj<typeof MkTranslationInfo>;

export const WithoutUsage = {
	...Default,
	args: { translation: { sourceLang: 'EN', text: '' } },
} satisfies StoryObj<typeof MkTranslationInfo>;
