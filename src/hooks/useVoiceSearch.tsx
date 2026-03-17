import { useState, useEffect, useRef } from 'react';
import { VOICE_ERROR_MESSAGES, VoiceSearchHook } from '@/types/voiceSearchTypes';

// Web Speech API type declarations for cross-config compatibility
 
interface SpeechRecognitionEventCompat {
  resultIndex: number;
  results: any;
}
 
interface SpeechRecognitionErrorEventCompat {
  error: string;
}

declare global {
  // Only extend Window, don't redeclare existing DOM types
  // SpeechRecognition is already in DOM lib for tsconfig.app.json
  // For tsconfig.test.json, these enable compilation without DOM SpeechRecognition
   
  interface Window {
    [key: string]: any; // Allow dynamic access for SpeechRecognition/webkitSpeechRecognition
  }
}


export const useVoiceSearch = (): VoiceSearchHook => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const autoStopRef = useRef<NodeJS.Timeout>();
  const isMountedRef = useRef(true);

  const clearError = () => setError(null);

  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  useEffect(() => {
    isMountedRef.current = true;
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognitionInstance = new SpeechRecognition();

    recognitionInstance.continuous = true;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = 'en-US';

    recognitionInstance.onresult = (event: SpeechRecognitionEventCompat) => {
      if (!isMountedRef.current) return;
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
          setConfidence(event.results[i][0].confidence);
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        const cleanedTranscript = finalTranscript.trim().replace(/[.!?]+$/, '');
        setTranscript(cleanedTranscript);

        // Clear existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Auto-stop after 1 second of silence
        timeoutRef.current = setTimeout(() => {
          recognitionInstance.stop();
        }, 1000);
      } else if (interimTranscript) {
        // Show interim results for feedback
        setTranscript(interimTranscript.trim());
      }
    };

    recognitionInstance.onstart = () => {
      if (!isMountedRef.current) return;
      setIsListening(true);
      setTranscript('');
      setConfidence(0);

      // Auto-stop after 3 seconds regardless
      autoStopRef.current = setTimeout(() => {
        recognitionInstance.stop();
      }, 3000);
    };

    recognitionInstance.onend = () => {
      if (!isMountedRef.current) return;
      setIsListening(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (autoStopRef.current) {
        clearTimeout(autoStopRef.current);
      }
    };

    recognitionInstance.onerror = (event: SpeechRecognitionErrorEventCompat) => {
      if (!isMountedRef.current) return;
      console.error('Speech recognition error:', event.error);

      // Mapear erro para mensagem amigável
      const errorMessage = VOICE_ERROR_MESSAGES[event.error] || `Erro no reconhecimento de voz: ${event.error}`;
      setError(errorMessage);

      setIsListening(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (autoStopRef.current) {
        clearTimeout(autoStopRef.current);
      }
    };

    setRecognition(recognitionInstance);

    return () => {
      isMountedRef.current = false;
      recognitionInstance.stop();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (autoStopRef.current) {
        clearTimeout(autoStopRef.current);
      }
    };
  }, [isSupported]);

  const startListening = () => {
    if (recognition && !isListening) {
      setTranscript('');
      setConfidence(0);
      setError(null); // Limpar erro anterior
      recognition.start();
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop();
    }
  };

  const resetTranscript = () => {
    setTranscript('');
    setConfidence(0);
  };

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
    confidence,
    error,
    clearError
  };
};
