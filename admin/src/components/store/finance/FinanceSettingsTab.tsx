/**
 * ============================================================================
 * FinanceSettingsTab — Categorias, Centros de Custo e Partes (Fornecedores)
 * ============================================================================
 *
 * Tab de configurações financeiras com 3 seções:
 *  1. Categorias (receita/despesa)
 *  2. Centros de Custo
 *  3. Partes (fornecedores, funcionários, terceiros)
 *
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  SlidersHorizontal,
  Tag,
  Building,
  Users,
  MoreVertical,
  Archive,
  RotateCcw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useFinCategories,
  type CreateFinCategoryInput,
} from '@/hooks/useFinCategories';
import {
  useCostCenters,
  type CreateCostCenterInput,
} from '@/hooks/useCostCenters';
import {
  useParties,
  type CreatePartyInput,
} from '@/hooks/useParties';
import type {
  FinCategory,
  FinCategoryDirection,
  CostCenter,
  Party,
  PartyType,
} from '@/types/finance';

// ============================================================================
// CONSTANTS
// ============================================================================

const DIRECTION_LABELS: Record<FinCategoryDirection, string> = {
  in: 'Receita',
  out: 'Despesa',
};

const DIRECTION_COLORS: Record<FinCategoryDirection, string> = {
  in: 'bg-green-100 text-green-700',
  out: 'bg-red-100 text-red-600',
};

const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  customer: 'Cliente',
  supplier: 'Fornecedor',
  employee: 'Funcionário',
  other: 'Outro',
};

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  franchiseId: string;
  storeId: string;
}

// ============================================================================
// CATEGORY DIALOG
// ============================================================================

function CategoryDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateFinCategoryInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: FinCategory | null;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [direction, setDirection] = useState<FinCategoryDirection>(
    initialData?.direction || 'out',
  );

  const reset = () => { setName(''); setDirection('out'); };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSubmit({ direction, name: name.trim() });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
          <DialogDescription>Categoria para classificar receitas e despesas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Aluguel" />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as FinCategoryDirection)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Receita</SelectItem>
                <SelectItem value="out">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initialData ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// COST CENTER DIALOG
// ============================================================================

function CostCenterDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateCostCenterInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: CostCenter | null;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const reset = () => setName('');

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSubmit({ name: name.trim() });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}</DialogTitle>
          <DialogDescription>Centros de custo organizam a visão gerencial.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Operações" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initialData ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// PARTY DIALOG
// ============================================================================

function PartyDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreatePartyInput) => Promise<unknown>;
  isPending: boolean;
  initialData?: Party | null;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [type, setType] = useState<PartyType>(initialData?.type || 'supplier');
  const [docField, setDocField] = useState(initialData?.doc || '');
  const [phone, setPhone] = useState(initialData?.contacts?.[0]?.phone || '');
  const [email, setEmail] = useState(initialData?.contacts?.[0]?.email || '');
  const [pixKey, setPixKey] = useState(initialData?.bankInfo?.pixKey || '');

  const reset = () => {
    setName('');
    setType('supplier');
    setDocField('');
    setPhone('');
    setEmail('');
    setPixKey('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const contacts = phone.trim() || email.trim()
      ? [{ phone: phone.trim() || undefined, email: email.trim() || undefined }]
      : [];
    const bankInfo = pixKey.trim() ? { pixKey: pixKey.trim() } : undefined;
    await onSubmit({
      type,
      name: name.trim(),
      doc: docField.trim() || undefined,
      contacts,
      bankInfo,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Editar Parte' : 'Nova Parte'}</DialogTitle>
          <DialogDescription>Fornecedores, funcionários e terceiros.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as PartyType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PARTY_TYPE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>CPF/CNPJ</Label>
            <Input value={docField} onChange={(e) => setDocField(e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Chave Pix</Label>
            <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Chave Pix" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initialData ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinanceSettingsTab({ franchiseId, storeId }: Props) {
  const {
    categories,
    loadingCategories,
    incomeCategories,
    createCategory,
    isCreatingCategory,
    updateCategory,
    isUpdatingCategory,
    deleteCategory,
    isDeletingCategory,
  } = useFinCategories(franchiseId, storeId);

  const {
    costCenters,
    loadingCostCenters,
    createCostCenter,
    isCreatingCostCenter,
    updateCostCenter,
    isUpdatingCostCenter,
    deleteCostCenter,
    isDeletingCostCenter,
  } = useCostCenters(franchiseId, storeId);

  const {
    parties,
    loadingParties,
    createParty,
    isCreatingParty,
    updateParty,
    isUpdatingParty,
    deleteParty,
    isDeletingParty,
  } = useParties(franchiseId, storeId);

  // ── Category state ──
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [editingCat, setEditingCat] = useState<FinCategory | null>(null);
  const [deletingCat, setDeletingCat] = useState<FinCategory | null>(null);

  // ── CostCenter state ──
  const [showCCDialog, setShowCCDialog] = useState(false);
  const [editingCC, setEditingCC] = useState<CostCenter | null>(null);
  const [deletingCC, setDeletingCC] = useState<CostCenter | null>(null);

  // ── Party state ──
  const [showPartyDialog, setShowPartyDialog] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [deletingParty, setDeletingParty] = useState<Party | null>(null);

  // ── Party filter ──
  const [partyTypeFilter, setPartyTypeFilter] = useState<PartyType | 'all'>('all');
  const filteredParties = useMemo(() => {
    if (partyTypeFilter === 'all') return parties;
    return parties.filter((p) => p.type === partyTypeFilter);
  }, [parties, partyTypeFilter]);

  const isLoading = loadingCategories || loadingCostCenters || loadingParties;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-xs text-muted-foreground">Categorias</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{incomeCategories.length}</p>
                <p className="text-xs text-muted-foreground">Receitas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{costCenters.length}</p>
                <p className="text-xs text-muted-foreground">C. Custo</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{parties.length}</p>
                <p className="text-xs text-muted-foreground">Partes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── CATEGORIES ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Categorias Financeiras</CardTitle>
              <CardDescription>Classificação de receitas e despesas</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowCatDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Categoria
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma categoria cadastrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DIRECTION_COLORS[cat.direction]}`}>
                        {DIRECTION_LABELS[cat.direction]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={cat.status === 'active' ? 'default' : 'secondary'}>
                        {cat.status === 'active' ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingCat(cat)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              if (!cat.id) return;
                              await updateCategory({
                                categoryId: cat.id,
                                status: cat.status === 'active' ? 'inactive' : 'active',
                              });
                            }}
                          >
                            {cat.status === 'active' ? (
                              <><Archive className="h-4 w-4 mr-2" />Inativar</>
                            ) : (
                              <><RotateCcw className="h-4 w-4 mr-2" />Reativar</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingCat(cat)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── COST CENTERS ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Centros de Custo</CardTitle>
              <CardDescription>Agrupamento para visão gerencial</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowCCDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Centro de Custo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {costCenters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum centro de custo cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {costCenters.map((cc) => (
                  <TableRow key={cc.id}>
                    <TableCell className="font-medium">{cc.name}</TableCell>
                    <TableCell>
                      <Badge variant={cc.status === 'active' ? 'default' : 'secondary'}>
                        {cc.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingCC(cc)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              if (!cc.id) return;
                              await updateCostCenter({
                                centerId: cc.id,
                                status: cc.status === 'active' ? 'inactive' : 'active',
                              });
                            }}
                          >
                            {cc.status === 'active' ? (
                              <><Archive className="h-4 w-4 mr-2" />Inativar</>
                            ) : (
                              <><RotateCcw className="h-4 w-4 mr-2" />Reativar</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingCC(cc)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── PARTIES ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Partes (Fornecedores / Funcionários)</CardTitle>
              <CardDescription>Cadastro de fornecedores, funcionários e terceiros</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowPartyDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Parte
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={partyTypeFilter} onValueChange={(v) => setPartyTypeFilter(v as PartyType | 'all')}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(PARTY_TYPE_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filteredParties.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma parte cadastrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParties.map((party) => (
                  <TableRow key={party.id}>
                    <TableCell className="font-medium">{party.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{PARTY_TYPE_LABELS[party.type]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {party.doc || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {party.contacts?.[0]?.phone || party.contacts?.[0]?.email || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={party.status === 'active' ? 'default' : 'secondary'}>
                        {party.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingParty(party)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              if (!party.id) return;
                              await updateParty({
                                partyId: party.id,
                                status: party.status === 'active' ? 'inactive' : 'active',
                              });
                            }}
                          >
                            {party.status === 'active' ? (
                              <><Archive className="h-4 w-4 mr-2" />Inativar</>
                            ) : (
                              <><RotateCcw className="h-4 w-4 mr-2" />Reativar</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingParty(party)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── DIALOGS ───────────────────────────────────────────────────── */}

      {/* Category create */}
      <CategoryDialog
        open={showCatDialog}
        onOpenChange={setShowCatDialog}
        onSubmit={(data) => createCategory(data)}
        isPending={isCreatingCategory}
      />

      {/* Category edit */}
      <CategoryDialog
        open={!!editingCat}
        onOpenChange={(v) => { if (!v) setEditingCat(null); }}
        onSubmit={async (data) => {
          if (!editingCat?.id) return;
          await updateCategory({ categoryId: editingCat.id, ...data });
          setEditingCat(null);
        }}
        isPending={isUpdatingCategory}
        initialData={editingCat}
      />

      {/* Category delete */}
      <AlertDialog open={!!deletingCat} onOpenChange={(v) => { if (!v) setDeletingCat(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingCat?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingCat?.id) await deleteCategory(deletingCat.id);
                setDeletingCat(null);
              }}
              disabled={isDeletingCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingCategory && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CostCenter create */}
      <CostCenterDialog
        open={showCCDialog}
        onOpenChange={setShowCCDialog}
        onSubmit={(data) => createCostCenter(data)}
        isPending={isCreatingCostCenter}
      />

      {/* CostCenter edit */}
      <CostCenterDialog
        open={!!editingCC}
        onOpenChange={(v) => { if (!v) setEditingCC(null); }}
        onSubmit={async (data) => {
          if (!editingCC?.id) return;
          await updateCostCenter({ centerId: editingCC.id, ...data });
          setEditingCC(null);
        }}
        isPending={isUpdatingCostCenter}
        initialData={editingCC}
      />

      {/* CostCenter delete */}
      <AlertDialog open={!!deletingCC} onOpenChange={(v) => { if (!v) setDeletingCC(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir centro de custo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingCC?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingCC?.id) await deleteCostCenter(deletingCC.id);
                setDeletingCC(null);
              }}
              disabled={isDeletingCostCenter}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingCostCenter && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Party create */}
      <PartyDialog
        open={showPartyDialog}
        onOpenChange={setShowPartyDialog}
        onSubmit={(data) => createParty(data)}
        isPending={isCreatingParty}
      />

      {/* Party edit */}
      <PartyDialog
        open={!!editingParty}
        onOpenChange={(v) => { if (!v) setEditingParty(null); }}
        onSubmit={async (data) => {
          if (!editingParty?.id) return;
          await updateParty({ partyId: editingParty.id, ...data });
          setEditingParty(null);
        }}
        isPending={isUpdatingParty}
        initialData={editingParty}
      />

      {/* Party delete */}
      <AlertDialog open={!!deletingParty} onOpenChange={(v) => { if (!v) setDeletingParty(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir parte?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingParty?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingParty?.id) await deleteParty(deletingParty.id);
                setDeletingParty(null);
              }}
              disabled={isDeletingParty}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingParty && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
