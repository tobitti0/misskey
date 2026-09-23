/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type BackButtonTarget = {
	getZIndex: () => number;
	back: () => void;
	usesBrowserHistory?: boolean;
};

// CloseWatcher is not available in every browser (or in all DOM typings).
export type CloseWatcherHandle = EventTarget & { destroy: () => void };
type CloseWatcherConstructor = new () => CloseWatcherHandle;

export function getPwaCloseWatcher(): CloseWatcherConstructor | null {
	if (!/Android/i.test(window.navigator.userAgent)) return null;
	if (!window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) return null;
	return (window as Window & { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher ?? null;
}

/** One platform close request performs one action on the frontmost visible surface. */
export class PwaBackButton {
	private readonly targets = new Set<BackButtonTarget>();
	private watcher: CloseWatcherHandle | null = null;
	private atRoot = false;
	private disposed = false;
	private exitTimer: number | null = null;
	private dismissExitConfirmation: (() => void) | null = null;

	constructor(
		private readonly createWatcher: () => CloseWatcherHandle,
		private readonly showExitConfirmation: () => () => void,
	) {}

	public register(target: BackButtonTarget): () => void {
		this.targets.add(target);
		this.reset();
		return () => {
			this.targets.delete(target);
			this.syncWatcher();
		};
	}

	public setAtRoot(atRoot: boolean): void {
		this.atRoot = atRoot;
		this.reset();
	}

	/** A new interaction, navigation, or app resume cancels the pending exit. */
	public reset = (): void => {
		this.clearExitConfirmation();
		this.syncWatcher();
	};

	public dispose(): void {
		this.disposed = true;
		this.clearExitConfirmation();
		this.watcher?.destroy();
		this.watcher = null;
		this.targets.clear();
	}

	private clearExitConfirmation(): void {
		if (this.exitTimer != null) window.clearTimeout(this.exitTimer);
		this.exitTimer = null;
		this.dismissExitConfirmation?.();
		this.dismissExitConfirmation = null;
	}

	private syncWatcher(): void {
		const target = this.frontmostTarget();
		const needed = !this.disposed && this.exitTimer == null && (target ? !target.usesBrowserHistory : this.atRoot);
		if (!needed) {
			this.watcher?.destroy();
			this.watcher = null;
		} else if (this.watcher == null) {
			this.watcher = this.createWatcher();
			this.watcher.addEventListener('close', this.onClose, { once: true });
		}
	}

	private frontmostTarget(): BackButtonTarget | undefined {
		return [...this.targets].reverse().sort((a, b) => b.getZIndex() - a.getZIndex())[0];
	}

	private onClose = (): void => {
		// A CloseWatcher is destroyed by the browser before emitting close. Do not
		// repeatedly cancel its cancel event: cancellation requires user activation.
		this.watcher = null;
		if (this.disposed) return;
		const target = this.frontmostTarget();
		if (target != null) {
			try {
				target.back();
			} finally {
				this.syncWatcher();
			}
		} else if (this.atRoot) {
			this.dismissExitConfirmation = this.showExitConfirmation();
			// Leave the next system Back entirely to the browser/OS. history.back()
			// and window.close() cannot reliably leave an installed PWA.
			this.exitTimer = window.setTimeout(this.reset, 2000);
		}
	};
}
