/**
 * ============================================================================
 * InvitePage - Aceitar Convite de Franquia
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link, useParams } from 'react-router-dom';
import { collection, query, where, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/common/LoadingState';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  Mail, 
  Lock, 
  User,
  Building2,
  Store
} from 'lucide-react';

interface InviteData {
  id?: string;
  token?: string;
  franchiseId?: string;
  franchiseName?: string;
  storeId?: string;
  storeName?: string;
  email: string;
  role: string;
  invitedBy?: string;
  status?: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: Date;
}

export function InvitePage() {
  const [searchParams] = useSearchParams();
  const { token: tokenParam } = useParams();
  const navigate = useNavigate();
  const { user, register } = useAuth();
  
  const inviteId = searchParams.get('id');
  const inviteToken = tokenParam || searchParams.get('token');
  const invitePath = inviteToken
    ? `/invite/${inviteToken}`
    : inviteId
      ? `/invite?id=${inviteId}`
      : '/invite';
  
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Registration form state (for new users)
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!inviteId && !inviteToken) {
      setError('Link de convite inválido');
      setIsLoading(false);
      return;
    }

    loadInvite();
  }, [inviteId, inviteToken, user]);

  const loadInvite = async () => {
    setIsLoading(true);
    setError(null);

    const setInviteFromPayload = (payload: { email: string; role: string; franchiseName?: string; expiresAt?: string }) => {
      const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : new Date();
      setInvite({
        token: inviteToken || undefined,
        email: payload.email,
        role: payload.role,
        franchiseName: payload.franchiseName || 'Franquia',
        expiresAt,
        status: 'pending',
      });
    };

    const loadViaPublicValidation = async () => {
      if (!inviteToken) return;
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      const region = 'southamerica-east1';
      const url = `https://${region}-${projectId}.cloudfunctions.net/validateInvitationToken?token=${encodeURIComponent(inviteToken)}`;
      const response = await fetch(url);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.valid === false) {
        setError(payload.error || 'Convite inválido');
        return;
      }
      setInviteFromPayload(payload);
    };

    try {
      if (inviteToken) {
        if (!user) {
          await loadViaPublicValidation();
          return;
        }

        try {
          const snapshot = await getDocs(
            query(
              collection(db, 'invitations'),
              where('token', '==', inviteToken),
              limit(1)
            )
          );

          if (snapshot.empty) {
            setError('Convite não encontrado');
            return;
          }

          const inviteDoc = snapshot.docs[0];
          const data = inviteDoc.data();
          const expiresAt = data.expiresAt?.toDate?.() || new Date();

          if (data.status !== 'pending') {
            setError(
              data.status === 'accepted'
                ? 'Este convite já foi aceito'
                : 'Este convite foi revogado ou expirou'
            );
            return;
          }

          if (expiresAt < new Date()) {
            setError('Este convite expirou');
            return;
          }

          setInvite({
            id: inviteDoc.id,
            token: data.token || inviteToken,
            franchiseId: data.franchiseId,
            franchiseName: data.franchiseName || 'Franquia',
            storeId: data.storeId,
            storeName: data.storeName,
            email: data.email,
            role: data.role,
            invitedBy: data.invitedByName || data.invitedBy,
            status: data.status,
            expiresAt,
          });
          return;
        } catch (err: any) {
          if (err?.code === 'permission-denied') {
            await loadViaPublicValidation();
            return;
          }
          throw err;
        }
      }

      if (!inviteId) {
        setError('Link de convite inválido');
        return;
      }

      const inviteDoc = await getDoc(doc(db, 'invitations', inviteId));
      if (!inviteDoc.exists()) {
        setError('Convite não encontrado');
        return;
      }

      const data = inviteDoc.data();
      const expiresAt = data.expiresAt?.toDate?.() || new Date();

      if (data.status !== 'pending') {
        setError(
          data.status === 'accepted'
            ? 'Este convite já foi aceito'
            : 'Este convite foi revogado ou expirou'
        );
        return;
      }

      if (expiresAt < new Date()) {
        setError('Este convite expirou');
        return;
      }

      setInvite({
        id: inviteDoc.id,
        token: data.token,
        franchiseId: data.franchiseId,
        franchiseName: data.franchiseName || 'Franquia',
        storeId: data.storeId,
        storeName: data.storeName,
        email: data.email,
        role: data.role,
        invitedBy: data.invitedByName || data.invitedBy,
        status: data.status,
        expiresAt,
      });
    } catch (err) {
      console.error('Error loading invite:', err);
      setError('Erro ao carregar convite');
    } finally {
      setIsLoading(false);
    }
  };

  const acceptInvite = async () => {
    if (!invite) return;
    
    setIsProcessing(true);
    setError(null);

    try {
      // If user is not logged in and needs to register
      if (!user) {
        if (password !== confirmPassword) {
          setError('As senhas não coincidem');
          setIsProcessing(false);
          return;
        }

        const result = await register(invite.email, password, displayName);
        if (!result.success) {
          setError(result.error || 'Erro ao criar conta');
          setIsProcessing(false);
          return;
        }
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError('Usuário não autenticado');
        setIsProcessing(false);
        return;
      }

      const functions = getFunctions(undefined, 'southamerica-east1');
      const acceptInvitation = httpsCallable<
        { token?: string; invitationId?: string },
        { success: boolean }
      >(functions, 'acceptInvitation');

      const token = invite.token || inviteToken || undefined;
      const invitationId = invite.id || inviteId || undefined;

      await acceptInvitation({ token, invitationId });

      setSuccess(true);
    } catch (err) {
      console.error('Error accepting invite:', err);
      setError('Erro ao aceitar convite');
    }
    
    setIsProcessing(false);
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: 'Proprietário',
      admin: 'Administrador',
      manager: 'Gerente',
      employee: 'Funcionário',
      operator: 'Operador',
      technician: 'Técnico',
      viewer: 'Visualizador',
    };
    return labels[role] || role;
  };

  if (isLoading) {
    return <LoadingState className="min-h-[300px]" />;
  }

  if (error && !invite) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        
        <div className="text-center">
          <Link to="/login">
            <Button>Ir para login</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Convite aceito!</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Você agora faz parte de {invite?.franchiseName}
            {invite?.storeName && ` - ${invite.storeName}`}
          </p>
        </div>

        <Button className="w-full" onClick={() => navigate('/')}>
          Ir para o painel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Convite recebido</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Você foi convidado por {invite?.invitedBy}
        </p>
      </div>

      {/* Invite Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detalhes do convite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{invite?.franchiseName}</p>
              <p className="text-xs text-muted-foreground">Franquia</p>
            </div>
          </div>
          
          {invite?.storeName && (
            <div className="flex items-center gap-3">
              <Store className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{invite.storeName}</p>
                <p className="text-xs text-muted-foreground">Loja</p>
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{getRoleLabel(invite?.role || '')}</p>
              <p className="text-xs text-muted-foreground">Função</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* If user is logged in with matching email */}
      {user && user.email === invite?.email && (
        <Button className="w-full" onClick={acceptInvite} disabled={isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Aceitando...
            </>
          ) : (
            'Aceitar convite'
          )}
        </Button>
      )}

      {/* If user is logged in with different email */}
      {user && user.email !== invite?.email && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Este convite foi enviado para {invite?.email}. 
            Você está logado como {user.email}. 
            Faça logout e acesse com a conta correta.
          </AlertDescription>
        </Alert>
      )}

      {/* If user is not logged in, show registration form */}
      {!user && (
        <form onSubmit={(e) => { e.preventDefault(); acceptInvite(); }} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Crie uma conta para aceitar o convite:
          </p>
          
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={invite?.email || ''}
                className="pl-10 bg-muted"
                disabled
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="name"
                type="text"
                placeholder="Seu nome"
                value={displayName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                className="pl-10"
                required
                disabled={isProcessing}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                className="pl-10"
                required
                minLength={6}
                disabled={isProcessing}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                className="pl-10"
                required
                disabled={isProcessing}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando conta e aceitando...
              </>
            ) : (
              'Criar conta e aceitar convite'
            )}
          </Button>
        </form>
      )}

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Já tem uma conta?{' '}
          <Link to={`/login?redirect=${invitePath}`} className="text-blue-600 hover:underline font-medium">
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  );
}
