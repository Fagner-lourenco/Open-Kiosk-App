/**
 * ============================================================================
 * AdminDispensers - Gerenciamento de Torneiras
 * ============================================================================
 * 
 * Componente para administração de dispensers/torneiras no painel admin.
 * 
 * Funcionalidades:
 * - Listagem de torneiras
 * - Criação/edição de torneiras
 * - Configuração de hardware (GPIO pins)
 * - Calibração
 * - Vinculação com produtos
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { useDispensers } from '@/hooks/useDispensers';
import { StoreDispenser, DispenserHardwareConfig, DispenserCalibration } from '@/types/franchise';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/i18n';
import { 
  Plus, 
  Settings, 
  Trash2, 
  Wifi, 
  Usb, 
  Bluetooth, 
  Power, 
  AlertCircle,
  RefreshCw,
  Droplets,
  Gauge,
} from 'lucide-react';

// ============================================================================
// TIPOS LOCAIS
// ============================================================================

interface DispenserFormData {
  name: string;
  icon: string;
  color: string;
  hardware: DispenserHardwareConfig;
  calibration: DispenserCalibration;
}

// ============================================================================
// ÍCONES DE CONEXÃO
// ============================================================================

const ConnectionIcon = ({ type }: { type: 'usb' | 'wifi' | 'bluetooth' }) => {
  switch (type) {
    case 'usb':
      return <Usb className="h-4 w-4" />;
    case 'wifi':
      return <Wifi className="h-4 w-4" />;
    case 'bluetooth':
      return <Bluetooth className="h-4 w-4" />;
  }
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function AdminDispensers() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    dispensers,
    loading,
    error,
    refresh,
    createDispenser,
    updateDispenser,
    deleteDispenser,
    toggleDispenser,
    getDefaultDispenser,
  } = useDispensers();

  // Estado do formulário
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDispenser, setEditingDispenser] = useState<StoreDispenser | null>(null);
  const [formData, setFormData] = useState<DispenserFormData>(() => {
    const defaults = getDefaultDispenser();
    return {
      name: defaults.name,
      icon: defaults.icon,
      color: defaults.color,
      hardware: defaults.hardware,
      calibration: defaults.calibration,
    };
  });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const resetForm = () => {
    const defaults = getDefaultDispenser();
    setFormData({
      name: defaults.name,
      icon: defaults.icon,
      color: defaults.color,
      hardware: defaults.hardware,
      calibration: defaults.calibration,
    });
    setEditingDispenser(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (dispenser: StoreDispenser) => {
    setEditingDispenser(dispenser);
    setFormData({
      name: dispenser.name,
      icon: dispenser.icon,
      color: dispenser.color,
      hardware: dispenser.hardware,
      calibration: dispenser.calibration,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingDispenser) {
        await updateDispenser(editingDispenser.id, {
          name: formData.name,
          icon: formData.icon,
          color: formData.color,
          hardware: formData.hardware,
          calibration: formData.calibration,
        });
        toast({
          title: 'Sucesso',
          description: 'Torneira atualizada',
        });
      } else {
        await createDispenser({
          ...getDefaultDispenser(),
          name: formData.name,
          icon: formData.icon,
          color: formData.color,
          hardware: formData.hardware,
          calibration: formData.calibration,
        });
        toast({
          title: 'Sucesso',
          description: 'Torneira criada',
        });
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      toast({
        title: 'Erro',
        description: err instanceof Error ? err.message : 'Erro ao salvar',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (dispenserId: string) => {
    try {
      await deleteDispenser(dispenserId);
      toast({
        title: 'Sucesso',
        description: 'Torneira removida',
      });
      setDeleteConfirmId(null);
    } catch (err) {
      toast({
        title: 'Erro',
        description: err instanceof Error ? err.message : 'Erro ao remover',
        variant: 'destructive',
      });
    }
  };

  const handleToggle = async (dispenser: StoreDispenser) => {
    try {
      await toggleDispenser(dispenser.id, !dispenser.isActive);
      toast({
        title: dispenser.isActive ? 'Desativada' : 'Ativada',
        description: `Torneira ${dispenser.name} foi ${dispenser.isActive ? 'desativada' : 'ativada'}`,
      });
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Erro ao alterar status',
        variant: 'destructive',
      });
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2">Carregando torneiras...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Droplets className="h-6 w-6" />
            Torneiras / Dispensers
          </h2>
          <p className="text-muted-foreground">
            Gerencie as torneiras conectadas ao sistema
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Torneira
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingDispenser ? 'Editar Torneira' : 'Nova Torneira'}
                </DialogTitle>
                <DialogDescription>
                  Configure as informações e parâmetros da torneira
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="basic" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Básico</TabsTrigger>
                  <TabsTrigger value="hardware">Hardware</TabsTrigger>
                  <TabsTrigger value="calibration">Calibração</TabsTrigger>
                </TabsList>

                {/* Tab Básico */}
                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="Ex: Torneira 1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="icon">Ícone</Label>
                      <Input
                        id="icon"
                        value={formData.icon}
                        onChange={(e) =>
                          setFormData({ ...formData, icon: e.target.value })
                        }
                        placeholder="🍺"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="color">Cor</Label>
                    <div className="flex gap-2">
                      <Input
                        id="color"
                        type="color"
                        value={formData.color}
                        onChange={(e) =>
                          setFormData({ ...formData, color: e.target.value })
                        }
                        className="w-20 h-10"
                      />
                      <Input
                        value={formData.color}
                        onChange={(e) =>
                          setFormData({ ...formData, color: e.target.value })
                        }
                        placeholder="#3B82F6"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Tab Hardware */}
                <TabsContent value="hardware" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="deviceId">Device ID (MAC Address)</Label>
                    <Input
                      id="deviceId"
                      value={formData.hardware.deviceId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          hardware: { ...formData.hardware, deviceId: e.target.value },
                        })
                      }
                      placeholder="AA:BB:CC:DD:EE:FF"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Conexão</Label>
                    <Select
                      value={formData.hardware.connectionType}
                      onValueChange={(value: 'usb' | 'wifi' | 'bluetooth') =>
                        setFormData({
                          ...formData,
                          hardware: { ...formData.hardware, connectionType: value },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="usb">
                          <div className="flex items-center gap-2">
                            <Usb className="h-4 w-4" /> USB Serial
                          </div>
                        </SelectItem>
                        <SelectItem value="wifi">
                          <div className="flex items-center gap-2">
                            <Wifi className="h-4 w-4" /> WiFi
                          </div>
                        </SelectItem>
                        <SelectItem value="bluetooth">
                          <div className="flex items-center gap-2">
                            <Bluetooth className="h-4 w-4" /> Bluetooth
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="valvePin">GPIO Válvula</Label>
                      <Input
                        id="valvePin"
                        type="number"
                        min="0"
                        max="39"
                        value={formData.hardware.valvePin}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            hardware: {
                              ...formData.hardware,
                              valvePin: parseInt(e.target.value) || 0,
                            },
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Pino do relé da válvula solenóide
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="flowSensorPin">GPIO Sensor de Fluxo</Label>
                      <Input
                        id="flowSensorPin"
                        type="number"
                        min="0"
                        max="39"
                        value={formData.hardware.flowSensorPin}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            hardware: {
                              ...formData.hardware,
                              flowSensorPin: parseInt(e.target.value) || 0,
                            },
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Pino do sensor de fluxo (pulsos)
                      </p>
                    </div>
                  </div>
                  {formData.hardware.connectionType === 'wifi' && (
                    <div className="space-y-2">
                      <Label htmlFor="lastKnownIp">Último IP Conhecido</Label>
                      <Input
                        id="lastKnownIp"
                        value={formData.hardware.lastKnownIp || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            hardware: { ...formData.hardware, lastKnownIp: e.target.value },
                          })
                        }
                        placeholder="192.168.1.100"
                      />
                    </div>
                  )}
                </TabsContent>

                {/* Tab Calibração */}
                <TabsContent value="calibration" className="space-y-4 mt-4">
                  <Alert>
                    <Gauge className="h-4 w-4" />
                    <AlertDescription>
                      Ajuste os valores de calibração para garantir precisão na medição de volume
                    </AlertDescription>
                  </Alert>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pulsesPerLiter">Pulsos por Litro</Label>
                      <Input
                        id="pulsesPerLiter"
                        type="number"
                        min="1"
                        value={formData.calibration.pulsesPerLiter}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            calibration: {
                              ...formData.calibration,
                              pulsesPerLiter: parseInt(e.target.value) || 450,
                            },
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Valor típico: 450 (YF-S201)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mlPerSecond">ML por Segundo</Label>
                      <Input
                        id="mlPerSecond"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={formData.calibration.mlPerSecond}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            calibration: {
                              ...formData.calibration,
                              mlPerSecond: parseFloat(e.target.value) || 33.3,
                            },
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Vazão média (~33.3 = 2L/min)
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-6">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Lista de Dispensers */}
      {dispensers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Droplets className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma torneira configurada</h3>
            <p className="text-muted-foreground mb-4">
              Adicione sua primeira torneira para começar
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Torneira
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dispensers.map((dispenser) => (
            <Card key={dispenser.id} className={!dispenser.isActive ? 'opacity-60' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                      style={{ backgroundColor: dispenser.color + '20' }}
                    >
                      {dispenser.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{dispenser.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <ConnectionIcon type={dispenser.hardware.connectionType} />
                        {dispenser.hardware.connectionType.toUpperCase()}
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={dispenser.isActive}
                    onCheckedChange={() => handleToggle(dispenser)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Válvula GPIO:</span>
                    <span className="font-mono">{dispenser.hardware.valvePin}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sensor GPIO:</span>
                    <span className="font-mono">{dispenser.hardware.flowSensorPin}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pulsos/L:</span>
                    <span className="font-mono">{dispenser.calibration.pulsesPerLiter}</span>
                  </div>
                  {dispenser.lastStatus && (
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={dispenser.lastStatus.connected ? 'default' : 'secondary'}>
                        <Power className="h-3 w-3 mr-1" />
                        {dispenser.lastStatus.connected ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(dispenser)}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteConfirmId(dispenser.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de Confirmação de Delete */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover esta torneira? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
