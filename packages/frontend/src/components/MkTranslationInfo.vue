<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="translation.model || translation.usage || translation.cached" :class="$style.root" class="_selectable">
	<div v-if="translation.model">{{ i18n.tsx._openaiTranslation.usedModel({ model: translation.model }) }}</div>
	<div v-if="translation.usage">
		{{ i18n.tsx._openaiTranslation.tokenUsage({ input: number(translation.usage.inputTokens), output: number(translation.usage.outputTokens), total: number(translation.usage.totalTokens) }) }}
	</div>
	<div v-if="translation.cached">{{ translation.usage ? i18n.ts._openaiTranslation.cachedUsage : i18n.ts._openaiTranslation.cachedResult }}</div>
</div>
</template>

<script lang="ts" setup>
import type { entities } from 'misskey-js';
import { i18n } from '@/i18n.js';
import number from '@/filters/number.js';

defineProps<{
	translation: entities.NotesTranslateResponse;
}>();
</script>

<style lang="scss" module>
.root {
	margin-top: var(--MI-marginHalf);
	font-size: 0.8em;
	line-height: 1.5;
	color: color-mix(in srgb, var(--MI_THEME-fg) 75%, transparent);
	overflow-wrap: anywhere;
}
</style>
