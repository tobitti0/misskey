/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type DeckHistoryWindow = { id: number; paths: string[] };
type WindowTarget = { restore: (paths: string[]) => void; close: () => void };
type Snapshot = { url: string; windows: DeckHistoryWindow[]; previous: number | null };
type BrowserHistory = Pick<History, 'state' | 'pushState' | 'replaceState' | 'go'>;

const stateKey = 'misskeyDeckWindow';

/** Browser history records actual window actions, never a sentinel re-pushed on Back. */
export class DeckWindowHistory {
	private readonly session = crypto.randomUUID();
	private readonly entries = new Map<number, Snapshot>();
	private readonly targets = new Map<number, WindowTarget>();
	private readonly pendingWindows = new Set<number>();
	private readonly explicitlyClosed = new Set<number>();
	private windows: DeckHistoryWindow[] = [];
	private current = 0;
	private last = 0;
	private nextEntry = 1;
	private nextWindow = 0;
	private disposed = false;

	constructor(
		private readonly history: BrowserHistory,
		private url: string,
		private readonly openWindow: (state: DeckHistoryWindow) => void,
		private readonly onWindowsChange: (hasWindows: boolean) => void = () => {},
	) {
		this.write(false);
	}

	register(paths: string[], target: WindowTarget, restoredId?: number) {
		const id = restoredId ?? this.nextWindow++;
		this.pendingWindows.delete(id);
		if (this.disposed || (restoredId != null && !this.windows.some(w => w.id === id))) {
			target.close();
		} else {
			this.targets.set(id, target);
			if (restoredId == null) {
				this.windows = [...this.windows, { id, paths: [...paths] }];
				this.write(true);
				this.onWindowsChange(true);
			} else {
				// A second Back/Forward may have arrived before Vue mounted the window.
				target.restore([...this.windows.find(w => w.id === id)!.paths]);
			}
		}
		const active = () => !this.disposed && this.targets.get(id) === target;
		const update = (nextPaths: string[], push: boolean) => {
			if (!active()) return;
			this.windows = this.windows.map(w => w.id === id ? { id, paths: [...nextPaths] } : w);
			this.write(push);
		};
		return {
			push: (nextPaths: string[]) => update(nextPaths, true),
			replace: (nextPaths: string[]) => update(nextPaths, false),
			back: () => {
				if (!active()) return;
				const pathsBefore = this.windows.find(w => w.id === id)!.paths;
				if (pathsBefore.length <= 1) return;
				const pathsAfter = pathsBefore.slice(0, -1);
				const desired = this.windows.map(w => w.id === id ? { id, paths: pathsAfter } : w);
				const previousId = this.entries.get(this.current)?.previous;
				const previous = previousId == null ? null : this.entries.get(previousId);
				if (this.readEntry(this.history.state) === this.current && previous?.url === this.url && this.equal(this.visible(previous.windows), desired)) {
					this.history.go(-1);
				} else {
					// Another window or the main column can own the latest browser entry.
					target.restore(pathsAfter);
					update(pathsAfter, false);
				}
			},
			close: () => {
				if (!active()) return;
				this.targets.delete(id);
				this.explicitlyClosed.add(id);
				this.windows = this.windows.filter(w => w.id !== id);
				this.write(false);
				this.onWindowsChange(this.windows.length > 0);
				// Rewind contiguous entries that only describe this now-closed window.
				// This also leaves the PWA exit confirmation at the actual deck root.
				let previousId = this.entries.get(this.current)?.previous;
				let steps = 0;
				while (previousId != null) {
					const entry = this.entries.get(previousId)!;
					if (entry.url !== this.url || !this.equal(this.visible(entry.windows), this.windows)) break;
					steps++;
					previousId = entry.previous;
				}
				if (steps > 0) this.history.go(-steps);
			},
		};
	}

	pushRoute(url: string) {
		this.url = url;
		this.write(true);
	}

	replaceRoute(url: string) {
		this.url = url;
		this.write(false);
	}

	/** Returns true while skipping a redundant entry left by an explicitly closed window. */
	restore(state: unknown, url: string): boolean {
		const entryId = this.readEntry(state);
		const entry = entryId == null ? null : this.entries.get(entryId);
		if (this.disposed) return false;
		if (entry == null || entryId == null) {
			// Lightbox owns its hash entry. Do not turn its Back into a window Back.
			if (url.endsWith('#pswp')) return false;
			this.current = this.last = this.nextEntry++;
			this.url = url;
			this.windows = [];
			for (const [id, target] of this.targets) {
				this.targets.delete(id);
				target.close();
			}
			this.write(false);
			this.onWindowsChange(false);
			return false;
		}
		const direction = Math.sign(entryId - this.current);
		const windows = this.visible(entry.windows);
		const unchanged = this.url === url && this.equal(this.windows, windows);
		this.current = entryId;
		this.url = url;
		this.windows = windows;
		for (const [id, target] of this.targets) {
			if (!windows.some(w => w.id === id)) {
				// Remove before close emits so history-driven closing remains reversible.
				this.targets.delete(id);
				target.close();
			}
		}
		for (const w of windows) {
			const target = this.targets.get(w.id);
			if (target) target.restore([...w.paths]);
			else if (!this.pendingWindows.has(w.id)) {
				this.pendingWindows.add(w.id);
				this.openWindow({ id: w.id, paths: [...w.paths] });
			}
		}
		this.onWindowsChange(windows.length > 0);
		// Stop at the base entry: a further Back can leave the deck normally.
		if (unchanged && direction !== 0 && (direction < 0 ? entry.previous != null : entryId !== this.last)) {
			this.history.go(direction);
			return true;
		}
		return false;
	}

	dispose() {
		this.disposed = true;
		this.targets.clear();
		this.pendingWindows.clear();
		this.entries.clear();
		this.windows = [];
	}

	private visible(windows: DeckHistoryWindow[]) {
		return windows.filter(w => !this.explicitlyClosed.has(w.id));
	}

	private equal(a: DeckHistoryWindow[], b: DeckHistoryWindow[]) {
		return JSON.stringify(a) === JSON.stringify(b);
	}

	private readEntry(state: unknown): number | null {
		const marker = (state as { [stateKey]?: { session?: string; entry?: number } } | null)?.[stateKey];
		return marker?.session === this.session && typeof marker.entry === 'number' ? marker.entry : null;
	}

	private write(push: boolean) {
		const previous = push ? this.current : this.entries.get(this.current)?.previous ?? null;
		if (push) this.last = this.current = this.nextEntry++;
		this.entries.set(this.current, {
			url: this.url,
			windows: this.windows.map(w => ({ id: w.id, paths: [...w.paths] })),
			previous,
		});
		const state = { ...this.history.state, [stateKey]: { session: this.session, entry: this.current } };
		if (push) this.history.pushState(state, '', this.url);
		else this.history.replaceState(state, '', this.url);
	}
}
