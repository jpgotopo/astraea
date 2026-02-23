# Astraea - Universal Phonetic Fieldwork Tool

Astraea is a high-performance, client-side web application designed for linguistic documentation. It transcribes audio directly into the International Phonetic Alphabet (IPA) using state-of-the-art AI.

## 🚀 Key Features

- **Universal Phonetic Transcription**: Uses a Whisper-based model fine-tuned for universal IPA recognition.
- **Privacy-First**: All AI processing happens locally in your browser—no audio leaves your device.
- **Linguistic Focus**: Specialized for documenting low-resource or undocumented languages.
- **Glassmorphic UI**: A premium, minimalist interface designed for clarity in fieldwork.

## 🛠️ Technology Stack

- **Framework**: React + Vite
- **AI Engine**: `@huggingface/transformers` (v3)
- **Model**: `onnx-community/ipa-whisper-base-ONNX`
- **Audio Processing**: Web Audio API (16kHz resampling)

## 📦 Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## 📖 Usage

1. Open the app and wait for the AI motor to initialize.
2. Tap the microphone button to start recording.
3. Speak clearly; the IPA transcription will appear on the screen.
4. Use the "Export Documentation" button to save your transcripts.

---
*Developed for linguistic researchers and field workers.*
