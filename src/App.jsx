import React, { useState, useEffect, useRef } from 'react';
import TranscriptionWorker from './workers/transcriptionWorker?worker';
import { processAudioForModel, cleanIpaOutput } from './utils/audioUtils';
import { saveTranscription, getAllTranscriptions, deleteTranscription } from './utils/db';

function App() {
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing AI...');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [history, setHistory] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const worker = useRef(null);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const currentAudioBlob = useRef(null);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const savedHistory = await getAllTranscriptions();
        setHistory(savedHistory.sort((a, b) => b.id - a.id).slice(0, 50));
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };
    loadHistory();

    console.log('App: Environment Diagnostics:', {
      crossOriginIsolated: window.crossOriginIsolated,
      isSecureContext: window.isSecureContext,
      userAgent: navigator.userAgent
    });

    // Initialize Web Worker using Vite worker loader
    console.log('App: Starting AI Worker...');
    worker.current = new TranscriptionWorker();

    worker.current.onerror = (e) => {
      console.error('App: Worker Native Error:', e);
      setStatus('Error: Worker failed to start. Check console.');
    };

    worker.current.onmessage = async (event) => {
      const data = event.data;
      console.log('App: Received message from worker:', data);

      if (data.status === 'alive') {
        console.log('App: Worker acknowledged being alive.');
        setStatus('AI Engine Initialized. Loading Model...');
      } else if (data.status === 'initiate') {
        setStatus(`Initializing ${data.file}...`);
      } else if (data.status === 'progress') {
        setProgress(data.progress || 0);
        const loadedMB = data.loaded ? (data.loaded / 1024 / 1024).toFixed(1) : '0';

        if (data.total) {
          const totalMB = (data.total / 1024 / 1024).toFixed(1);
          setStatus(`Downloading ${data.file}: ${loadedMB}MB / ${totalMB}MB (${data.progress?.toFixed(1) || 0}%)`);
        } else {
          setStatus(`Downloading ${data.file}: ${loadedMB}MB loaded...`);
        }
      } else if (data.status === 'done') {
        setStatus(`Finished downloading ${data.file}`);
      } else if (data.status === 'ready') {
        setIsReady(true);
        setStatus('Ready for Fieldwork');
      } else if (data.status === 'complete') {
        setIsProcessing(false);
        const result = cleanIpaOutput(data.output);
        setTranscript(result);

        const newItem = {
          id: Date.now(),
          text: result,
          audio: currentAudioBlob.current
        };

        try {
          await saveTranscription(newItem);
          setHistory(prev => [newItem, ...prev].slice(0, 50));
        } catch (err) {
          console.error('Failed to save transcription:', err);
        }

        setStatus('Transcription Complete');
      } else if (data.status === 'error') {
        console.error('App: AI Worker Error:', data.error);
        setStatus('Error: ' + data.error);
        setIsProcessing(false);
      }
    };

    // Trigger pre-load
    worker.current.postMessage({ cmd: 'load' });

    return () => {
      worker.current.terminate();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      chunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(chunks.current, { type: 'audio/wav' });
        currentAudioBlob.current = audioBlob;
        setIsProcessing(true);
        setStatus('Processing Phonetics...');

        const audioBuffer = await processAudioForModel(audioBlob);
        worker.current.postMessage({ audio: audioBuffer });
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setStatus('Listening to sounds...');
    } catch (err) {
      console.error('Mic Error:', err);
      setStatus('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEdit = async (id) => {
    const item = history.find(h => h.id === id);
    if (!item) return;

    const updatedItem = { ...item, text: editText };
    try {
      await saveTranscription(updatedItem);
      setHistory(prev => prev.map(h => h.id === id ? updatedItem : h));
      setEditingId(null);
      if (transcript === item.text) setTranscript(editText);
    } catch (err) {
      console.error('Failed to save edit:', err);
    }
  };

  const deleteItem = async (id) => {
    try {
      await deleteTranscription(id);
      setHistory(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const exportHistory = () => {
    const text = history.map(item => item.text).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fieldwork_transcript.txt';
    a.click();
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '20px' }}>
      <main className="glass-card" style={{ maxWidth: '900px', width: '100%', textAlign: 'center' }}>
        <header style={{ marginBottom: '2.5rem' }}>
          <h1 className="title-gradient" style={{ fontSize: '3.5rem', margin: '0 0 0.5rem 0' }}>
            Astraea
          </h1>
          <p style={{ opacity: 0.6, fontSize: '1.1rem', color: '#facc15' }}>
            Universal Phonetic Fieldwork Tool
          </p>
        </header>

        {!isReady && (
          <div style={{ marginBottom: '2rem' }}>
            <div className="status-label">{status}</div>
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        <section style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              disabled={!isReady || isProcessing}
              style={{ opacity: (!isReady || isProcessing) ? 0.5 : 1 }}
            >
              {isProcessing ? (
                <div className="spinner"></div>
              ) : (
                <svg viewBox="0 0 24 24" width="40" height="40" fill="white">
                  {isRecording ? (
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  ) : (
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  )}
                </svg>
              )}
            </button>
            <p style={{ marginTop: '1.5rem', fontWeight: 600, color: isRecording ? '#ef4444' : '#fff' }}>
              {isRecording ? 'RECORDING SOUNDS' : isProcessing ? 'AI TRANSCRIBING...' : 'TAP TO RECORD PHONEMES'}
            </p>
            <div className="status-label" style={{ marginTop: '5px' }}>{isReady ? status : ''}</div>
          </div>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <div className="ipa-display">
            {transcript || '/ . . . /'}
          </div>
          {transcript && (
            <button
              className="btn-secondary"
              style={{ marginTop: '1rem' }}
              onClick={() => navigator.clipboard.writeText(transcript)}
            >
              Copy IPA
            </button>
          )}
        </section>

        {history.length > 0 && (
          <section style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Recent Transcripts</h3>
              <button className="btn-secondary" onClick={exportHistory}>Export Documentation</button>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', overflow: 'hidden' }}>
              {history.map(item => (
                <div key={item.id} className="history-item" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {editingId === item.id ? (
                      <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="edit-input"
                          style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid #facc15', color: 'white', padding: '0.4rem', borderRadius: '4px', fontSize: '1.2rem', fontFamily: 'monospace' }}
                        />
                        <button className="btn-small" onClick={() => saveEdit(item.id)}>Save</button>
                        <button className="btn-small btn-cancel" onClick={cancelEdit}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>{item.text}</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', opacity: 0.4 }}>{new Date(item.id).toLocaleTimeString()}</span>
                          <button className="icon-btn" onClick={() => startEdit(item)} title="Edit">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                              <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" />
                            </svg>
                          </button>
                          <button className="icon-btn btn-danger" onClick={() => deleteItem(item.id)} title="Delete">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
                              <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {item.audio && (
                    <div style={{ width: '100%', marginTop: '0.2rem' }}>
                      <audio controls src={URL.createObjectURL(item.audio)} style={{ width: '100%', height: '32px' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer style={{ marginTop: '4rem', opacity: 0.3, fontSize: '0.8rem' }}>
          Neural Network: Wav2Vec2-LV-60 | Universal Phone Recognition
        </footer>
      </main>

      <style>{`
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: #fff;
          animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
