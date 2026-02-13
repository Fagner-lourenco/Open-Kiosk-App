/**
 * ============================================================================
 * Attract Video Card
 * ============================================================================
 *
 * Sub-component for StoreSettingsTab: configures the attract-screen background
 * video (URL, upload, opacity, cover mode, titles).
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
import { validateVideoUrl, type ValidationResult } from '@/utils/videoUrlValidator';
import { VideoUploader } from '../VideoUploader';
import type { AttractVideoConfig } from '../../../../shared/types/store';

export interface AttractVideoCardProps {
  videoConfig: AttractVideoConfig;
  franchiseId: string;
  storeId: string;
  onVideoConfigChange: (update: Partial<AttractVideoConfig>) => void;
}

export function AttractVideoCard({ videoConfig, franchiseId, storeId, onVideoConfigChange }: AttractVideoCardProps) {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const handleValidateUrl = async () => {
    if (!videoConfig.videoUrl) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await validateVideoUrl(videoConfig.videoUrl);
      setValidationResult(result);
      // Store validation metadata in the config
      onVideoConfigChange({
        lastValidatedAt: new Date().toISOString(),
        lastValidationResult: result.status,
        contentType: result.contentType,
      });
    } finally {
      setValidating(false);
    }
  };

  const handleUploadComplete = (downloadUrl: string, contentType: string) => {
    onVideoConfigChange({
      videoUrl: downloadUrl,
      contentType,
      lastValidatedAt: new Date().toISOString(),
      lastValidationResult: 'valid',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Video className="h-5 w-5 mr-2" />
          Vídeo de Fundo (Tela de Atração)
        </CardTitle>
        <CardDescription>
          Configure o vídeo exibido na tela de atração do Kiosk quando ocioso
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable video toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label>Habilitar Vídeo</Label>
            <p className="text-sm text-muted-foreground">Reproduzir vídeo de fundo na tela de atração</p>
          </div>
          <Switch
            checked={videoConfig.isEnabled ?? false}
            onCheckedChange={(v) => onVideoConfigChange({ isEnabled: v })}
          />
        </div>

        {videoConfig.isEnabled && (
          <>
            {/* Video URL input + validate button */}
            <div className="space-y-2">
              <Label>URL do Vídeo</Label>
              <div className="flex gap-2">
                <Input
                  value={videoConfig.videoUrl || ''}
                  onChange={(e) => {
                    onVideoConfigChange({ videoUrl: e.target.value });
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
                  {validating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Validar'
                  )}
                </Button>
              </div>

              {/* Validation result badge */}
              {validationResult && (
                <div className={`flex items-center gap-2 text-sm ${
                  validationResult.status === 'valid' ? 'text-green-700' :
                  validationResult.status === 'cors_warning' ? 'text-yellow-700' :
                  'text-red-700'
                }`}>
                  {validationResult.status === 'valid' && <CheckCircle className="h-4 w-4" />}
                  {validationResult.status === 'cors_warning' && <AlertTriangle className="h-4 w-4" />}
                  {validationResult.status === 'invalid' && <XCircle className="h-4 w-4" />}
                  <span>{validationResult.message}</span>
                </div>
              )}
            </div>

            {/* Upload section */}
            <VideoUploader
              franchiseId={franchiseId}
              storeId={storeId}
              currentUrl={videoConfig.videoUrl}
              onUploadComplete={handleUploadComplete}
            />

            {/* Display title */}
            <div>
              <Label>Título Customizado</Label>
              <Input
                value={videoConfig.displayTitle || ''}
                onChange={(e) => onVideoConfigChange({ displayTitle: e.target.value })}
                placeholder="Faça seu pedido aqui"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground mt-1">Exibido sobre o vídeo na tela de atração</p>
            </div>

            {/* Display subtitle */}
            <div>
              <Label>Subtítulo Customizado</Label>
              <Input
                value={videoConfig.displaySubtitle || ''}
                onChange={(e) => onVideoConfigChange({ displaySubtitle: e.target.value })}
                placeholder="Toque para iniciar"
                maxLength={200}
              />
            </div>

            {/* Opacity slider */}
            <div>
              <Label>Opacidade do Vídeo: {Math.round((videoConfig.videoOpacity ?? 0.4) * 100)}%</Label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round((videoConfig.videoOpacity ?? 0.4) * 100)}
                onChange={(e) => onVideoConfigChange({ videoOpacity: Number(e.target.value) / 100 })}
                className="w-full mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Controla o escurecimento sobre o vídeo (0% = invisível, 100% = sem escurecimento)
              </p>
            </div>

            {/* Cover mode */}
            <div>
              <Label>Modo de Preenchimento</Label>
              <Select
                value={videoConfig.videoCoverMode || 'cover'}
                onValueChange={(v) => onVideoConfigChange({ videoCoverMode: v as 'cover' | 'contain' })}
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
