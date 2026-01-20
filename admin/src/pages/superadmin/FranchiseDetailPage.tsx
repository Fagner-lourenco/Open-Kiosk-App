/**
 * ============================================================================
 * FranchiseDetailPage - Detalhes da Franquia
 * ============================================================================
 * 
 * Página para visualização e edição de uma franquia específica.
 * Exclusiva para SuperAdmin.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useFranchise } from '@/context/FranchiseContext';
import {
  Building2,
  ArrowLeft,
  Save,
  AlertCircle,
  User,
  Mail,
  Globe,
  FileText,
  Store,
  Users,
  Eye,
  Edit,
  RefreshCw,
  Calendar,
  Loader2,
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface FranchiseData {
  id: string;
  name: string;
  description?: string;
  ownerEmail?: string;
  ownerId?: string;
  website?: string;
  supportEmail?: string;
  plan?: string;
  status?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface StoreData {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
}

interface MemberData {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  addedAt?: Timestamp;
}

export default function FranchiseDetailPage() {
  const { franchiseId } = useParams<{ franchiseId: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { selectFranchise, refreshFranchises } = useFranchise();

  const [franchise, setFranchise] = useState<FranchiseData | null>(null);
  const [stores, setStores] = useState<StoreData[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<FranchiseData>>({});

  // Carrega dados da franquia
  const loadFranchise = async () => {
    if (!franchiseId) return;

    setIsLoading(true);
    try {
      // Franquia
      const franchiseRef = doc(db, 'franchises', franchiseId);
      const franchiseSnap = await getDoc(franchiseRef);

      if (!franchiseSnap.exists()) {
        toast.error('Franquia não encontrada');
        navigate('/superadmin/franchises');
        return;
      }

      const data = {
        id: franchiseSnap.id,
        ...franchiseSnap.data(),
      } as FranchiseData;

      setFranchise(data);
      setEditForm(data);

      // Lojas
      const storesRef = collection(db, `franchises/${franchiseId}/stores`);
      const storesSnap = await getDocs(storesRef);
      const storesData = storesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as StoreData[];
      setStores(storesData);

      // Membros
      const membersRef = collection(db, `franchises/${franchiseId}/members`);
      const membersSnap = await getDocs(membersRef);
      const membersData = membersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as MemberData[];
      setMembers(membersData);
    } catch (error) {
      console.error('Erro ao carregar franquia:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin && franchiseId) {
      loadFranchise();
    }
  }, [franchiseId, isSuperAdmin]);

  // Salva alterações
  const handleSave = async () => {
    if (!franchiseId || !editForm) return;

    setSaving(true);
    try {
      const franchiseRef = doc(db, 'franchises', franchiseId);
      await updateDoc(franchiseRef, {
        name: editForm.name,
        description: editForm.description || null,
        ownerEmail: editForm.ownerEmail,
        supportEmail: editForm.supportEmail || null,
        website: editForm.website || null,
        plan: editForm.plan,
        status: editForm.status,
        updatedAt: serverTimestamp(),
      });

      toast.success('Franquia atualizada com sucesso!');
      setIsEditing(false);
      loadFranchise();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  // Acessa a franquia como superadmin
  const handleAccessFranchise = async () => {
    if (!franchiseId) return;

    try {
      const updatedFranchises = await refreshFranchises();
      await selectFranchise(franchiseId, updatedFranchises);
      navigate('/dashboard');
    } catch (error) {
      console.error('Erro ao acessar franquia:', error);
      toast.error('Erro ao acessar a franquia');
    }
  };

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return '-';
    return timestamp.toDate().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPlanBadge = (plan?: string) => {
    const styles: Record<string, string> = {
      trial: 'bg-yellow-100 text-yellow-800',
      basic: 'bg-blue-100 text-blue-800',
      professional: 'bg-purple-100 text-purple-800',
      enterprise: 'bg-green-100 text-green-800',
    };
    return styles[plan || 'trial'] || styles.trial;
  };

  const getStatusBadge = (status?: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      suspended: 'bg-red-100 text-red-800',
    };
    return styles[status || 'active'] || styles.active;
  };

  const getRoleBadge = (role: string) => {
    const styles: Record<string, string> = {
      owner: 'bg-purple-100 text-purple-800',
      manager: 'bg-blue-100 text-blue-800',
      employee: 'bg-green-100 text-green-800',
      viewer: 'bg-gray-100 text-gray-800',
    };
    return styles[role] || styles.viewer;
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card className="max-w-lg mx-auto">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-yellow-600">
              <AlertCircle className="h-5 w-5" />
              <p>Você não tem permissão para acessar esta página.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!franchise) {
    return (
      <div className="p-6">
        <Card className="max-w-lg mx-auto">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <p>Franquia não encontrada.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/superadmin/franchises')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{franchise.name}</h1>
                <Badge className={getStatusBadge(franchise.status)}>
                  {franchise.status}
                </Badge>
                <Badge className={getPlanBadge(franchise.plan)}>
                  {franchise.plan}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                {franchise.ownerEmail || 'Sem proprietário definido'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadFranchise}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button variant="outline" onClick={handleAccessFranchise}>
            <Eye className="h-4 w-4 mr-2" />
            Acessar
          </Button>
          <Button
            variant={isEditing ? 'default' : 'outline'}
            onClick={() => setIsEditing(!isEditing)}
          >
            <Edit className="h-4 w-4 mr-2" />
            {isEditing ? 'Cancelar' : 'Editar'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Detalhes</TabsTrigger>
          <TabsTrigger value="stores">
            Lojas ({stores.length})
          </TabsTrigger>
          <TabsTrigger value="members">
            Membros ({members.length})
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações da Franquia</CardTitle>
              <CardDescription>
                {isEditing
                  ? 'Edite os dados abaixo e salve as alterações'
                  : 'Dados básicos da franquia'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isEditing ? (
                <>
                  {/* Form de edição */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome</Label>
                      <Input
                        id="name"
                        value={editForm.name || ''}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ownerEmail">Email do Proprietário</Label>
                      <Input
                        id="ownerEmail"
                        value={editForm.ownerEmail || ''}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            ownerEmail: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supportEmail">Email de Suporte</Label>
                      <Input
                        id="supportEmail"
                        value={editForm.supportEmail || ''}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            supportEmail: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={editForm.website || ''}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            website: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plan">Plano</Label>
                      <Select
                        value={editForm.plan}
                        onValueChange={(value) =>
                          setEditForm((prev) => ({ ...prev, plan: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trial">Trial</SelectItem>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={editForm.status}
                        onValueChange={(value) =>
                          setEditForm((prev) => ({ ...prev, status: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                          <SelectItem value="suspended">Suspenso</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={editForm.description || ''}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Salvar Alterações
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Visualização */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Nome</p>
                        <p className="font-medium">{franchise.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Proprietário</p>
                        <p className="font-medium">
                          {franchise.ownerEmail || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Email de Suporte</p>
                        <p className="font-medium">
                          {franchise.supportEmail || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Website</p>
                        <p className="font-medium">
                          {franchise.website ? (
                            <a
                              href={franchise.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {franchise.website}
                            </a>
                          ) : (
                            '-'
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Criado em</p>
                        <p className="font-medium">
                          {formatDate(franchise.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Atualizado em</p>
                        <p className="font-medium">
                          {formatDate(franchise.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {franchise.description && (
                    <div className="flex items-start gap-3 mt-4">
                      <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Descrição</p>
                        <p className="font-medium">{franchise.description}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stores Tab */}
        <TabsContent value="stores">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Lojas
              </CardTitle>
              <CardDescription>
                Lojas cadastradas nesta franquia
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stores.length === 0 ? (
                <div className="text-center py-12">
                  <Store className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">Nenhuma loja cadastrada</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stores.map((store) => (
                      <TableRow key={store.id}>
                        <TableCell className="font-medium">
                          {store.name}
                        </TableCell>
                        <TableCell>{store.address || '-'}</TableCell>
                        <TableCell>{store.phone || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              store.isActive !== false
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }
                          >
                            {store.isActive !== false ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Membros
              </CardTitle>
              <CardDescription>
                Membros com acesso a esta franquia
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">Nenhum membro cadastrado</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Adicionado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.email}
                        </TableCell>
                        <TableCell>{member.displayName || '-'}</TableCell>
                        <TableCell>
                          <Badge className={getRoleBadge(member.role)}>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(member.addedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
