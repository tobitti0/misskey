/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { mainRouter, setDeckWindowHistory } from '@/router.js';
import { DeckWindowHistory } from '@/utility/deck-window-history.js';

vi.mock('@/router.definition.js', async () => {
	const fixture = await import('./lib/nirax/fixture.js');
	return { ROUTE_DEF: fixture.routes, page: () => fixture.notFoundRouteComponent };
});
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/analytics.js', () => ({ analytics: { page: vi.fn() } }));

let controller: DeckWindowHistory;
afterEach(() => {
	setDeckWindowHistory(null);
	controller.dispose();
});

test('main-column and window history coexist without erasing browser state on popstate', async () => {
	mainRouter.replaceByPath('/');
	controller = new DeckWindowHistory(window.history, '/', vi.fn());
	setDeckWindowHistory(controller);
	const restore = vi.fn();
	controller.register(['/posts/1'], { restore, close: vi.fn() });
	const windowState = window.history.state;
	mainRouter.pushByPath('/posts/2');
	const mainState = window.history.state;
	window.history.back();
	await vi.waitFor(() => expect(mainRouter.getCurrentFullPath()).toBe('/'));
	await vi.waitFor(() => expect(restore).toHaveBeenCalledWith(['/posts/1']));
	expect(window.history.state).toEqual(windowState);
	window.history.forward();
	await vi.waitFor(() => expect(mainRouter.getCurrentFullPath()).toBe('/posts/2'));
	expect(window.history.state).toEqual(mainState);
});

test('same-URL window Back leaves the main route alone and preserves the forward entry', async () => {
	mainRouter.replaceByPath('/');
	controller = new DeckWindowHistory(window.history, '/', vi.fn());
	setDeckWindowHistory(controller);
	const restore = vi.fn();
	const binding = controller.register(['/posts/1'], { restore, close: vi.fn() });
	const initial = window.history.state;
	const replace = vi.spyOn(mainRouter, 'replaceByPath');
	binding.push(['/posts/1', '/posts/2']);
	const next = window.history.state;
	window.history.back();
	await vi.waitFor(() => expect(restore).toHaveBeenLastCalledWith(['/posts/1']));
	expect(window.history.state).toEqual(initial);
	expect(replace).not.toHaveBeenCalled();
	window.history.forward();
	await vi.waitFor(() => expect(restore).toHaveBeenLastCalledWith(['/posts/1', '/posts/2']));
	expect(window.history.state).toEqual(next);
	replace.mockRestore();
});
