import React, { useState, useEffect, useRef } from 'react';
import TranscriptionWorker from './workers/transcriptionWorker?worker';
import { processAudioForModel, cleanIpaOutput } from './utils/audioUtils';
import { saveData, getAllData, deleteData, getDataById } from './utils/db';

function App() {
  const [activeTab, setActiveTab] = useState('project'); // 'project', 'sessions', 'people'
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing AI...');

  // Projects State
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);

  // People State
  const [people, setPeople] = useState([]);
  const [currentPerson, setCurrentPerson] = useState(null);

  // Sessions State
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);

  // AI/Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showMetadata, setShowMetadata] = useState(false);

  const worker = useRef(null);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const recordingSessionId = useRef(null); // Link recording to a specific session ID
  const currentAudioBlob = useRef(null);

  useEffect(() => {
    const initData = async () => {
      const savedProjects = await getAllData('projects');
      const savedPeople = await getAllData('people');
      const savedSessions = await getAllData('sessions');

      setProjects(savedProjects);
      setPeople(savedPeople);
      setSessions(savedSessions);

      if (savedProjects.length > 0) setCurrentProject(savedProjects[0]);
    };
    initData();

    worker.current = new TranscriptionWorker();
    worker.current.onmessage = async (event) => {
      const data = event.data;
      if (data.status === 'progress') setProgress(data.progress || 0);
      else if (data.status === 'ready') setIsReady(true);
      else if (data.status === 'complete') {
        setIsProcessing(false);
        const result = cleanIpaOutput(data.output);
        setTranscript(result);

        // Save using the ID when recording STARTED, to prevent data corruption
        const targetId = recordingSessionId.current;
        if (targetId) {
          const sessionToUpdate = await getDataById('sessions', targetId);
          if (sessionToUpdate) {
            const updated = {
              ...sessionToUpdate,
              transcript: result,
              audio: currentAudioBlob.current
            };
            await saveData('sessions', updated);
            setSessions(prev => prev.map(s => s.id === targetId ? updated : s));

            // If the user hasn't switched sessions, update the current view
            if (currentSession?.id === targetId) {
              setCurrentSession(updated);
            }
          }
          recordingSessionId.current = null;
        }
      }
    };
    worker.current.postMessage({ cmd: 'load' });
    return () => worker.current.terminate();
  }, []);

  // Project Functions
  const handleSaveProject = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const id = await saveData('projects', currentProject?.id ? { ...currentProject, ...data } : data);
    const updated = await getDataById('projects', id);
    setProjects(prev => currentProject?.id ? prev.map(p => p.id === id ? updated : p) : [...prev, updated]);
    setCurrentProject(updated);
    alert('Project Saved');
  };

  // Person Functions
  const handleSavePerson = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const id = await saveData('people', currentPerson?.id ? { ...currentPerson, ...data } : data);
    const updated = await getDataById('people', id);
    setPeople(prev => currentPerson?.id ? prev.map(p => p.id === id ? updated : p) : [...prev, updated]);
    setCurrentPerson(updated);
    alert('Person Saved');
  };

  // Session Functions
  const handleSaveSession = async (e) => {
    e.preventDefault();
    if (!currentProject) return alert('Please select or create a project first');
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const sessionData = {
      ...data,
      projectId: currentProject.id,
      ...(currentSession?.id ? { id: currentSession.id, audio: currentSession.audio, transcript: currentSession.transcript } : {})
    };
    const id = await saveData('sessions', sessionData);
    const updated = await getDataById('sessions', id);
    setSessions(prev => currentSession?.id ? prev.map(s => s.id === id ? updated : s) : [...prev, updated]);
    setCurrentSession(updated);
    setShowMetadata(false);
    alert('Session Saved');
  };

  // Recording Logic
  const startRecording = async () => {
    if (!currentSession?.id) return alert('Select or Create a session first');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.current = new MediaRecorder(stream);
    chunks.current = [];
    recordingSessionId.current = currentSession.id; // Lock recording to this session

    mediaRecorder.current.ondataavailable = (e) => chunks.current.push(e.data);
    mediaRecorder.current.onstop = async () => {
      const audioBlob = new Blob(chunks.current, { type: 'audio/wav' });
      currentAudioBlob.current = audioBlob;
      setIsProcessing(true);
      const audioBuffer = await processAudioForModel(audioBlob);
      worker.current.postMessage({ audio: audioBuffer });
    };
    mediaRecorder.current.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    mediaRecorder.current?.stream.getTracks().forEach(t => t.stop());
    setIsRecording(false);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '20px' }}>
      <main style={{ maxWidth: '1400px', width: '100%' }}>
        <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
          <h1 className="title-gradient" style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>Astraea</h1>
          <p style={{ opacity: 0.6, color: '#facc15', fontSize: '1.2rem', fontWeight: 600 }}>Fieldwork Management System</p>
        </header>

        <nav className="tabs-container">
          <button className={`tab-btn ${activeTab === 'project' ? 'active' : ''}`} onClick={() => setActiveTab('project')}>Projects</button>
          <button className={`tab-btn ${activeTab === 'people' ? 'active' : ''}`} onClick={() => setActiveTab('people')}>People</button>
          <button className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>Sessions</button>
        </nav>

        {!isReady && (
          <div className="glass-card" style={{ textAlign: 'center', marginBottom: '3rem', padding: '3rem' }}>
            <h2 style={{ marginTop: 0 }}>Initializing AI Phonetics Engine</h2>
            <div className="progress-container"><div className="progress-bar" style={{ width: `${progress}%` }}></div></div>
            <p className="status-label">Downloading Neural Modules... {progress.toFixed(1)}%</p>
          </div>
        )}

        {/* PROJECT TAB */}
        {activeTab === 'project' && (
          <div className="sidebar-layout">
            <aside>
              <button className="btn-secondary primary" style={{ width: '100%', marginBottom: '1.5rem' }} onClick={() => setCurrentProject({})}>+ New Project</button>
              <div className="list-pane">
                {projects.map(p => (
                  <div key={p.id} className={`list-item ${currentProject?.id === p.id ? 'selected' : ''}`} onClick={() => setCurrentProject(p)}>
                    <strong style={{ display: 'block', fontSize: '1.1rem' }}>{p.name || 'Untitled Project'}</strong>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{p.region || 'No Region'}</span>
                  </div>
                ))}
              </div>
            </aside>
            <section className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ margin: 0 }}>Project Metadata</h2>
                {currentProject?.id && <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>UUID: {currentProject.id}</span>}
              </div>
              <form onSubmit={handleSaveProject} className="field-grid">
                <div className="field-group"><label>Nombre del Proyecto*</label><input name="name" defaultValue={currentProject?.name} required placeholder="e.g. Documentación Quechua" /></div>
                <div className="field-group"><label>Funding Project</label><input name="funding" defaultValue={currentProject?.funding} placeholder="Fondo u Organización" /></div>
                <div className="field-group"><label>Región</label><input name="region" defaultValue={currentProject?.region} placeholder="Departamento / Estado" /></div>
                <div className="field-group"><label>País</label><input name="country" defaultValue={currentProject?.country} placeholder="Nombre del país" /></div>
                <div className="field-group" style={{ gridColumn: 'span 2' }}><label>Dirección</label><input name="address" defaultValue={currentProject?.address} placeholder="Ubicación o base local" /></div>
                <div className="field-group" style={{ gridColumn: 'span 2' }}><label>Descripción</label><textarea name="description" defaultValue={currentProject?.description} placeholder="Resumen y objetivos del proyecto" /></div>
                <div className="field-group"><label>Derechos de Autor</label><input name="copyright" defaultValue={currentProject?.copyright} placeholder="e.g. CC BY-NC" /></div>
                <div className="field-group"><label>Responsable o Depositor</label><input name="responsible" defaultValue={currentProject?.responsible} placeholder="Investigador principal" /></div>
                <button type="submit" className="btn-secondary primary" style={{ gridColumn: 'span 2', marginTop: '1.5rem' }}>Update Project Information</button>
              </form>
            </section>
          </div>
        )}

        {/* PEOPLE TAB */}
        {activeTab === 'people' && (
          <div className="sidebar-layout">
            <aside>
              <button className="btn-secondary primary" style={{ width: '100%', marginBottom: '1.5rem' }} onClick={() => setCurrentPerson({})}>+ New Person</button>
              <div className="list-pane">
                {people.map(p => (
                  <div key={p.id} className={`list-item ${currentPerson?.id === p.id ? 'selected' : ''}`} onClick={() => setCurrentPerson(p)}>
                    <strong style={{ display: 'block', fontSize: '1.1rem' }}>{p.fullName || 'New Person'}</strong>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{p.nickname ? `"${p.nickname}"` : p.code || 'No Code'}</span>
                  </div>
                ))}
              </div>
            </aside>
            <section className="glass-card">
              <h2 style={{ marginBottom: '2rem' }}>Consultant Profile</h2>
              <form onSubmit={handleSavePerson} className="field-grid">
                <div className="field-group"><label>Nombre Completo*</label><input name="fullName" defaultValue={currentPerson?.fullName} required placeholder="Official Name" /></div>
                <div className="field-group"><label>Nickname</label><input name="nickname" defaultValue={currentPerson?.nickname} placeholder="Community name" /></div>
                <div className="field-group"><label>Código</label><input name="code" defaultValue={currentPerson?.code} placeholder="e.g. SPK01" /></div>
                <div className="field-group"><label>Año de nacimiento</label><input type="number" name="birthYear" defaultValue={currentPerson?.birthYear} placeholder="YYYY" /></div>
                <div className="field-group">
                  <label>Género</label>
                  <select name="gender" defaultValue={currentPerson?.gender}>
                    <option value="">Select...</option>
                    <option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
                  </select>
                </div>
                <div className="field-group"><label>Lengua Primaria</label><input name="primaryLang" defaultValue={currentPerson?.primaryLang} placeholder="L1" /></div>
                <div className="field-group"><label>Aprendida en</label><input name="learnedIn" defaultValue={currentPerson?.learnedIn} placeholder="Lugar donde aprendió L1" /></div>
                <div className="field-group"><label>Grupo Étnico</label><input name="ethnic" defaultValue={currentPerson?.ethnic} placeholder="Identidad / Etnia" /></div>

                <div className="field-group" style={{ gridColumn: 'span 2' }}>
                  <label>Otros idiomas (Máximo 4)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <input name="other1" defaultValue={currentPerson?.other1} placeholder="Idioma 2" />
                    <input name="other2" defaultValue={currentPerson?.other2} placeholder="Idioma 3" />
                    <input name="other3" defaultValue={currentPerson?.other3} placeholder="Idioma 4" />
                    <input name="other4" defaultValue={currentPerson?.other4} placeholder="Idioma 5" />
                  </div>
                </div>

                <div className="field-group"><label>Educación</label><input name="education" defaultValue={currentPerson?.education} placeholder="Nivel alcanzado" /></div>
                <div className="field-group"><label>Ocupación actual</label><input name="occupation" defaultValue={currentPerson?.occupation} placeholder="Trabajo actual" /></div>
                <div className="field-group" style={{ gridColumn: 'span 2' }}><label>Contacto</label><input name="contact" defaultValue={currentPerson?.contact} placeholder="Teléfono o medio de contacto" /></div>

                <button type="submit" className="btn-secondary primary" style={{ gridColumn: 'span 2', marginTop: '1.5rem' }}>Save Consultant Record</button>
              </form>
            </section>
          </div>
        )}

        {/* SESSIONS TAB */}
        {activeTab === 'sessions' && (
          <div className="sidebar-layout">
            <aside>
              <button className="btn-secondary primary" style={{ width: '100%', marginBottom: '1.5rem' }} onClick={() => {
                setCurrentSession({});
                setTranscript('');
                setIsEditing(false);
              }}>+ New Session</button>
              <div className="list-pane">
                {sessions.filter(s => s.projectId === currentProject?.id).map(s => (
                  <div key={s.id} className={`list-item ${currentSession?.id === s.id ? 'selected' : ''}`} onClick={() => {
                    setCurrentSession(s);
                    setTranscript(s.transcript || '');
                    setIsEditing(false);
                  }}>
                    <strong style={{ display: 'block', fontSize: '1.1rem' }}>{s.title || `Session ${s.id}`}</strong>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{s.date || 'No Date'}</span>
                  </div>
                ))}
              </div>
            </aside>
            <section className="main-pane">
              <div className="session-header">
                <div>
                  <h2 style={{ margin: 0 }}>{currentSession?.title || 'New Session'}</h2>
                  {currentProject && <span style={{ color: '#facc15', fontSize: '0.9rem' }}>Project: {currentProject.name}</span>}
                </div>
                {currentSession?.id && (
                  <button className="metadata-toggle" onClick={() => setShowMetadata(!showMetadata)}>
                    {showMetadata ? 'Hide Metadata' : 'Edit Metadata'}
                  </button>
                )}
              </div>

              {(!currentSession?.id || showMetadata) && (
                <div className="glass-card" style={{ padding: '2rem', marginBottom: '1rem' }}>
                  <form onSubmit={handleSaveSession} className="field-grid">
                    <div className="field-group"><label>Session ID</label><input name="sessionId" defaultValue={currentSession?.sessionId} placeholder="e.g. SES-001" /></div>
                    <div className="field-group"><label>Session Title*</label><input name="title" defaultValue={currentSession?.title} required placeholder="Descriptive title" /></div>
                    <div className="field-group"><label>Recording Date</label><input type="date" name="date" defaultValue={currentSession?.date} /></div>
                    <div className="field-group"><label>Field Site / Place</label><input name="place" defaultValue={currentSession?.place} placeholder="Location of recording" /></div>

                    <div className="field-group">
                      <label>Persona (Dueña de la voz)*</label>
                      <select name="personId" defaultValue={currentSession?.personId} required>
                        <option value="">Select a person...</option>
                        {people.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                      </select>
                    </div>

                    <div className="field-group">
                      <label>Género (Timbre de voz)</label>
                      <select name="gender" defaultValue={currentSession?.gender}>
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other / Neutral</option>
                      </select>
                    </div>

                    <div className="field-group"><label>Consultor / Ayudante</label><input name="consultant" defaultValue={currentSession?.consultant} placeholder="Researcher or assistant" /></div>

                    <div className="field-group">
                      <label>Situación / Contexto</label>
                      <select name="context" defaultValue={currentSession?.context}>
                        <option value="">Select context...</option>
                        <option value="Narración">Narración</option>
                        <option value="Cuento">Cuento</option>
                        <option value="Entrevista">Entrevista</option>
                        <option value="Conversación">Conversación</option>
                        <option value="Lista de palabras">Lista de palabras</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>

                    <div className="field-group" style={{ gridColumn: 'span 2' }}>
                      <label>Descripción de la Sesión</label>
                      <textarea name="description" defaultValue={currentSession?.description} placeholder="Detalles técnicos o notas sobre el contenido del audio" />
                    </div>

                    <button type="submit" className="btn-secondary primary" style={{ gridColumn: 'span 2' }}>
                      {currentSession?.id ? 'Update Metadata' : 'Create Session to Start Recording'}
                    </button>
                  </form>
                </div>
              )}

              {currentSession?.id && (
                <div className="session-container">
                  {/* TOP: Recording Section */}
                  <div className="glass-card recording-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                      <button className={`record-btn ${isRecording ? 'recording' : ''}`} onClick={isRecording ? stopRecording : startRecording} disabled={!isReady || isProcessing}>
                        {isProcessing ? <div className="spinner"></div> : (
                          <svg viewBox="0 0 24 24" width="36" height="36" fill="white">
                            {isRecording ? <rect x="6" y="6" width="12" height="12" rx="2" /> : <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />}
                          </svg>
                        )}
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: isRecording ? '#ef4444' : '#facc15', fontWeight: 700, marginBottom: '0.5rem' }}>
                          {isRecording ? 'RECORDING...' : isProcessing ? 'AI TRANSCRIBING...' : 'READY TO RECORD'}
                        </div>
                        {currentSession.audio && (
                          <audio controls src={URL.createObjectURL(currentSession.audio)} style={{ width: '100%', height: '40px' }} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* BOTTOM: Transcription Section */}
                  <div className="glass-card transcription-panel" style={{ padding: '1.5rem', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ margin: 0, color: '#facc15' }}>Transcription</h3>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {!isEditing ? (
                          <button className="btn-secondary" onClick={() => {
                            setIsEditing(true);
                            setEditText(transcript);
                          }} disabled={!transcript}>Edit Transcript</button>
                        ) : (
                          <>
                            <button className="btn-secondary primary" onClick={async () => {
                              const updated = { ...currentSession, transcript: editText };
                              await saveData('sessions', updated);
                              setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
                              setCurrentSession(updated);
                              setTranscript(editText);
                              setIsEditing(false);
                            }}>Save Changes</button>
                            <button className="btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
                          </>
                        )}
                        <button className="btn-secondary" onClick={() => {
                          const blob = new Blob([transcript], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `session_${currentSession.id}_transcript.txt`;
                          a.click();
                        }} disabled={!transcript}>Export TXT</button>
                      </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {isEditing ? (
                        <textarea
                          style={{ flex: 1, width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--primary)', borderRadius: '12px', padding: '1rem', fontSize: '1.5rem', fontFamily: 'Inter' }}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                      ) : (
                        <div className="ipa-box" style={{ flex: 1, padding: '1.5rem', fontSize: '2rem' }}>
                          {transcript || '[ No transcript yet ]'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <style>{`
        .spinner { width: 44px; height: 44px; border: 4px solid rgba(255, 255, 255, 0.2); border-radius: 50%; border-top-color: #facc15; animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default App;
