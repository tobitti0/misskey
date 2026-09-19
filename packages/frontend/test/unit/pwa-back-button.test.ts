/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createApp, defineComponent, h, provide, ref } from 'vue';
import { getPwaCloseWatcher, PwaBackButton } from '@/utility/pwa-back-button.js';
import { usePwaBackButton } from '@/composables/use-pwa-back-button.js';
import { DI } from '@/di.js';

describe('PWA deck back button', () => {
	let activeWatchers: Set<FakeCloseWatcher>;
	class FakeCloseWatcher extends EventTarget {
		constructor() {
			super();
			activeWatchers.add(this);
		}

		destroy() {
			activeWatchers.delete(this);
		}

		requestPlatformClose() {
			this.destroy();
			this.dispatchEvent(new Event('close'));
		}
	}

	let backButton: PwaBackButton;
	let showExit: Mock<() => () => void>;
	let dismissExit: Mock<() => void>;
	const nativeBack = vi.fn();
	function pressBack() {
		expect(activeWatchers.size).toBeLessThanOrEqual(1);
		const watcher = [...activeWatchers][0];
		if (watcher) watcher.requestPlatformClose();
		else nativeBack();
	}

	beforeEach(() => {
		vi.useFakeTimers();
		activeWatchers = new Set();
		dismissExit = vi.fn();
		showExit = vi.fn(() => dismissExit);
		nativeBack.mockClear();
		backButton = new PwaBackButton(() => new FakeCloseWatcher(), showExit);
		backButton.setAtRoot(true);
	});

	afterEach(() => {
		backButton.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test('walks window history, closes the window, then requires two more backs to leave', () => {
		const paths = ['/profile', '/note/1', '/note/2'];
		const closeWindow = vi.fn();
		const unregister = backButton.register({
			getZIndex: () => 100,
			back: () => {
				if (paths.length > 1) paths.pop();
				else {
					closeWindow();
					unregister();
				}
			},
		});

		pressBack();
		expect(paths.at(-1)).toBe('/note/1');
		pressBack();
		expect(paths.at(-1)).toBe('/profile');
		pressBack();
		expect(closeWindow).toHaveBeenCalledOnce();
		expect(showExit).not.toHaveBeenCalled();
		expect(nativeBack).not.toHaveBeenCalled();
		pressBack();
		expect(showExit).toHaveBeenCalledOnce();
		expect(nativeBack).not.toHaveBeenCalled();
		pressBack();
		expect(nativeBack).toHaveBeenCalledOnce();
	});

	test('uses the current stacking order and handles only one surface per back', () => {
		let firstZIndex = 100;
		const firstBack = vi.fn();
		const secondBack = vi.fn();
		backButton.register({ getZIndex: () => firstZIndex, back: firstBack });
		const removeSecond = backButton.register({ getZIndex: () => 200, back: secondBack });
		pressBack();
		expect(secondBack).toHaveBeenCalledOnce();
		expect(firstBack).not.toHaveBeenCalled();
		firstZIndex = 300;
		pressBack();
		expect(firstBack).toHaveBeenCalledOnce();
		removeSecond();
		pressBack();
		expect(firstBack).toHaveBeenCalledTimes(2);
		expect(showExit).not.toHaveBeenCalled();
	});

	test('dismissing an overlay does not navigate the window below it', () => {
		const windowBack = vi.fn();
		backButton.register({ getZIndex: () => 100, back: windowBack });
		const closeOverlay = vi.fn(() => removeOverlay());
		const removeOverlay = backButton.register({ getZIndex: () => 300, back: closeOverlay });
		pressBack();
		expect(closeOverlay).toHaveBeenCalledOnce();
		expect(windowBack).not.toHaveBeenCalled();
		pressBack();
		expect(windowBack).toHaveBeenCalledOnce();
	});

	test('a browser-history window lets native Back through even above another native window', () => {
		const lowerWindow = vi.fn();
		const pageWindow = vi.fn();
		backButton.register({ getZIndex: () => 100, back: lowerWindow });
		const removePage = backButton.register({ getZIndex: () => 200, back: pageWindow, usesBrowserHistory: true });
		pressBack();
		expect(nativeBack).toHaveBeenCalledOnce();
		expect(lowerWindow).not.toHaveBeenCalled();
		expect(pageWindow).not.toHaveBeenCalled();
		const overlay = vi.fn(() => removeOverlay());
		const removeOverlay = backButton.register({ getZIndex: () => 300, back: overlay });
		pressBack();
		expect(overlay).toHaveBeenCalledOnce();
		pressBack();
		expect(nativeBack).toHaveBeenCalledTimes(2);
		removePage();
		pressBack();
		expect(lowerWindow).toHaveBeenCalledOnce();
	});

	test('a canceled dismissal leaves the target registered and never triggers exit', () => {
		const requestDismissal = vi.fn();
		backButton.register({ getZIndex: () => 300, back: requestDismissal });
		pressBack();
		pressBack();
		expect(requestDismissal).toHaveBeenCalledTimes(2);
		expect(showExit).not.toHaveBeenCalled();
		expect(nativeBack).not.toHaveBeenCalled();
	});

	test('rearms the exit confirmation after two seconds', () => {
		pressBack();
		vi.advanceTimersByTime(1999);
		expect(activeWatchers.size).toBe(0);
		vi.advanceTimersByTime(1);
		expect(dismissExit).toHaveBeenCalledOnce();
		pressBack();
		expect(showExit).toHaveBeenCalledTimes(2);
		expect(nativeBack).not.toHaveBeenCalled();
	});

	test('interaction or app resume cancels the pending exit', () => {
		pressBack();
		backButton.reset();
		expect(dismissExit).toHaveBeenCalledOnce();
		pressBack();
		expect(showExit).toHaveBeenCalledTimes(2);
		expect(nativeBack).not.toHaveBeenCalled();
	});

	test('opening a window cancels pending exit, including after it is closed with X', () => {
		pressBack();
		const unregister = backButton.register({ getZIndex: () => 100, back: vi.fn() });
		expect(dismissExit).toHaveBeenCalledOnce();
		unregister();
		pressBack();
		expect(showExit).toHaveBeenCalledTimes(2);
		expect(nativeBack).not.toHaveBeenCalled();
	});

	test('leaves main-column navigation to the browser when no overlay remains', () => {
		backButton.setAtRoot(false);
		pressBack();
		expect(nativeBack).toHaveBeenCalledOnce();
		const unregister = backButton.register({ getZIndex: () => 100, back: () => unregister() });
		pressBack();
		expect(nativeBack).toHaveBeenCalledOnce();
		pressBack();
		expect(nativeBack).toHaveBeenCalledTimes(2);
		expect(showExit).not.toHaveBeenCalled();
	});

	test('disposing clears the watcher and exit timer', () => {
		pressBack();
		backButton.dispose();
		vi.advanceTimersByTime(3000);
		expect(dismissExit).toHaveBeenCalledOnce();
		expect(activeWatchers.size).toBe(0);
	});

	test('the composable unregisters immediately on hide and on unmount', () => {
		const showing = ref(true);
		const onBack = vi.fn(() => { showing.value = false; });
		const Child = defineComponent({
			setup() {
				expect(usePwaBackButton(() => showing.value, { getZIndex: () => 100, back: onBack })).toBe(true);
				return () => h('div');
			},
		});
		const app = createApp(defineComponent({
			setup() {
				provide(DI.pwaBackButton, backButton);
				return () => h(Child);
			},
		}));
		app.mount(window.document.createElement('div'));
		pressBack();
		expect(onBack).toHaveBeenCalledOnce();
		pressBack();
		expect(showExit).toHaveBeenCalledOnce();
		showing.value = true;
		app.unmount();
		pressBack();
		expect(onBack).toHaveBeenCalledOnce();
		expect(showExit).toHaveBeenCalledTimes(2);
	});

	test('requires Android, standalone display mode, and CloseWatcher support', () => {
		const userAgent = vi.spyOn(window.navigator, 'userAgent', 'get');
		const matchMedia = vi.spyOn(window, 'matchMedia');
		vi.stubGlobal('CloseWatcher', FakeCloseWatcher);
		userAgent.mockReturnValue('Mozilla/5.0 (Linux; Android 15)');
		matchMedia.mockReturnValue({ matches: true } as MediaQueryList);
		expect(getPwaCloseWatcher()).toBe(FakeCloseWatcher);
		matchMedia.mockReturnValue({ matches: false } as MediaQueryList);
		expect(getPwaCloseWatcher()).toBeNull();
		matchMedia.mockReturnValue({ matches: true } as MediaQueryList);
		userAgent.mockReturnValue('Mozilla/5.0 (Macintosh)');
		expect(getPwaCloseWatcher()).toBeNull();
		userAgent.mockReturnValue('Mozilla/5.0 (Linux; Android 15)');
		vi.stubGlobal('CloseWatcher', undefined);
		expect(getPwaCloseWatcher()).toBeNull();
	});
});
