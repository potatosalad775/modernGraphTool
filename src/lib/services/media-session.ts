/**
 * MediaSessionBridge — puts the EQ audio player in the OS "now playing" surfaces: iOS Control
 * Center and lock screen, Android's media notification, desktop media overlays, media keys and
 * headset buttons.
 *
 * Those surfaces only attach to a playing media element; a bare `AudioContext` is invisible to
 * them. So a silent, looping `<audio>` anchor plays alongside the Web Audio graph, and the real
 * audio keeps going straight to `ctx.destination`. Routing the graph *through* an element
 * (`MediaStreamAudioDestinationNode` → `srcObject`) would also work, but adds output latency
 * that the A/B toggle and the spectrum display would both show.
 *
 * On iOS the playing element also moves the page from the "ambient" audio category to
 * "playback", so the ring/silent switch stops muting the player.
 */

export interface MediaSessionHandlers {
	play(): void;
	pause(): void;
	stop(): void;
	seekTo(time: number): void;
}

export interface MediaPosition {
	duration: number;
	position: number;
}

// Chrome ignores media shorter than 5 s for its media controls, so the loop runs longer.
const LOOP_SECONDS = 10;
const ANCHOR_RATE = 8000;
// The file-length anchor costs 8 kB per second; a longer file plays as live, without a scrubber.
const MAX_TIMELINE_SECONDS = 3600;
// Lets the anchor outlast the file a little, so it never ends (and pauses the player) first.
const TIMELINE_SLACK_SECONDS = 1;
// Anchor drift below this is left alone: a seek on the element is not free.
const DRIFT_TOLERANCE_SECONDS = 0.3;

/** A silent 8-bit mono WAV, built in memory so there is no asset to fetch or ship. */
function silentWavUrl(seconds: number): string {
	const samples = Math.ceil(seconds * ANCHOR_RATE);
	const buf = new ArrayBuffer(44 + samples);
	const view = new DataView(buf);
	const ascii = (offset: number, s: string) => {
		for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
	};
	ascii(0, 'RIFF');
	view.setUint32(4, 36 + samples, true);
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, ANCHOR_RATE, true);
	view.setUint32(28, ANCHOR_RATE, true); // byte rate
	view.setUint16(32, 1, true); // block align
	view.setUint16(34, 8, true); // bits per sample
	ascii(36, 'data');
	view.setUint32(40, samples, true);
	// 8-bit PCM is unsigned: 128 is silence.
	new Uint8Array(buf, 44).fill(128);
	return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function clamp(t: number, duration: number): number {
	return Math.min(Math.max(0, t), duration);
}

function artwork(): MediaImage[] {
	const icon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
	return icon?.href ? [{ src: icon.href, sizes: '180x180', type: 'image/png' }] : [];
}

export class MediaSessionBridge {
	#anchor: HTMLAudioElement | null = null;
	#anchorUrl = '';
	#anchorSeconds = 0;
	#handlersInstalled = false;
	#title = '';

	constructor(private readonly handlers: MediaSessionHandlers) {}

