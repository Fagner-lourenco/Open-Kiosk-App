/**
 * ============================================================================
 * UserDetailPage - Detalhes do Usuário
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFranchise } from '@/context/FranchiseContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  User, 
  Loader2, 
  AlertCircle,
  Mail,
  Calendar,
  Shield,
  Store,
  Building2,
  Trash2,
  CheckCircle
} from 'lucide-react';

interface UserData {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: string;
  addedAt?: Date;
  stores?: string[];
}

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { currentFranchise, stores, refreshFranchises } = useFranchise();
  useAuth();
  
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  useEffect(() => {
    if (currentFranchise && userId) {
      loadUser();
    }
  }, [currentFranchise, userId]);

  const loadUser = async () => {
    try {
      // Try to get user from franchise members subcollection
      if (currentFranchise) {
        const memberDoc = await getDoc(doc(db, 'franchises', currentFranchise.id, 'members', userId!));
        
        if (memberDoc.exists()) {
          const data = memberDoc.data();
          const userData: UserData = {
            id: userId!,
            email: data.email,
            displayName: data.displayName,
            photoURL: data.photoURL,
            role: data.role,
            addedAt: data.joinedAt?.toDate() || data.addedAt?.toDate(),
            stores: data.storeAccess || [],
          };
          setUser(userData);
          setSelectedRole(userData.role);
          setIsLoading(false);
          return;
        }
      }
      
      // Fallback: check if it's the owner
      if (currentFranchise?.ownerId === userId) {
        const userData: UserData = {
          id: userId!,
          email: currentFranchise?.ownerEmail || '',
          displayName: 'Proprietário',
          role: 'owner',
          addedAt: new Date(),
          stores: ['*'],
        };
        setUser(userData);
        setSelectedRole(userData.role);
      } else {
        setError('Usuário não encontrado');
      }
    } catch (err) {
      console.error('Error loading user:', err);
      setError('Erro ao carregar usuário');
    }
    
    setIsLoading(false);
  };

  const handleRoleChange = async (newRole: string) => {
    if (!currentFranchise || !userId) return;
    
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Update role in Firestore members subcollection
      await updateDoc(doc(db, 'franchises', currentFranchise.id, 'members', userId), {
        role: newRole,
        updatedAt: new Date(),
      });
      
      setSelectedRole(newRole);
      if (user) {
        setUser({ ...user, role: newRole });
      }
      setSuccess('Função atualizada com sucesso!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating role:', err);
      setError('Erro ao atualizar função');
      setSelectedRole(user?.role || '');
    }
    
    setIsSaving(false);
  };

  const handleRemoveUser = async () => {
    if (!currentFranchise || !userId || !user) return;
    
    setIsRemoving(true);
    setError(null);
    
    try {
      // Remove from members subcollection
      await deleteDoc(doc(db, 'franchises', currentFranchise.id, 'members', userId));
      await refreshFranchises();
      navigate('/users');
    } catch (err) {
      console.error('Error removing user:', err);
      setError('Erro ao remover usuário');
      setIsRemoving(false);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: 'Proprietário',
      manager: 'Gerente',
      employee: 'Funcionário',
      viewer: 'Visualizador',
    };
    return labels[role] || role;
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || 'U';
  };

  if (!currentFranchise) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <CardTitle>Nenhuma franquia selecionada</CardTitle>
            <CardDescription>
              Selecione uma franquia no menu lateral
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link to="/users">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para usuários
          </Button>
        </Link>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/users">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Detalhes do Usuário</h1>
          <p className="text-gray-500">Gerenciar permissões e acessos</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      {/* User Profile Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.photoURL} />
              <AvatarFallback className="text-2xl">
                {getInitials(user.displayName, user.email)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900">
                {user.displayName || 'Sem nome'}
              </h2>
              <div className="flex items-center gap-2 text-gray-500 mt-1">
                <Mail className="h-4 w-4" />
                {user.email}
              </div>
              <div className="flex items-center gap-2 text-gray-500 mt-1">
                <Calendar className="h-4 w-4" />
                Membro desde {user.addedAt?.toLocaleDateString('pt-BR') || 'N/A'}
              </div>
            </div>

            <Badge variant={user.role === 'owner' ? 'default' : 'secondary'}>
              <Shield className="mr-1 h-3 w-3" />
              {getRoleLabel(user.role)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Role Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Função</CardTitle>
          <CardDescription>
            Defina a função do usuário na franquia
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select
              value={selectedRole}
              onValueChange={handleRoleChange}
              disabled={isSaving || user.role === 'owner'}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Proprietário</SelectItem>
                <SelectItem value="manager">Gerente</SelectItem>
                <SelectItem value="employee">Funcionário</SelectItem>
                <SelectItem value="viewer">Visualizador</SelectItem>
              </SelectContent>
            </Select>
            
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          
          {user.role === 'owner' && (
            <p className="text-sm text-gray-500 mt-2">
              Proprietários não podem ter sua função alterada
            </p>
          )}
        </CardContent>
      </Card>

      {/* Store Access */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acesso a Lojas</CardTitle>
          <CardDescription>
            Lojas que este usuário pode acessar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stores.length === 0 ? (
            <div className="text-center py-6">
              <Store className="h-8 w-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Nenhuma loja cadastrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stores.map((store) => (
                <div 
                  key={store.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Store className="h-5 w-5 text-gray-400" />
                    <span>{store.name}</span>
                  </div>
                  <Badge variant="outline">
                    {user.role === 'owner' ? 'Acesso total' : 'Herdado'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          
          <p className="text-sm text-gray-500 mt-4">
            {user.role === 'owner' 
              ? 'Proprietários têm acesso a todas as lojas automaticamente'
              : 'O acesso às lojas é herdado da função na franquia'
            }
          </p>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividade Recente</CardTitle>
          <CardDescription>
            Últimas ações deste usuário
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <User className="h-8 w-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Nenhuma atividade registrada</p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone - only for non-owners */}
      {user.role !== 'owner' && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base text-red-600">Zona de Perigo</CardTitle>
            <CardDescription>
              Ações irreversíveis para este usuário
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setShowRemoveDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remover da Franquia
            </Button>
            <p className="text-sm text-gray-500 mt-2">
              O usuário perderá acesso a todas as lojas desta franquia.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Remove User Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover usuário</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover "{user.displayName || user.email}" da franquia?
              O usuário perderá acesso a todas as lojas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRemoveDialog(false)}
              disabled={isRemoving}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveUser}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                'Remover usuário'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
