/**
 * ============================================================================
 * Video Uploader Component
 * ============================================================================
 *
 * Firebase Storage upload with drag-and-drop, progress bar, and validation.
 * Uploads to: gs://bucket/franchises/{fId}/stores/{sId}/media/attract_video.{ext}
 */

import { useState, useRef, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, X, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { generateAttractVideoCacheKey } from '@/utils/attractVideoCacheKey';
import {
  ATTRACT_VIDEO_POLICY,
  evaluateAttractVideoPolicy,
} from '../../../shared/utils/attractVideoPolicy';
import { inspectVideoFile } from '@/utils/videoMetadataInspector';

const MAX_FILE_SIZE = ATTRACT_VIDEO_POLICY.hardMaxFileSizeBytes;
const RECOMMENDED_FILE_SIZE = ATTRACT_VIDEO_POLICY.recommendedFileSizeBytes;
const ACCEPTED_TYPES = ['video/mp4'];

export interface UploadedVideoResult {
  downloadUrl: string;
  contentType: string;
  cacheKey: string;
  contentLength: number;
  width: number;
  height: number;
  durationSeconds: number;
  containerFormat: 'mp4' | 'webm' | 'unknown';
  videoCodec: string | null;
  codecProfile: string | null;
  codecLevel: string | null;
}

interface VideoUploaderProps {
  franchiseId: string;
  storeId: string;
  currentUrl?: string;
  onUploadComplete: (result: UploadedVideoResult) => void;
}

type UploadState = 'idle' | 'validating' | 'uploading' | 'success' | 'error';

export function VideoUploader({ franchiseId, storeId, currentUrl, onUploadComplete }: VideoUploaderProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setErrorMessage('');
    setNoticeMessage('');
    let inspection: Awaited<ReturnType<typeof inspectVideoFile>> | null = null;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadState('error');
      setErrorMessage(`Tipo "${file.type}" nao suportado. Use MP4 ou WebM.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadState('error');
      setErrorMessage(`Arquivo muito grande (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limite de upload: ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB.`);
      return;
    }

    setUploadState('validating');

    try {
      inspection = await inspectVideoFile(file);
      const policy = evaluateAttractVideoPolicy({
        width: inspection.width,
        height: inspection.height,
        durationSeconds: inspection.durationSeconds,
        contentLength: file.size,
        containerFormat: inspection.containerFormat,
        videoCodec: inspection.videoCodec,
        codecProfile: inspection.codecProfile,
        codecLevel: inspection.codecLevel,
      });

      if (policy.status === 'invalid') {
        setUploadState('error');
        setErrorMessage(`Video fora da politica do kiosk. ${policy.summary}`);
        return;
      }

      if (policy.status === 'warning') {
        setNoticeMessage(policy.summary);
      }
    } catch (error) {
      setUploadState('error');
      setErrorMessage(
        `Nao foi possivel analisar o video antes do upload. ${error instanceof Error ? error.message : 'Falha desconhecida.'}`,
      );
      return;
    }

    if (!inspection) {
      setUploadState('error');
      setErrorMessage('Nao foi possivel validar o video antes do upload.');
      return;
    }

    const storagePath = `franchises/${franchiseId}/stores/${storeId}/media/attract_video.mp4`;
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
          onUploadComplete({
            downloadUrl,
            contentType: file.type,
            cacheKey: generateAttractVideoCacheKey(),
            contentLength: file.size,
            width: inspection.width,
            height: inspection.height,
            durationSeconds: inspection.durationSeconds,
            containerFormat: inspection.containerFormat,
            videoCodec: inspection.videoCodec,
            codecProfile: inspection.codecProfile,
            codecLevel: inspection.codecLevel,
          });
        } catch (error) {
          setUploadState('error');
          setErrorMessage('Erro ao obter URL do arquivo');
        }
      },
    );
  }, [franchiseId, storeId, onUploadComplete]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleFileInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    event.target.value = '';
  }, [handleFile]);

  return (
    <div className="space-y-3">
      <Label>Upload de Video</Label>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-colors
          ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${uploadState === 'uploading' || uploadState === 'validating' ? 'pointer-events-none opacity-60' : ''}
        `}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4"
          className="hidden"
          onChange={handleFileInput}
        />

        {uploadState === 'uploading' || uploadState === 'validating' ? (
          <div className="space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
            {uploadState === 'validating' ? (
              <p className="text-sm text-muted-foreground">Analisando compatibilidade do video...</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Enviando... {progress}%</p>
                <div className="w-full bg-muted rounded-full h-2 max-w-xs mx-auto">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </>
            )}
          </div>
        ) : uploadState === 'success' ? (
          <div className="space-y-2">
            <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
            <p className="text-sm text-green-700">Upload concluido</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setUploadState('idle');
              }}
            >
              Enviar outro
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Arraste um video aqui ou clique para selecionar
            </p>
            <p className="text-xs text-muted-foreground">
              MP4 (H.264). Recomendado ate {(RECOMMENDED_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB, limite de upload {(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB.
            </p>
          </div>
        )}
      </div>

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
              onClick={() => {
                setErrorMessage('');
                setUploadState('idle');
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {noticeMessage && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            {noticeMessage}
          </AlertDescription>
        </Alert>
      )}

      {currentUrl && uploadState === 'idle' && (
        <p className="text-xs text-muted-foreground truncate">
          URL atual: {currentUrl}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Upload em Firebase Storage gera um novo cacheKey automaticamente para forcar refresh no kiosk. Links externos podem cair em "playback remoto apenas" e nao ficam disponiveis offline.
      </p>

      {uploadState === 'idle' && (
        <p className="text-xs text-muted-foreground">
          Politica do kiosk: ate 1080p, bitrate medio ate 8 Mbps e preferencialmente ate {(RECOMMENDED_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB.
        </p>
      )}
    </div>
  );
}
