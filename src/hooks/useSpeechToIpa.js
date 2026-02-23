import { useState, useEffect, useRef } from 'react';
import { transcribeToIpa, loadEnglishDict } from '../utils/ipaHelpers';

export const useSpeechToIpa = (language = 'en') => {
    const [isRecording, setIsRecording] = useState(false);
    const [isDictReady, setIsDictReady] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [ipaOutput, setIpaOutput] = useState('');
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (language === 'en') {
            loadEnglishDict().then(() => setIsDictReady(true));
        } else {
            setIsDictReady(true);
        }
    }, [language]);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error('Speech recognition not supported in this browser.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language === 'es' ? 'es-ES' : 'en-US';

        recognition.onresult = (event) => {
            let currentTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                currentTranscript += event.results[i][0].transcript;
            }
            setTranscript(currentTranscript);
            setIpaOutput(transcribeToIpa(currentTranscript, language));
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsRecording(false);
        };

        recognition.onend = () => {
            setIsRecording(false);
        };

        recognitionRef.current = recognition;
    }, [language]);

    const startRecording = () => {
        if (recognitionRef.current && isDictReady) {
            setTranscript('');
            setIpaOutput('');
            recognitionRef.current.start();
            setIsRecording(true);
        }
    };

    const stopRecording = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setIsRecording(false);
        }
    };

    return {
        isRecording,
        isDictReady,
        transcript,
        ipaOutput,
        startRecording,
        stopRecording,
    };
};
