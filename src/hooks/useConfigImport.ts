/**
 * useConfigImport Hook
 * 
 * Permite importar configurações de Firebase via:
 * - Arquivo JSON
 * - Clipboard (copiar/colar)
 * - Copiar campos individuais
 */

import { useCallback } from 'react';
import {
  importConfigFromFile,
  importConfigFromClipboard,
  exportConfigToClipboard,
  PartialStoreConfig
} from '@/services/environmentConfigLoader';
import { useToast } from './use-toast';

interface UseConfigImportReturn {
  handleFileImport: (file: File) => Promise<PartialStoreConfig | null>;
  handleClipboardImport: () => Promise<PartialStoreConfig | null>;
  handleCopyToClipboard: (text: string, fieldName: string) => Promise<boolean>;
  handleExportConfig: (settings: PartialStoreConfig) => Promise<boolean>;
}

/**
 * Hook para gerenciar import/export de configurações
 */
export const useConfigImport = (): UseConfigImportReturn => {
  const { toast } = useToast();

  /**
   * Importar config de arquivo JSON
   */
  const handleFileImport = useCallback(
    async (file: File): Promise<PartialStoreConfig | null> => {
      try {
        if (!file.name.endsWith('.json')) {
          toast({
            title: 'Invalid File',
            description: 'Por favor, selecione um arquivo .json válido',
            variant: 'destructive'
          });
          return null;
        }

        const config = await importConfigFromFile(file);

        toast({
          title: 'Config Imported',
          description: `Configuração carregada de ${file.name}`
        });

        return config;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[useConfigImport] File import error:', error);

        toast({
          title: 'Import Error',
          description: errorMessage,
          variant: 'destructive'
        });

        return null;
      }
    },
    [toast]
  );

  /**
   * Importar config do clipboard
   */
  const handleClipboardImport = useCallback(
    async (): Promise<PartialStoreConfig | null> => {
      try {
        // Verificar se navegador suporta clipboard API
        if (!navigator.clipboard) {
          toast({
            title: 'Not Supported',
            description: 'Seu navegador não suporta clipboard API',
            variant: 'destructive'
          });
          return null;
        }

        const config = await importConfigFromClipboard();

        toast({
          title: 'Config Pasted',
          description: 'Configuração carregada do clipboard'
        });

        return config;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[useConfigImport] Clipboard import error:', error);

        toast({
          title: 'Paste Error',
          description: errorMessage,
          variant: 'destructive'
        });

        return null;
      }
    },
    [toast]
  );

  /**
   * Copiar texto individual para clipboard
   */
  const handleCopyToClipboard = useCallback(
    async (text: string, fieldName: string): Promise<boolean> => {
      try {
        if (!navigator.clipboard) {
          toast({
            title: 'Not Supported',
            description: 'Seu navegador não suporta clipboard API',
            variant: 'destructive'
          });
          return false;
        }

        await navigator.clipboard.writeText(text);

        toast({
          title: 'Copied',
          description: `${fieldName} copiado para clipboard`
        });

        return true;
      } catch (error) {
        console.error('[useConfigImport] Copy to clipboard error:', error);

        toast({
          title: 'Copy Error',
          description: 'Erro ao copiar para clipboard',
          variant: 'destructive'
        });

        return false;
      }
    },
    [toast]
  );

  /**
   * Exportar configuração completa para clipboard
   */
  const handleExportConfig = useCallback(
    async (settings: PartialStoreConfig): Promise<boolean> => {
      try {
        if (!navigator.clipboard) {
          toast({
            title: 'Not Supported',
            description: 'Seu navegador não suporta clipboard API',
            variant: 'destructive'
          });
          return false;
        }

        const success = await exportConfigToClipboard(settings);

        if (success) {
          toast({
            title: 'Config Copied',
            description: 'Configuração completa copiada para clipboard'
          });
        }

        return success;
      } catch (error) {
        console.error('[useConfigImport] Export config error:', error);

        toast({
          title: 'Export Error',
          description: 'Erro ao exportar configuração',
          variant: 'destructive'
        });

        return false;
      }
    },
    [toast]
  );

  return {
    handleFileImport,
    handleClipboardImport,
    handleCopyToClipboard,
    handleExportConfig
  };
};
