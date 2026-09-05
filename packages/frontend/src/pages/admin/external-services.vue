<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/external-services" :label="i18n.ts.externalServices" :keywords="['external', 'services', 'thirdparty']" icon="ti ti-link">
			<div class="_gaps_m">
				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Google Analytics</SearchLabel><span class="_beta">{{ i18n.ts.beta }}</span></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="googleAnalyticsMeasurementId">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Measurement ID</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<MkButton primary @click="save_googleAnalytics">Save</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>DeepL Translation</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="deeplAuthKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Auth Key</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="deeplIsPro">
									<template #label><SearchLabel>Pro account</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<MkButton primary @click="save_deepl">Save</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['translation', 'provider']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._openaiTranslation.provider }}</SearchLabel></template>
						<div class="_gaps_m">
							<MkSelect v-model="translationProvider" :items="translationProviders">
								<template #label>{{ i18n.ts._openaiTranslation.provider }}</template>
							</MkSelect>
							<MkInfo v-if="meta.translationProviderOverride">{{ i18n.tsx._openaiTranslation.providerOverride({ provider: meta.translationProviderOverride }) }}</MkInfo>
							<MkButton primary @click="save_translationProvider">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['openai', 'translation', 'model', 'key']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>{{ i18n.ts._openaiTranslation.title }}</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="openaiApiKey" type="password" autocomplete="new-password" :spellcheck="false" autocapitalize="off" :disabled="clearOpenaiApiKey">
									<template #label><SearchLabel>{{ i18n.ts._openaiTranslation.apiKey }}</SearchLabel></template>
									<template #caption>{{ openaiApiKeyConfigured ? i18n.ts._openaiTranslation.keyConfigured : i18n.ts._openaiTranslation.keyNotConfigured }}</template>
								</MkInput>
							</SearchMarker>
							<MkSwitch v-if="openaiApiKeyConfigured" v-model="clearOpenaiApiKey">{{ i18n.ts._openaiTranslation.clearKey }}</MkSwitch>
							<MkInfo v-if="meta.openaiApiKeyOverride">{{ i18n.ts._openaiTranslation.keyOverride }}</MkInfo>
							<SearchMarker>
								<MkInput v-model="openaiTranslationModel" :spellcheck="false" autocapitalize="off">
									<template #label><SearchLabel>{{ i18n.ts._openaiTranslation.model }}</SearchLabel></template>
									<template #caption>{{ i18n.ts._openaiTranslation.modelDescription }}</template>
								</MkInput>
							</SearchMarker>
							<MkInfo>{{ i18n.ts._openaiTranslation.environmentDescription }}</MkInfo>
							<MkButton primary :disabled="!isOpenaiTranslationModelValid" @click="save_openai">{{ i18n.ts.save }}</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';

const meta = await misskeyApi('admin/meta');

const deeplAuthKey = ref(meta.deeplAuthKey ?? '');
const deeplIsPro = ref(meta.deeplIsPro);
const translationProvider = ref(meta.translationProvider);
const translationProviders = [
	{ value: 'deepl' as const, label: 'DeepL' },
	{ value: 'openai' as const, label: 'OpenAI' },
];
const openaiApiKey = ref('');
const openaiApiKeyConfigured = ref(meta.openaiApiKeyConfigured);
const clearOpenaiApiKey = ref(false);
const openaiTranslationModel = ref(meta.openaiTranslationModel);
const isOpenaiTranslationModelValid = computed(() => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(openaiTranslationModel.value));
const googleAnalyticsMeasurementId = ref(meta.googleAnalyticsMeasurementId ?? '');

function save_deepl() {
	os.apiWithDialog('admin/update-meta', {
		deeplAuthKey: deeplAuthKey.value,
		deeplIsPro: deeplIsPro.value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_googleAnalytics() {
	os.apiWithDialog('admin/update-meta', {
		googleAnalyticsMeasurementId: googleAnalyticsMeasurementId.value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_translationProvider() {
	os.apiWithDialog('admin/update-meta', {
		translationProvider: translationProvider.value,
	}).then(() => {
		fetchInstance(true);
	});
}

async function save_openai() {
	if (!isOpenaiTranslationModelValid.value) return;
	const key = clearOpenaiApiKey.value ? null : openaiApiKey.value.trim() || undefined;
	await os.apiWithDialog('admin/update-meta', {
		openaiTranslationModel: openaiTranslationModel.value,
		...(key !== undefined ? { openaiApiKey: key } : {}),
	});
	if (key !== undefined) openaiApiKeyConfigured.value = key !== null;
	openaiApiKey.value = '';
	clearOpenaiApiKey.value = false;
	fetchInstance(true);
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.externalServices,
	icon: 'ti ti-link',
}));
</script>
