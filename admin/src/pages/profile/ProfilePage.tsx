/**
 * ============================================================================
 * Profile Page - Minha Conta
 * ============================================================================
 * 
 * Página de perfil do usuário com edição de dados pessoais e alteração de senha.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  updateProfile, 
  updatePassword, 
  EmailAuthProvider, 
  reauthenticateWithCredential,
  sendEmailVerification,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useFranchise } from '@/context/FranchiseContext';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/useToast';
import { LoadingState } from '@/components/common/LoadingState';
import { DangerZoneCard } from '@/components/common/DangerZoneCard';
import { PageHeader } from '@/components/layout/PageHeader';

// Icons
import { 
  User, 
  Mail, 
  Lock, 
  Phone,
  Building2,
  Shield,
  Camera,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  LogOut,
} from 'lucide-react';

interface UserProfile {
  displayName: string;
  email: string;
  phone?: string;
  photoURL?: string;
  role?: string;
  createdAt?: Date;
  lastLoginAt?: Date;
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { currentFranchise, currentMembership } = useFranchise();
  const { toast } = useToast();

  // Estados
  const [profile, setProfile] = useState<UserProfile>({
    displayName: '',
    email: '',
    phone: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Password change
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Logout confirmation
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  // Carrega dados do perfil
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      try {
        // Dados do Firebase Auth
        setProfile({
          displayName: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || undefined,
        });

        // Busca dados adicionais do Firestore
        if (currentFranchise?.id) {
          const memberRef = doc(db, 'franchises', currentFranchise.id, 'members', user.uid);
          const memberSnap = await getDoc(memberRef);
          
          if (memberSnap.exists()) {
            const memberData = memberSnap.data();
            setProfile(prev => ({
              ...prev,
              phone: memberData.phone || '',
              role: memberData.role,
              createdAt: memberData.createdAt?.toDate?.() || memberData.createdAt,
              lastLoginAt: memberData.lastLoginAt?.toDate?.() || memberData.lastLoginAt,
            }));
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        toast.error('Erro ao carregar perfil');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [user, currentFranchise?.id, toast]);

  // Handler de mudança de campo
  const handleChange = (field: keyof UserProfile, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Salva perfil
  const handleSaveProfile = async () => {
    if (!user || !auth.currentUser) return;

    setIsSaving(true);
    try {
      // Atualiza Firebase Auth
      await updateProfile(auth.currentUser, {
        displayName: profile.displayName,
      });

      // Atualiza Firestore member
      if (currentFranchise?.id) {
        const memberRef = doc(db, 'franchises', currentFranchise.id, 'members', user.uid);
        await updateDoc(memberRef, {
          name: profile.displayName,
          phone: profile.phone || null,
          updatedAt: serverTimestamp(),
        });
      }

      setHasChanges(false);
      toast.success('Perfil atualizado com sucesso');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Erro ao salvar perfil');
    } finally {
      setIsSaving(false);
    }
  };

  // Alterar senha
  const handleChangePassword = async () => {
    if (!auth.currentUser || !auth.currentUser.email) return;

    // Validações
    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    setIsChangingPassword(true);
    try {
      // Reautenticar
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Atualizar senha
      await updatePassword(auth.currentUser, newPassword);

      toast.success('Senha alterada com sucesso');
      setShowPasswordDialog(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: unknown) {
      console.error('Error changing password:', error);
      
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/wrong-password') {
        toast.error('Senha atual incorreta');
      } else if (firebaseError.code === 'auth/too-many-requests') {
        toast.error('Muitas tentativas. Tente novamente mais tarde.');
      } else {
        toast.error('Erro ao alterar senha');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Iniciais para avatar
  const initials = profile.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  // Formatar role
  const formatRole = (role?: string) => {
    const roleMap: Record<string, string> = {
      superadmin: 'Super Admin',
      owner: 'Proprietário',
      admin: 'Administrador',
      manager: 'Gerente',
      operator: 'Operador',
      technician: 'Técnico',
      viewer: 'Visualizador',
    };
    return roleMap[role || ''] || role || 'Membro';
  };

  if (isLoading) {
    return <LoadingState className="min-h-screen" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minha Conta"
        description="Gerencie seu perfil e configurações pessoais"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda - Info resumida */}
        <div className="lg:col-span-1 space-y-6">
          {/* Card do Perfil */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profile.photoURL} />
                    <AvatarFallback className="text-2xl bg-blue-100 text-blue-700">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size="icon"
                    variant="outline"
                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-white shadow"
                    onClick={() => toast.info('Upload de foto em breve')}
                    aria-label="Alterar foto de perfil"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>

                <h2 className="mt-4 text-xl font-semibold">{profile.displayName || 'Usuário'}</h2>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
                
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    {formatRole(currentMembership?.role || profile.role)}
                  </Badge>
                </div>

                {currentFranchise && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    {currentFranchise.name}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Info adicional */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informações da Conta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {profile.createdAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Membro desde</span>
                  <span>{new Date(profile.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
              {profile.lastLoginAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Último acesso</span>
                  <span>{new Date(profile.lastLoginAt).toLocaleString('pt-BR')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email verificado</span>
                {user?.emailVerified ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Logout */}
          <Button
            variant="outline"
            className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => setShowLogoutDialog(true)}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair da Conta
          </Button>
        </div>

        {/* Coluna direita - Formulários */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">
                <User className="h-4 w-4 mr-2" />
                Perfil
              </TabsTrigger>
              <TabsTrigger value="security">
                <Lock className="h-4 w-4 mr-2" />
                Segurança
              </TabsTrigger>
            </TabsList>

            {/* Tab Perfil */}
            <TabsContent value="profile" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Dados Pessoais</CardTitle>
                  <CardDescription>
                    Atualize suas informações de perfil
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Nome Completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="displayName"
                          value={profile.displayName}
                          onChange={(e) => handleChange('displayName', e.target.value)}
                          className="pl-10"
                          placeholder="Seu nome"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="phone"
                          value={profile.phone || ''}
                          onChange={(e) => handleChange('phone', e.target.value)}
                          className="pl-10"
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        value={profile.email}
                        className="pl-10 bg-muted"
                        disabled
                        readOnly
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O email não pode ser alterado por segurança
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={!hasChanges || isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar Alterações
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            {/* Tab Segurança */}
            <TabsContent value="security" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Senha</CardTitle>
                  <CardDescription>
                    Altere sua senha de acesso
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    onClick={() => setShowPasswordDialog(true)}
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Alterar Senha
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Verificação de Email</CardTitle>
                  <CardDescription>
                    Status da verificação do seu email
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {user?.emailVerified ? (
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        Seu email está verificado
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-3">
                      <Alert className="bg-yellow-50 border-yellow-200">
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <AlertDescription className="text-yellow-800">
                          Seu email ainda não foi verificado
                        </AlertDescription>
                      </Alert>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          if (auth.currentUser) {
                            await sendEmailVerification(auth.currentUser);
                            toast.success('Email de verificação enviado');
                          }
                        }}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Reenviar Email de Verificação
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <DangerZoneCard description="Ações irreversíveis na sua conta">
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => toast.info('Entre em contato com o suporte para excluir sua conta')}
                  >
                    Excluir Minha Conta
                  </Button>
              </DangerZoneCard>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialog de Alteração de Senha */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>
              Digite sua senha atual e a nova senha desejada
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Senha Atual</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  aria-label={showCurrentPassword ? 'Ocultar senha atual' : 'Mostrar senha atual'}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              {isChangingPassword ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Alterar Senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Logout */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sair da Conta</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja sair? Você precisará fazer login novamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogoutDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