	get #session(): MediaSession | null {
		return typeof navigator !== 'undefined' && 'mediaSession' in navigator
			? navigator.mediaSession
			: null;
	}

	/** Playback started. Call synchronously from the user gesture, like `AudioContext.resume()`. */
	playing(): void {
		const audioSession = (navigator as { audioSession?: { type: string } }).audioSession;
		if (audioSession) audioSession.type = 'playback';

		const anchor = this.#ensureAnchor();
		// Rejected when there is no user activation; the player still plays, just without the
		// OS surfaces until the next gesture-driven play.
		anchor.play().catch(() => {});

		const session = this.#session;
		if (!session) return;
		this.#installHandlers(session);
		session.playbackState = 'playing';
	}

	paused(): void {
		this.#anchor?.pause();
		const session = this.#session;
		if (session && this.#handlersInstalled) session.playbackState = 'paused';
	}

	setTitle(title: string): void {
		const session = this.#session;
		if (!session || title === this.#title) return;
		this.#title = title;
		session.metadata = new MediaMetadata({ title, artist: document.title, artwork: artwork() });
	}

	/**
	 * File playback has a timeline; `null` is a generated signal, which plays as live.
	 *
	 * WebKit draws the scrubber from the anchor element's own timeline and lets it override
	 * `setPositionState` — a 10 s loop sent the lock-screen scrubber back to 0:00 every pass. So
	 * for a file the anchor is a silent clip as long as the file, kept at the file's position.
	 */
	setPosition(pos: MediaPosition | null): void {
		const timeline = pos && pos.duration <= MAX_TIMELINE_SECONDS ? pos : null;
		const anchor = this.#ensureAnchor();
		this.#setAnchorLength(timeline ? timeline.duration + TIMELINE_SLACK_SECONDS : LOOP_SECONDS);
		anchor.loop = !timeline;
		if (timeline && Math.abs(anchor.currentTime - timeline.position) > DRIFT_TOLERANCE_SECONDS) {
			anchor.currentTime = timeline.position;
		}

		const session = this.#session;
		if (!session) return;
		const seekBy = (offset: number) => {
			if (timeline) this.handlers.seekTo(clamp(anchor.currentTime + offset, timeline.duration));
		};
		this.#setAction(
			session,
			'seekto',
			timeline ? (d) => this.handlers.seekTo(clamp(d.seekTime ?? 0, timeline.duration)) : null
		);
		this.#setAction(
			session,
			'seekbackward',
			timeline ? (d) => seekBy(-(d.seekOffset ?? 10)) : null
		);
		this.#setAction(session, 'seekforward', timeline ? (d) => seekBy(d.seekOffset ?? 10) : null);
		try {
			session.setPositionState(
				timeline
					? {
							duration: timeline.duration,
							position: clamp(timeline.position, timeline.duration),
							// Never 0 (a TypeError): `playbackState` already stops a paused clock.
							playbackRate: 1
						}
					: { duration: Infinity, position: 0, playbackRate: 1 }
			);
		} catch {
			// Older Safari lacks setPositionState; some browsers reject an infinite duration.
			try {
				session.setPositionState();
			} catch {
				// Nothing left to clear.
			}
		}
	}

	#setAnchorLength(seconds: number): void {
		const anchor = this.#ensureAnchor();
		if (seconds === this.#anchorSeconds) return;
		const wasPlaying = !anchor.paused;
		const oldUrl = this.#anchorUrl;
		this.#anchorUrl = silentWavUrl(seconds);
		this.#anchorSeconds = seconds;
		// A new src stops the element; playing again at once keeps the `pause` listener's
		// `anchor.paused` guard from taking it for an OS pause.
		anchor.src = this.#anchorUrl;
		if (wasPlaying) anchor.play().catch(() => {});
		if (oldUrl) URL.revokeObjectURL(oldUrl);
	}

	#ensureAnchor(): HTMLAudioElement {
		if (!this.#anchor) {
			const anchor = new Audio();
			// The OS can pause the element on its own — a call, Siri, another app taking audio.
			// Follow it, so the player and the OS surfaces agree. Our own pause() lands here too,
			// a task later: a no-op once the player has stopped, and skipped when a play() came in
			// between — the event would otherwise pause the playback that just started.
			anchor.addEventListener('pause', () => {
				if (anchor.paused) this.handlers.pause();
			});
			this.#anchor = anchor;
			this.#setAnchorLength(LOOP_SECONDS);
			anchor.loop = true;
		}
		return this.#anchor;
	}

	#setAction(
		session: MediaSession,
		action: MediaSessionAction,
		handler: MediaSessionActionHandler | null
	): void {
		try {
			session.setActionHandler(action, handler);
		} catch {
			// Unsupported action on this browser.
		}
	}

	#installHandlers(session: MediaSession): void {
		if (this.#handlersInstalled) return;
		this.#handlersInstalled = true;
		this.#setAction(session, 'play', () => this.handlers.play());
		this.#setAction(session, 'pause', () => this.handlers.pause());
		this.#setAction(session, 'stop', () => this.handlers.stop());
	}
}
