/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, nextTick, onMounted, onScopeDispose, watch } from 'vue';
import type { BackButtonTarget } from '@/utility/pwa-back-button.js';
import { DI } from '@/di.js';

/** Returns whether platform Back is managed by the enclosing PWA deck. */
export function usePwaBackButton(visible: () => boolean, target: BackButtonTarget): boolean {
	const backButton = inject(DI.pwaBackButton, null);
	if (backButton == null) return false;

	let unregister: (() => void) | undefined;
	watch(visible, showing => {
		unregister?.();
		unregister = showing ? backButton.register(target) : undefined;
	}, { immediate: true, flush: 'sync' });
	// Window stacking order is assigned during mounting, after registration.
	onMounted(() => { void nextTick(backButton.reset); });
	onScopeDispose(() => unregister?.());
	return true;
}
