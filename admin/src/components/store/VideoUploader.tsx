/**
 * ============================================================================
 * Video Uploader Component
 * ============================================================================
 *
 * Firebase Storage upload with drag-and-drop, progress bar, and validation.
 * Uploads to: gs://bucket/franchises/{fId}/stores/{sId}/media/attract_video.{ext}
 *
 * Accepts: video/mp4, video/webm
 * Max size: 50MB
 */

import { useState, useRef, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, X, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_TYPES = ['video/mp4', 'video/webm'];

interface VideoUploaderProps {
  franchiseId: string;
  storeId: string;
  currentUrl?: string;
  onUploadComplete: (downloadUrl: string, contentType: string) => void;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export function VideoUploader({ franchiseId, storeId, currentUrl, onUploadComplete }: VideoUploaderProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setErrorMessage('');

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrorMessage(`Tipo "${file.type}" não suportado. Use MP4 ou WebM.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage(`Arquivo muito grande (${(file.size / (1024 * 1024)).toFixed(1)}MB). Máximo: 50MB.`);
      return;
    }

    const ext = file.type === 'video/webm' ? 'webm' : 'mp4';
    const storagePath = `franchises/${franchiseId}/stores/${storeId}/media/attract_video.${ext}`;
    const storageRef = ref(storage, storagePath);

    setUploadState('uploading');
    setProgress(0);

    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setProgress(Math.round(pct));
      },
      (error) => {
        console.error('[VideoUploader] Upload error:', error);
        setUploadState('error');
        setErrorMessage(error.message || 'Erro ao fazer upload');
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadState('success');
          onUploadComplete(downloadUrl, file.type);
        } catch (error) {
          setUploadState('error');
          setErrorMessage('Erro ao obter URL do arquivo');
        }
      }
    );
  }, [franchiseId, storeId, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  }, [handleFile]);

  return (
    <div className="space-y-3">
      <Label>Upload de Vídeo</Label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-colors
          ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${uploadState === 'uploading' ? 'pointer-events-none opacity-60' : ''}
        `}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm"
          className="hidden"
          onChange={handleFileInput}
        />

        {uploadState === 'uploading' ? (
          <div className="space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
            <p className="text-sm text-gray-600">Enviando... {progress}%</p>
            <div className="w-full bg-gray-200 rounded-full h-2 max-w-xs mx-auto">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : uploadState === 'success' ? (
          <div className="space-y-2">
            <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
            <p className="text-sm text-green-700">Upload concluído</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setUploadState('idle'); }}
            >
              Enviar outro
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-gray-400" />
            <p className="text-sm text-gray-600">
              Arraste um vídeo aqui ou clique para selecionar
            </p>
            <p className="text-xs text-gray-400">
              MP4 ou WebM, máximo 50MB
            </p>
          </div>
        )}
      </div>

      {/* Error */}
      {errorMessage && (
        <Alert className="border-red-300 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700 flex items-center justify-between">
            <span>{errorMessage}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => { setErrorMessage(''); setUploadState('idle'); }}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Current URL hint */}
      {currentUrl && uploadState === 'idle' && (
        <p className="text-xs text-gray-400 truncate">
          URL atual: {currentUrl}
        </p>
      )}

      {/* Tips */}
      <p className="text-xs text-gray-500">
        Use vídeos MP4 diretos. Plataformas recomendadas: Firebase Storage, Cloudinary, AWS S3, Bunny CDN. Links de download do Pexels/Pixabay geralmente não funcionam por CORS/redirect.
      </p>
    </div>
  );
}
