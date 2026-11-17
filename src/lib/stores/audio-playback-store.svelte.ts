class AudioPlaybackStore {
	/**
	 * Whether the EQ audio player is playing. Written only by `audio-player-service`, which exposes
	 * it as `audioPlayerService.isPlaying`; read from here by anything in the boot bundle.
	 */
	isPlaying = $state(false);
}

export const audioPlaybackStore = new AudioPlaybackStore();
