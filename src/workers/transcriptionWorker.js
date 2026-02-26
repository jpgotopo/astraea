import { pipeline, env } from '@huggingface/transformers';

console.log('TRANSCRIPTION_WORKER: SCRIPT START');

// Configure environment for v3
env.allowLocalModels = false;
env.useBrowserCache = true;

// Send immediate heartbeat
self.postMessage({ status: 'alive' });

// Global error handling for the worker
self.onerror = (e) => {
    console.error('TRANSCRIPTION_WORKER: Global Error:', e);
    self.postMessage({ status: 'error', error: 'Worker Global Error: ' + (e.message || e) });
};

self.onunhandledrejection = (e) => {
    console.error('TranscriptionWorker: Unhandled Rejection:', e.reason);
    self.postMessage({ status: 'error', error: 'Worker Promise Error: ' + e.reason });
};

// Send immediate heartbeat
self.postMessage({ status: 'alive' });

// Configure environment for v3
env.allowLocalModels = false;
env.useBrowserCache = true;

class TranscriptionPipeline {
    static task = 'automatic-speech-recognition';
    static model = 'onnx-community/ipa-whisper-base-ONNX';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            console.log('TranscriptionPipeline: Initializing v3 pipeline:', this.model);
            try {
                this.instance = await pipeline(this.task, this.model, {
                    progress_callback,
                    device: 'webgpu',
                }).catch(async (err) => {
                    console.warn('TranscriptionPipeline: WebGPU fallback to WASM:', err.message);
                    return await pipeline(this.task, this.model, {
                        progress_callback,
                        device: 'wasm'
                    });
                });
                console.log('TranscriptionPipeline: Pipeline ready.');
            } catch (err) {
                console.error('TranscriptionPipeline: Critical Load Error:', err);
                throw err;
            }
        }
        return this.instance;
    }
}

console.log('TranscriptionWorker: Module Script Loaded.');

self.onmessage = async (event) => {
    const { audio, cmd } = event.data;

    try {
        if (cmd === 'load') {
            console.log('TranscriptionWorker: Command: load');
            await TranscriptionPipeline.getInstance((x) => self.postMessage(x));
            self.postMessage({ status: 'ready' });
            return;
        }

        if (audio) {
            console.log('TranscriptionWorker: Command: transcribe');
            const transcriber = await TranscriptionPipeline.getInstance((x) => self.postMessage(x));

            const output = await transcriber(audio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'en',
                task: 'transcribe',
                return_timestamps: false,
                max_new_tokens: 448, // Standard for Whisper, ensures long output
                repetition_penalty: 1.2,
                no_repeat_ngram_size: 4,
                do_sample: false,
            });

            self.postMessage({
                status: 'complete',
                output: output.text,
            });
        }
    } catch (err) {
        console.error('TranscriptionWorker: Runtime Error:', err);
        self.postMessage({ status: 'error', error: err.message });
    }
};
