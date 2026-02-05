
// Define Web Speech API types
export interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
}

export interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}

export interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}
export interface VoiceSearchHook {
    isListening: boolean;
    transcript: string;
    startListening: () => void;
    stopListening: () => void;
    resetTranscript: () => void;
    isSupported: boolean;
    confidence: number;
    error: string | null;
    clearError: () => void;
}

export const VOICE_ERROR_MESSAGES: Record<string, string> = {
    'not-allowed': 'Permissão de microfone negada. Habilite nas configurações do navegador.',
    'no-speech': 'Nenhuma fala detectada. Tente novamente.',
    'audio-capture': 'Microfone não disponível.',
    'network': 'Erro de rede. Verifique sua conexão.',
    'aborted': 'Reconhecimento cancelado.',
    'language-not-supported': 'Idioma não suportado.',
};
