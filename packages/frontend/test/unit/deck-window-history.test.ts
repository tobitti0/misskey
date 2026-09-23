/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { DeckWindowHistory } from '@/utility/deck-window-history.js';

function setup() {
	const entries: { state: unknown; url: string }[] = [{ state: { unrelated: true }, url: '/' }];
	let index = 0;
	const pending: number[] = [];
	const history = {
		get state() { return entries[index].state; },
		pushState: vi.fn((state: unknown, _: string, url?: string | URL | null) => {
			entries.splice(++index, Infinity, { state: structuredClone(state), url: String(url) });
		}),
		replaceState: vi.fn((state: unknown, _: string, url?: string | URL | null) => {
			entries[index] = { state: structuredClone(state), url: String(url) };
		}),
		go: vi.fn((delta = 0) => pending.push(delta)),
	};
	const visible = new Map<number, { paths: string[]; binding: ReturnType<DeckWindowHistory['register']> }>();
	let nextId = 0;
	const changed = vi.fn();
	const controller = new DeckWindowHistory(history, '/', state => mount(state.paths, state.id), changed);
	function mount(paths: string[], restoredId?: number) {
		const id = restoredId ?? nextId++;
		const view = { paths: [...paths], binding: undefined as unknown as ReturnType<DeckWindowHistory['register']> };
		view.binding = controller.register(paths, {
			restore: value => { view.paths = [...value]; },
			close: () => { view.binding?.close(); visible.delete(id); },
		}, restoredId);
		visible.set(id, view);
		return {
			id,
			push(path: string) { view.paths.push(path); view.binding.push(view.paths); },
			replace(path: string) { view.paths[view.paths.length - 1] = path; view.binding.replace(view.paths); },
			back() { view.binding.back(); },
			close() { view.binding.close(); visible.delete(id); },
		};
	}
	function flush() {
		let limit = 20;
		while (pending.length > 0) {
			if (--limit === 0) throw new Error('History traversal did not settle');
			const next = index + pending.shift()!;
			if (next < 0 || next >= entries.length) continue;
			index = next;
			controller.restore(history.state, entries[index].url);
		}
	}
	function go(delta: number) { history.go(delta); flush(); }
	return { controller, history, visible, mount, go, flush, entries, changed, get index() { return index; } };
}

describe('deck browser window history', () => {
	test('Back traverses window routes, closes the window, and Forward restores it without pushing', () => {
		const s = setup();
		const window = s.mount(['/posts/1']);
		window.push('/posts/2');
		window.push('/posts/3');
		s.go(-1);
		expect(s.visible.get(window.id)?.paths).toEqual(['/posts/1', '/posts/2']);
		s.go(-1);
		expect(s.visible.get(window.id)?.paths).toEqual(['/posts/1']);
		s.go(-1);
		expect(s.visible.size).toBe(0);
		expect(s.changed).toHaveBeenLastCalledWith(false);
		s.go(1);
		expect(s.visible.get(window.id)?.paths).toEqual(['/posts/1']);
		s.go(1);
		expect(s.visible.get(window.id)?.paths).toEqual(['/posts/1', '/posts/2']);
		expect(s.history.pushState).toHaveBeenCalledTimes(3);
		expect(s.history.state).toMatchObject({ unrelated: true });
	});

	test('multiple windows and a main-column route follow chronological browser history', () => {
		const s = setup();
		const a = s.mount(['/posts/1']);
		const b = s.mount(['/posts/2']);
		b.push('/posts/3');
		s.controller.pushRoute('/settings');
		s.go(-1);
		expect(s.entries[s.index].url).toBe('/');
		expect(s.visible.get(b.id)?.paths).toEqual(['/posts/2', '/posts/3']);
		s.go(-1);
		expect(s.visible.get(b.id)?.paths).toEqual(['/posts/2']);
		s.go(-1);
		expect([...s.visible.keys()]).toEqual([a.id]);
		s.go(-1);
		expect(s.visible.size).toBe(0);
	});

	test('route replacement and header Back share browser entries', () => {
		const s = setup();
		const w = s.mount(['/posts/1']);
		w.push('/posts/2');
		w.replace('/posts/3');
		w.back();
		s.flush();
		expect(s.visible.get(w.id)?.paths).toEqual(['/posts/1']);
		s.go(1);
		expect(s.visible.get(w.id)?.paths).toEqual(['/posts/1', '/posts/3']);
		expect(s.entries).toHaveLength(3);
	});

	test('header Back in an older window does not close a newer window', () => {
		const s = setup();
		const a = s.mount(['/posts/1']);
		a.push('/posts/2');
		const b = s.mount(['/posts/3']);
		a.back();
		s.flush();
		expect(s.visible.get(a.id)?.paths).toEqual(['/posts/1']);
		expect(s.visible.get(b.id)?.paths).toEqual(['/posts/3']);
	});

	test('X collapses the closed window entries and Forward does not resurrect it', () => {
		const s = setup();
		const w = s.mount(['/posts/1']);
		w.push('/posts/2');
		w.push('/posts/3');
		w.close();
		s.flush();
		expect(s.index).toBe(0);
		s.go(1);
		expect(s.visible.size).toBe(0);
		expect(s.index).toBe(3);
		s.go(-1);
		expect(s.index).toBe(0);
		expect(s.history.pushState).toHaveBeenCalledTimes(3);
	});

	test('closing an older window preserves newer windows and skips only redundant entries', () => {
		const s = setup();
		const a = s.mount(['/posts/1']);
		a.push('/posts/2');
		const b = s.mount(['/posts/3']);
		a.close();
		s.flush();
		expect(s.visible.get(b.id)?.paths).toEqual(['/posts/3']);
		s.go(-1);
		expect(s.visible.size).toBe(0);
		s.go(-1);
		expect(s.index).toBe(0);
	});

	test('new navigation after Back discards the forward branch', () => {
		const s = setup();
		const w = s.mount(['/posts/1']);
		w.push('/posts/2');
		s.go(-1);
		w.push('/posts/3');
		s.go(-1);
		s.go(1);
		expect(s.visible.get(w.id)?.paths).toEqual(['/posts/1', '/posts/3']);
		expect(s.entries).toHaveLength(3);
	});

	test('returning from a lightbox hash entry does not consume window history', () => {
		const s = setup();
		const w = s.mount(['/posts/1']);
		w.push('/posts/2');
		s.history.pushState(null, '', '/#pswp');
		s.go(-1);
		expect(s.visible.get(w.id)?.paths).toEqual(['/posts/1', '/posts/2']);
		expect(s.index).toBe(2);
		s.go(-1);
		expect(s.visible.get(w.id)?.paths).toEqual(['/posts/1']);
	});

	test('stale entries from a reload are not restored and disposal stops callbacks', () => {
		const s = setup();
		const w = s.mount(['/posts/1']);
		const stale = s.history.state;
		const reopened = vi.fn();
		const next = new DeckWindowHistory(s.history, '/', reopened);
		next.restore(stale, '/');
		expect(reopened).not.toHaveBeenCalled();
		s.controller.dispose();
		const count = s.history.pushState.mock.calls.length;
		w.push('/posts/2');
		expect(s.history.pushState).toHaveBeenCalledTimes(count);
	});
});
