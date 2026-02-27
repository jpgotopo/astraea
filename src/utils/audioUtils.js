/**
 * Resamples audio buffer to 16kHz mono as required by Wav2Vec2/Whisper models.
 * If shouldSegment is true, it returns an array of Float32Arrays split by silence.
 */
export async function processAudioForModel(audioBlob, shouldSegment = true) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get mono channel
    let channelData = audioBuffer.getChannelData(0);

    // Resample if necessary
    if (audioBuffer.sampleRate !== 16000) {
        const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start();
        const resampledBuffer = await offlineCtx.startRendering();
        channelData = resampledBuffer.getChannelData(0);
    }

    // Normalize audio level for better AI recognition
    channelData = normalizeAudio(channelData);

    if (!shouldSegment) return channelData;

    return segmentAudioBySilence(channelData);
}

/**
 * Normalizes audio to ensure consistent peak levels.
 */
export function normalizeAudio(samples) {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i]);
        if (abs > max) max = abs;
    }

    if (max === 0 || max === 1) return samples;

    const factor = 0.9 / max;
    const normalized = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        normalized[i] = samples[i] * factor;
    }
    return normalized;
}

/**
 * Splits audio into segments based on silence detection.
 */
export function segmentAudioBySilence(audioData, threshold = 0.015, minSilenceLen = 0.8) {
    const sampleRate = 16000;
    const minSilenceSamples = minSilenceLen * sampleRate;
    const paddingSamples = 0.2 * sampleRate; // 200ms padding
    const segments = [];

    let start = 0;
    let silenceCounter = 0;
    let inSilence = false;

    for (let i = 0; i < audioData.length; i++) {
        const amplitude = Math.abs(audioData[i]);

        if (amplitude < threshold) {
            silenceCounter++;
        } else {
            if (inSilence && silenceCounter >= minSilenceSamples) {
                // End of segment reached
                if (i - start > sampleRate * 0.3) {
                    // Pull back slightly to include the silence offset but add padding
                    const end = Math.min(audioData.length, i - silenceCounter + paddingSamples);
                    segments.push(audioData.slice(start, end));
                    start = Math.max(0, i - Math.floor(paddingSamples / 2));
                }
            }
            silenceCounter = 0;
            inSilence = false;
        }

        if (silenceCounter >= minSilenceSamples) {
            inSilence = true;
        }
    }

    // Push final segment if any
    if (start < audioData.length - sampleRate * 0.1) {
        segments.push(audioData.slice(start));
    }

    return segments.length > 0 ? segments : [audioData];
}

/**
 * Basic IPA cleanup if needed (e.g. removing speaker tags if the model adds them)
 */
export function cleanIpaOutput(text) {
    return text.replace(/\[.*?\]/g, '').trim();
}

/**
 * Converts Float32Array audio data to a WAV Blob.
 */
export function float32ToWav(samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
}
