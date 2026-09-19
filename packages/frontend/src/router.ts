/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject } from 'vue';
import { page } from '@/router.definition.js';
import { $i } from '@/i.js';
import { Nirax } from '@/lib/nirax.js';
import { ROUTE_DEF } from '@/router.definition.js';
import { analytics } from '@/analytics.js';
import { DI } from '@/di.js';
import type { DeckWindowHistory } from '@/utility/deck-window-history.js';

export type Router = Nirax<typeof ROUTE_DEF>;

export function createRouter(fullPath: string): Router {
	return new Nirax(ROUTE_DEF, fullPath, !!$i, page(() => import('@/pages/not-found.vue')));
}

export const mainRouter = createRouter(window.location.pathname + window.location.search + window.location.hash);

let deckWindowHistory: DeckWindowHistory | null = null;
let restoringHistory = false;

export function setDeckWindowHistory(history: DeckWindowHistory | null) {
	deckWindowHistory = history;
}

window.addEventListener('popstate', (event) => {
	const path = window.location.pathname + window.location.search + window.location.hash;
	if (deckWindowHistory?.restore(event.state, path)) return;
	if (path === mainRouter.getCurrentFullPath()) return;
	restoringHistory = true;
	try {
		mainRouter.replaceByPath(path);
	} finally {
		restoringHistory = false;
	}
});

mainRouter.addListener('push', ctx => {
	if (deckWindowHistory) deckWindowHistory.pushRoute(ctx.fullPath);
	else window.history.pushState({ }, '', ctx.fullPath);
});

mainRouter.addListener('replace', ctx => {
	// popstate already selected the right entry; only rewrite a resolved redirect.
	if (restoringHistory && ctx.fullPath === window.location.pathname + window.location.search + window.location.hash) return;
	if (deckWindowHistory) deckWindowHistory.replaceRoute(ctx.fullPath);
	else window.history.replaceState(restoringHistory ? window.history.state : {}, '', ctx.fullPath);
});

mainRouter.addListener('forceReplace', ctx => {
	window.location.replace(ctx.fullPath);
});

mainRouter.addListener('forcePush', ctx => {
	window.location.href = ctx.fullPath;
});

mainRouter.addListener('change', ctx => {
	if (_DEV_) console.log('mainRouter: change', ctx.fullPath);
	analytics.page({
		path: ctx.fullPath,
		title: ctx.fullPath,
	});
});

mainRouter.init();

export function useRouter(): Router {
	return inject(DI.router, null) ?? mainRouter;
}
