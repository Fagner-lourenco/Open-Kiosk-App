/**
 * ESP32TestPanel - Painel de teste para dispensação
 * 
 * Usa o ESP32Context (serviço unificado) para comunicação.
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { useESP32 } from "@/context/ESP32Context";
import esp32Serial from "@/services/esp32SerialService";
import { Beaker, Loader2, CheckCircle, XCircle, Wifi, WifiOff } from "lucide-react";
import { TapSelector, useTapSelection } from "@/components/TapSelector";

export function ESP32TestPanel() {
  const { toast } = useToast();
  const { settings: storeSettings } = useStoreSettings();
  const [isTesting, setIsTesting] = useState(false);
  const [testMl, setTestMl] = useState(300);
  const [testQuantity, setTestQuantity] = useState(1);
  const [lastResponse, setLastResponse] = useState<string>("");
  
  // Usar ESP32Context para status e comandos unificados
  const { status, releaseDrink, isConnecting, numTaps } = useESP32();
  const isConnected = status.connected;
  
  // 🆕 Multi-Tap: Seleção de torneira para teste
  const { selectedTapId, setSelectedTapId, showSelector: showTapSelector } = useTapSelection();

  const handleConnect = async () => {
    try {
      const connected = await esp32Serial.connect();
      
      if (connected) {
        toast({
          title: "✅ ESP32 Conectado",
          description: "Conectado via USB Serial",
        });
      } else {
        toast({
          title: "❌ Falha na conexão",
          description: "Não foi possível conectar ao ESP32",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "❌ Erro de Conexão",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      await esp32Serial.disconnect();
      toast({
        title: "🔌 Desconectado",
        description: "ESP32 desconectado com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro ao desconectar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  };

  const handleTestDispense = async () => {
    setIsTesting(true);
    setLastResponse("");

    try {
      // Usar o serviço unificado via ESP32Context
      const success = await releaseDrink(
        `TEST-${Date.now()}`,
        testMl,
        testQuantity,
        `Teste ${testMl}ml`,
        selectedTapId // 🆕 Multi-Tap: passar tapId selecionado
      );

      setLastResponse(JSON.stringify({ success, timestamp: new Date().toISOString() }, null, 2));

      if (success) {
        toast({
          title: "🎯 Comando Enviado",
          description: `Dispensando ${testMl}ml x ${testQuantity} copo(s)`,
        });
      } else {
        toast({
          title: "❌ Falha no Envio",
          description: "Não foi possível enviar comando. Verifique a conexão.",
          variant: "destructive"
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
      setLastResponse(JSON.stringify({ error: errorMsg }, null, 2));
      
      toast({
        title: "❌ Erro no Teste",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Beaker className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold">Painel de Teste ESP32</h3>
            <p className="text-sm text-gray-500">
              Teste o dispensador de bebidas
            </p>
          </div>
        </div>
        
        <Badge variant={isConnected ? "default" : "secondary"} className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4" />
              Conectado
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4" />
              Desconectado
            </>
          )}
        </Badge>
      </div>

      {/* Conexão */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Conexão USB Serial</Label>
        <div className="flex items-center gap-3">
          <Input 
            value={isConnected ? (status.deviceName || "USB Serial") : "Não conectado"}
            disabled
            className="flex-1"
          />
          {isConnected ? (
            <Button 
              variant="outline" 
              onClick={handleDisconnect}
              className="w-32"
            >
              Desconectar
            </Button>
          ) : (
            <Button 
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-32"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                "Conectar"
              )}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Clique em Conectar para selecionar a porta USB no navegador.
        </p>
      </div>

      {/* Configuração do Teste */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="test-ml">Volume (ml)</Label>
          <Input
            id="test-ml"
            type="number"
            min={50}
            max={1000}
            step={50}
            value={testMl}
            onChange={(e) => setTestMl(Number(e.target.value))}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="test-quantity">Quantidade de Copos</Label>
          <Input
            id="test-quantity"
            type="number"
            min={1}
            max={10}
            value={testQuantity}
            onChange={(e) => setTestQuantity(Number(e.target.value))}
            className="mt-1"
          />
        </div>
      </div>

      {/* 🆕 Multi-Tap: Seleção de Torneira */}
      {showTapSelector && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Torneira para Teste</Label>
          <TapSelector
            selectedTapId={selectedTapId}
            onSelectTap={setSelectedTapId}
            mode="compact"
            className="bg-gray-50 p-3 rounded-lg"
          />
          <p className="text-xs text-muted-foreground">
            {numTaps} torneira(s) detectada(s) no ESP32
          </p>
        </div>
      )}

      {/* Botão de Teste */}
      <Button
        onClick={handleTestDispense}
        disabled={isTesting || (!isConnected && !storeSettings?.comPort)}
        className="w-full h-12 text-base"
        variant="default"
      >
        {isTesting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Enviando Comando...
          </>
        ) : (
          <>
            <Beaker className="w-5 h-5 mr-2" />
            Testar Dispensação ({testMl}ml x {testQuantity})
          </>
        )}
      </Button>

      {/* Presets Rápidos */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Presets Rápidos</Label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setTestMl(300); setTestQuantity(1); }}
          >
            300ml x1
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setTestMl(500); setTestQuantity(1); }}
          >
            500ml x1
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setTestMl(500); setTestQuantity(2); }}
          >
            500ml x2
          </Button>
        </div>
      </div>

      {/* Resposta */}
      {lastResponse && (
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-2">
            {lastResponse.includes("success") ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-600" />
                Resposta do Sistema
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-red-600" />
                Erro na Resposta
              </>
            )}
          </Label>
          <pre className="bg-gray-100 p-3 rounded-lg text-xs overflow-x-auto">
            {lastResponse}
          </pre>
        </div>
      )}

      {/* JSON Exemplo */}
      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer font-medium mb-2">
          📄 Exemplo de JSON Enviado
        </summary>
        <pre className="bg-gray-50 p-3 rounded border text-[10px] overflow-x-auto">
{`{
  "action": "release_drink",
  "orderId": "TEST-1703612345678",
  "sizeLabel": "Teste 500ml",
  "mlPerUnit": 500,
  "quantity": 2,
  "timestamp": "2025-12-26T15:30:45.123Z"
}`}
        </pre>
      </details>

      {/* Instruções */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
        <p className="font-semibold text-blue-900 mb-2">ℹ️ Instruções:</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-800">
          <li>Configure a porta COM em Admin → Configurações</li>
          <li>Conecte o ESP32 via USB</li>
          <li>Clique em "Conectar" para estabelecer comunicação</li>
          <li>Defina o volume e quantidade</li>
          <li>Clique em "Testar Dispensação"</li>
          <li>Monitore o Serial Monitor do Arduino IDE (9600 bps)</li>
        </ol>
      </div>
    </Card>
  );
}
