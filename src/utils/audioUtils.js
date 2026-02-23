/**
 * Resamples audio buffer to 16kHz mono as required by Wav2Vec2 models.
 */
export async function processAudioForModel(audioBlob) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get mono channel
    const channelData = audioBuffer.getChannelData(0);

    // If the sample rate is already 16000, we don't need to resample
    if (audioBuffer.sampleRate === 16000) {
        return channelData;
    }

    // Offline resampler
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    const resampledBuffer = await offlineCtx.startRendering();
    return resampledBuffer.getChannelData(0);
}

/**
 * Basic IPA cleanup if needed (e.g. removing speaker tags if the model adds them)
 */
export function cleanIpaOutput(text) {
    return text.replace(/\[.*?\]/g, '').trim();
}
