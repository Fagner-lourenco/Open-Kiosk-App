/**
 * ============================================================================
 * CreateFranchisePage - Criar Nova Franquia
 * ============================================================================
 * 
 * Página para criação de novas franquias.
 * Exclusiva para SuperAdmin.
 * 
 * @author Open Kiosk Project
 * @version 1.0.0
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import {
  Building2,
  ArrowLeft,
  Save,
  AlertCircle,
  User,
  Mail,
  Globe,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';

interface FranchiseForm {
  name: string;
  description: string;
  ownerEmail: string;
  website: string;
  supportEmail: string;
  plan: string;
  status: string;
}

export default function CreateFranchisePage() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  
  const [form, setForm] = useState<FranchiseForm>({
    name: '',
    description: '',
    ownerEmail: '',
    website: '',
    supportEmail: '',
    plan: 'trial',
    status: 'active',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<FranchiseForm>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<FranchiseForm> = {};

    if (!form.name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    }

    if (!form.ownerEmail.trim()) {
      newErrors.ownerEmail = 'Email do proprietário é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail)) {
      newErrors.ownerEmail = 'Email inválido';
    }

    if (form.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.supportEmail)) {
      newErrors.supportEmail = 'Email de suporte inválido';
    }

    if (form.website && !/^https?:\/\/.+/.test(form.website)) {
      newErrors.website = 'URL inválida (deve começar com http:// ou https://)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      // Cria a franquia
      const franchisesRef = collection(db, 'franchises');
      const docRef = await addDoc(franchisesRef, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        ownerEmail: form.ownerEmail.trim(),
        website: form.website.trim() || null,
        supportEmail: form.supportEmail.trim() || null,
        plan: form.plan,
        status: form.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        settings: {
          notifications: {
            emailOnNewOrder: true,
            emailOnLowStock: true,
            emailOnNewMember: true,
          },
          appearance: {
            primaryColor: '#3b82f6',
            logoUrl: '',
          },
        },
      });

      toast.success(`Franquia "${form.name}" criada com sucesso!`);
      navigate(`/superadmin/franchises/${docRef.id}`);
    } catch (error) {
      console.error('Erro ao criar franquia:', error);
      toast.error('Erro ao criar franquia');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof FranchiseForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
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

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Voltar para franquias"
          onClick={() => navigate('/superadmin/franchises')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title="Nova Franquia"
          description="Cadastre uma nova franquia no sistema"
        />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Informações da Franquia</CardTitle>
            <CardDescription>
              Preencha os dados básicos da nova franquia
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Nome da Franquia <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  placeholder="Ex: Minha Franquia"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className={`pl-10 ${errors.name ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name}</p>
              )}
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Textarea
                  id="description"
                  placeholder="Descrição da franquia..."
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="pl-10 min-h-[100px]"
                />
              </div>
            </div>

            {/* Email do Proprietário */}
            <div className="space-y-2">
              <Label htmlFor="ownerEmail">
                Email do Proprietário <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="ownerEmail"
                  type="email"
                  placeholder="proprietario@email.com"
                  value={form.ownerEmail}
                  onChange={(e) => handleChange('ownerEmail', e.target.value)}
                  className={`pl-10 ${errors.ownerEmail ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.ownerEmail && (
                <p className="text-sm text-red-500">{errors.ownerEmail}</p>
              )}
            </div>

            {/* Email de Suporte */}
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Email de Suporte</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="supportEmail"
                  type="email"
                  placeholder="suporte@email.com"
                  value={form.supportEmail}
                  onChange={(e) => handleChange('supportEmail', e.target.value)}
                  className={`pl-10 ${errors.supportEmail ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.supportEmail && (
                <p className="text-sm text-red-500">{errors.supportEmail}</p>
              )}
            </div>

            {/* Website */}
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="website"
                  type="url"
                  placeholder="https://www.exemplo.com"
                  value={form.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  className={`pl-10 ${errors.website ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.website && (
                <p className="text-sm text-red-500">{errors.website}</p>
              )}
            </div>

            {/* Plano e Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan">Plano</Label>
                <Select
                  value={form.plan}
                  onValueChange={(value) => handleChange('plan', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o plano" />
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
                  value={form.status}
                  onValueChange={(value) => handleChange('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-6 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/superadmin/franchises')}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Salvando...' : 'Criar Franquia'}
          </Button>
        </div>
      </form>
    </div>
  );
}
