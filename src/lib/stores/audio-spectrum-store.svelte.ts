class AudioSpectrumStore {
	/** Whether the user wants the spectrum overlay visible */
	isEnabled = $state(false);
	/** AnalyserNode reference — set by EqAudioPlayer, read by GraphSpectrumOverlay */
	analyserNode = $state<AnalyserNode | null>(null);
}

export const audioSpectrumStore = new AudioSpectrumStore();
