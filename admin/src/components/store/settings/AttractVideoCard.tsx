/**
 * ============================================================================
 * Attract Video Card
 * ============================================================================
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Video, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { validateVideoUrl, getVideoValidationLabel, type ValidationResult } from '@/utils/videoUrlValidator';
import { generateAttractVideoCacheKey } from '@/utils/attractVideoCacheKey';
import { VideoUploader, type UploadedVideoResult } from '../VideoUploader';
import type { AttractVideoConfig } from '../../../../shared/types/store';

export interface AttractVideoCardProps {
  videoConfig: AttractVideoConfig;
  franchiseId: string;
  storeId: string;
  onVideoConfigChange: (update: Partial<AttractVideoConfig>) => void;
}

const statusStyles: Record<ValidationResult['status'], string> = {
  valid: 'text-green-700',
  remote_only: 'text-amber-700',
  invalid: 'text-red-700',
};

export function AttractVideoCard({ videoConfig, franchiseId, storeId, onVideoConfigChange }: AttractVideoCardProps) {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const handleValidateUrl = async () => {
    if (!videoConfig.videoUrl) {
      return;
    }

    setValidating(true);
    setValidationResult(null);

    try {
      const result = await validateVideoUrl(videoConfig.videoUrl);
      setValidationResult(result);
      onVideoConfigChange({
        cacheKey: result.cacheable ? generateAttractVideoCacheKey() : undefined,
        lastValidatedAt: new Date().toISOString(),
        lastValidationResult: result.status,
        contentType: result.contentType,
        contentLength: result.contentLength,
        width: result.width,
        height: result.height,
        durationSeconds: result.durationSeconds,
        containerFormat: result.containerFormat,
        videoCodec: result.videoCodec || undefined,
        codecProfile: result.codecProfile || undefined,
        codecLevel: result.codecLevel || undefined,
      });
    } finally {
      setValidating(false);
    }
  };

  const handleUploadComplete = ({
    downloadUrl,
    contentType,
    cacheKey,
    contentLength,
    width,
    height,
    durationSeconds,
    containerFormat,
    videoCodec,
    codecProfile,
    codecLevel,
  }: UploadedVideoResult) => {
    const nextResult: ValidationResult = {
      status: 'valid',
      message: 'Upload concluido. Asset cacheavel no kiosk.',
      contentType,
      contentLength,
      width,
      height,
      durationSeconds,
      containerFormat,
      videoCodec,
      codecProfile,
      codecLevel,
      cacheable: true,
    };

    setValidationResult(nextResult);
    onVideoConfigChange({
      videoUrl: downloadUrl,
      cacheKey,
      contentType,
      contentLength,
      width,
      height,
      durationSeconds,
      containerFormat,
      videoCodec: videoCodec || undefined,
      codecProfile: codecProfile || undefined,
      codecLevel: codecLevel || undefined,
      lastValidatedAt: new Date().toISOString(),
      lastValidationResult: 'valid',
    });
  };

  const currentStatus = validationResult?.status || videoConfig.lastValidationResult;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Video className="h-5 w-5 mr-2" />
          Video de Fundo (Tela de Atracao)
        </CardTitle>
        <CardDescription>
          Configure o video exibido na tela de atracao do Kiosk quando ocioso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label>Habilitar Video</Label>
            <p className="text-sm text-muted-foreground">Reproduzir video de fundo na tela de atracao</p>
          </div>
          <Switch
            checked={videoConfig.isEnabled ?? false}
            onCheckedChange={(value) => onVideoConfigChange({ isEnabled: value })}
          />
        </div>

        {videoConfig.isEnabled && (
          <>
            <div className="space-y-2">
              <Label>URL do Video</Label>
              <div className="flex gap-2">
                <Input
                  value={videoConfig.videoUrl || ''}
                    onChange={(event) => {
                      onVideoConfigChange({
                        videoUrl: event.target.value,
                        cacheKey: undefined,
                        lastValidatedAt: undefined,
                        lastValidationResult: undefined,
                        contentType: undefined,
                        contentLength: undefined,
                        width: undefined,
                        height: undefined,
                        durationSeconds: undefined,
                        containerFormat: undefined,
                        videoCodec: undefined,
                        codecProfile: undefined,
                        codecLevel: undefined,
                      });
                      setValidationResult(null);
                    }}
                  placeholder="https://cdn.exemplo.com/video.mp4"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleValidateUrl}
                  disabled={validating || !videoConfig.videoUrl}
                >
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validar'}
                </Button>
              </div>

              {currentStatus && (
                <p className="text-xs font-medium text-muted-foreground">
                  Status: {getVideoValidationLabel(currentStatus as ValidationResult['status'])}
                </p>
              )}

              {validationResult && (
                <div className={`flex items-center gap-2 text-sm ${statusStyles[validationResult.status]}`}>
                  {validationResult.status === 'valid' && <CheckCircle className="h-4 w-4" />}
                  {validationResult.status === 'remote_only' && <AlertTriangle className="h-4 w-4" />}
                  {validationResult.status === 'invalid' && <XCircle className="h-4 w-4" />}
                  <span>{validationResult.message}</span>
                </div>
              )}

              {videoConfig.cacheKey && (
                <p className="text-xs text-muted-foreground">
                  Cache key atual: <span className="font-mono">{videoConfig.cacheKey}</span>
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Politica recomendada: MP4 1080p, bitrate medio ate 8 Mbps e preferencia por assets em Firebase Storage.
              </p>
            </div>

            <VideoUploader
              franchiseId={franchiseId}
              storeId={storeId}
              currentUrl={videoConfig.videoUrl}
              onUploadComplete={handleUploadComplete}
            />

            <div>
              <Label>Titulo Customizado</Label>
              <Input
                value={videoConfig.displayTitle || ''}
                onChange={(event) => onVideoConfigChange({ displayTitle: event.target.value })}
                placeholder="Faca seu pedido aqui"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground mt-1">Exibido sobre o video na tela de atracao</p>
            </div>

            <div>
              <Label>Subtitulo Customizado</Label>
              <Input
                value={videoConfig.displaySubtitle || ''}
                onChange={(event) => onVideoConfigChange({ displaySubtitle: event.target.value })}
                placeholder="Toque para iniciar"
                maxLength={200}
              />
            </div>

            <div>
              <Label>Opacidade do Video: {Math.round((videoConfig.videoOpacity ?? 0.4) * 100)}%</Label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round((videoConfig.videoOpacity ?? 0.4) * 100)}
                onChange={(event) => onVideoConfigChange({ videoOpacity: Number(event.target.value) / 100 })}
                className="w-full mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Controla o escurecimento sobre o video (0% = invisivel, 100% = sem escurecimento)
              </p>
            </div>

            <div>
              <Label>Modo de Preenchimento</Label>
              <Select
                value={videoConfig.videoCoverMode || 'cover'}
                onValueChange={(value) => onVideoConfigChange({ videoCoverMode: value as 'cover' | 'contain' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Preencher (cover)</SelectItem>
                  <SelectItem value="contain">Ajustar (contain)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
