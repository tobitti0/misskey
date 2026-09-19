/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, provide, ref } from 'vue';
import type { App } from 'vue';
import type { createRouter } from './lib/nirax/fixture.js';
import { preferState } from '../setup.unit.js';
import { PwaBackButton } from '@/utility/pwa-back-button.js';
import { DI } from '@/di.js';
import MkPageWindow from '@/components/MkPageWindow.vue';
import MkModal from '@/components/MkModal.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkLightbox from '@/components/MkLightbox.vue';

const { routers } = vi.hoisted(() => ({ routers: [] as ReturnType<typeof createRouter>[] }));

vi.mock('@/router.js', async () => {
	const fixture = await import('./lib/nirax/fixture.js');
	return {
		createRouter: (path: string) => {
			const router = fixture.createRouter(path);
			routers.push(router);
			return router;
		},
		mainRouter: fixture.createRouter('/'),
	};
});
vi.mock('@/components/global/RouterView.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/global/StackingRouterView.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/MkLightbox.item.vue', () => ({ default: { render: () => null } }));
vi.mock('@/utility/achievements.js', () => ({ claimAchievement: vi.fn() }));
vi.mock('@/utility/focus-trap.js', () => ({ focusTrap: () => ({ release: vi.fn() }) }));
vi.mock('@/os.js', async () => {
	const { ref } = await import('vue');
	let zIndex = 1000000;
	return { openingWindowsCount: ref(0), claimZIndex: () => ++zIndex, contextMenu: vi.fn() };
});

describe('PWA back integration with windows and modals', () => {
	let backButton: PwaBackButton;
	let watcher: EventTarget;
	let app: App;
	let root: HTMLElement;
	const showExit = vi.fn(() => vi.fn());

	beforeEach(() => {
		routers.length = 0;
		showExit.mockClear();
		preferState.animation = false;
		preferState['experimental.stackingRouterView'] = false;
		backButton = new PwaBackButton(() => {
			watcher = new EventTarget();
			return Object.assign(watcher, { destroy: () => {} });
		}, showExit);
		backButton.setAtRoot(true);
		root = window.document.createElement('div');
		window.document.body.append(root);
	});

	afterEach(() => {
		app?.unmount();
		backButton.dispose();
		root.remove();
		vi.restoreAllMocks();
	});

	function mountContent(content: () => ReturnType<typeof h>) {
		app = createApp(defineComponent({
			setup() {
				provide(DI.pwaBackButton, backButton);
				return content;
			},
		}));
		app.directive('tooltip', {});
		app.directive('hotkey', {});
		app.component('StackingRouterView', { render: () => null });
		app.mount(root);
	}

	async function pressBack() {
		watcher.dispatchEvent(new Event('close'));
		await nextTick();
	}

	test('system Back shares the page window history with the header Back button', async () => {
		mountContent(() => h(MkPageWindow, { initialPath: '/posts/1' }));
		const router = routers[0];
		router.pushByPath('/posts/2');
		router.pushByPath('/posts/3');
		await nextTick();

		root.querySelector<HTMLElement>('.ti-arrow-left')!.parentElement!.click();
		expect(router.getCurrentFullPath()).toBe('/posts/2');
		await pressBack();
		expect(router.getCurrentFullPath()).toBe('/posts/1');
		expect(root.querySelector('.ti-arrow-left')).toBeNull();
		expect(root.querySelector('.ti-x')).not.toBeNull();
		await pressBack();
		await vi.waitFor(() => expect(root.querySelector('.ti-x')).toBeNull());
		expect(showExit).not.toHaveBeenCalled();
		await pressBack();
		expect(showExit).toHaveBeenCalledOnce();
	});

	test('a replaced route is not added to the page window Back history', async () => {
		mountContent(() => h(MkPageWindow, { initialPath: '/posts/1' }));
		const router = routers[0];
		router.pushByPath('/posts/2');
		router.replaceByPath('/posts/3');
		await pressBack();
		expect(router.getCurrentFullPath()).toBe('/posts/1');
		await pressBack();
		await vi.waitFor(() => expect(root.querySelector('.ti-x')).toBeNull());
	});

	test('modal Back invokes the owner dismissal guard and keeps the underlying window open', async () => {
		const dismiss = vi.fn();
		const showModal = ref(false);
		mountContent(() => h('div', [
			h(MkPageWindow, { initialPath: '/posts/1' }),
			showModal.value ? h(MkModal, { preferType: 'dialog', onEsc: dismiss }, () => h('div', 'draft')) : null,
		]));
		routers[0].pushByPath('/posts/2');
		showModal.value = true;
		await nextTick();
		await pressBack();
		expect(dismiss).toHaveBeenCalledOnce();
		expect(routers[0].getCurrentFullPath()).toBe('/posts/2');
		expect(root.textContent).toContain('draft');
		expect(showExit).not.toHaveBeenCalled();
	});

	test('menus with no Escape handler receive their background dismissal event', async () => {
		const dismiss = vi.fn();
		mountContent(() => h(MkModal, { preferType: 'dialog', onClick: dismiss }, () => h('div')));
		await pressBack();
		expect(dismiss).toHaveBeenCalledOnce();
	});

	test('modal windows receive the same close request as their X button', async () => {
		const dismiss = vi.fn();
		mountContent(() => h(MkModalWindow, { onClose: dismiss }));
		await pressBack();
		expect(dismiss).toHaveBeenCalledOnce();
	});

	test('closing a lightbox in the PWA does not change browser history or navigate the window', async () => {
		const pushState = vi.spyOn(window.history, 'pushState');
		const historyBack = vi.spyOn(window.history, 'back');
		const showLightbox = ref(false);
		mountContent(() => h('div', [
			h(MkPageWindow, { initialPath: '/posts/1' }),
			showLightbox.value ? h(MkLightbox, { contents: [] }) : null,
		]));
		routers[0].pushByPath('/posts/2');
		showLightbox.value = true;
		await nextTick();
		await pressBack();
		expect(pushState).not.toHaveBeenCalled();
		expect(historyBack).not.toHaveBeenCalled();
		expect(routers[0].getCurrentFullPath()).toBe('/posts/2');
		await pressBack();
		expect(routers[0].getCurrentFullPath()).toBe('/posts/1');
	});
});
