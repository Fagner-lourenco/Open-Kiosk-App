/**
 * ============================================================================
 * ProductForm - Formulário de Produto (Adaptado do Kiosk)
 * ============================================================================
 * 
 * Formulário completo para criação e edição de produtos.
 * Suporta produtos normais e bebidas com tamanhos múltiplos.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Plus, Loader2, GlassWater } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

export interface ProductSize {
  key: string;
  label: string;
  price: number;
  ml: number;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  image?: string;
  stock: number;
  minStock: number;
  isDrink?: boolean;
  sizes?: ProductSize[];
  defaultSizeKey?: string;
  totalMlAvailable?: number;
  tags: string[];
  active: boolean;
  inStock: boolean;
}

interface ProductFormProps {
  onSubmit: (product: Omit<Product, 'id'>) => void;
  initialProduct?: Product;
  isSubmitting?: boolean;
}

export function ProductForm({ onSubmit, initialProduct, isSubmitting }: ProductFormProps) {
  const { toast } = useToast();
  
  // Form state
  const [title, setTitle] = useState(initialProduct?.title || '');
  const [price, setPrice] = useState(initialProduct?.price || 0);
  const [description, setDescription] = useState(initialProduct?.description || '');
  const [image, setImage] = useState(initialProduct?.image || '');
  const [category, setCategory] = useState(initialProduct?.category || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialProduct?.tags || []);
  const [stock, setStock] = useState(initialProduct?.stock || 0);
  const [minStock, setMinStock] = useState(initialProduct?.minStock || 5);

  // Bebidas
  const [isDrink, setIsDrink] = useState(initialProduct?.isDrink || false);
  const [sizes, setSizes] = useState<ProductSize[]>(initialProduct?.sizes || []);
  const [defaultSizeKey, setDefaultSizeKey] = useState(initialProduct?.defaultSizeKey || '');
  const [totalMlAvailable, setTotalMlAvailable] = useState(initialProduct?.totalMlAvailable || 0);

  const isValidUrl = (value: string) => {
    if (!value) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    if (image && !isValidUrl(image)) {
      toast.error('URL da imagem inválida');
      return;
    }

    if (isDrink) {
      if (!sizes || sizes.length === 0) {
        toast.error('Adicione pelo menos um tamanho para bebidas');
        return;
      }

      if (sizes.some(s => !s.key || !s.label || s.ml <= 0)) {
        toast.error('Preencha todos os campos de tamanho corretamente');
        return;
      }

      onSubmit({
        title,
        description,
        image,
        category,
        tags,
        isDrink: true,
        sizes,
        defaultSizeKey: defaultSizeKey || sizes[0]?.key,
        totalMlAvailable,
        minStock,
        price: sizes[0]?.price || 0,
        stock: 0,
        inStock: totalMlAvailable > 0,
        active: true,
      });
    } else {
      onSubmit({
        title,
        price,
        description,
        image,
        category,
        tags,
        isDrink: false,
        inStock: stock > 0,
        stock,
        minStock,
        active: true,
      });
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const addSize = () => {
    setSizes([...sizes, { key: '', label: '', price: 0, ml: 0 }]);
  };

  const removeSize = (index: number) => {
    const newSizes = sizes.filter((_, i) => i !== index);
    setSizes(newSizes);
    if (defaultSizeKey === sizes[index]?.key) {
      setDefaultSizeKey(newSizes[0]?.key || '');
    }
  };

  const updateSize = (index: number, field: keyof ProductSize, value: string | number) => {
    const newSizes = [...sizes];
    newSizes[index] = { ...newSizes[index], [field]: value };
    setSizes(newSizes);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Título e Preço */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">Título do Produto *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Café Expresso"
            required
          />
        </div>
        {!isDrink && (
          <div className="space-y-2">
            <Label htmlFor="price">Preço (R$)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </div>
        )}
      </div>

      {/* Descrição */}
      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição do produto..."
          rows={3}
        />
      </div>

      {/* Imagem e Categoria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="image">URL da Imagem</Label>
          <Input
            id="image"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://..."
          />
          {image && isValidUrl(image) && (
            <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
              <img src={image} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="category">Categoria</Label>
          <Input
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ex: Bebidas, Lanches..."
          />
        </div>
      </div>

      {/* Toggle Bebida */}
      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <GlassWater className="h-5 w-5 text-blue-600" />
        <div className="flex-1">
          <Label htmlFor="isDrink" className="font-medium">Este produto é uma bebida?</Label>
          <p className="text-sm text-gray-500">Bebidas possuem tamanhos e controle de estoque em ML</p>
        </div>
        <Switch
          id="isDrink"
          checked={isDrink}
          onCheckedChange={setIsDrink}
        />
      </div>

      {isDrink ? (
        <>
          {/* Total ML Disponível */}
          <div className="space-y-2">
            <Label htmlFor="totalMl">Total ML Disponível</Label>
            <Input
              id="totalMl"
              type="number"
              min="0"
              value={totalMlAvailable}
              onChange={(e) => setTotalMlAvailable(Number(e.target.value) || 0)}
              placeholder="Ex: 5000"
            />
            <p className="text-xs text-gray-500">Quantidade total em mililitros disponível para venda</p>
          </div>

          {/* Tamanhos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Tamanhos Disponíveis</Label>
              <Button type="button" variant="outline" size="sm" onClick={addSize}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Tamanho
              </Button>
            </div>
            
            <div className="border rounded-lg p-4 space-y-3">
              {sizes.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Nenhum tamanho cadastrado. Adicione pelo menos um.
                </p>
              ) : (
                <>
                  {/* Header */}
                  <div className="hidden md:grid grid-cols-[1fr_1fr_100px_80px_40px] gap-2 text-xs font-medium text-gray-500 pb-2 border-b">
                    <div>Chave</div>
                    <div>Nome</div>
                    <div>Preço (R$)</div>
                    <div>ML</div>
                    <div></div>
                  </div>
                  
                  {/* Size rows */}
                  {sizes.map((size, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_100px_80px_40px] gap-2">
                      <Input
                        placeholder="pequeno"
                        value={size.key}
                        onChange={(e) => updateSize(index, 'key', e.target.value)}
                      />
                      <Input
                        placeholder="Pequeno (300ml)"
                        value={size.label}
                        onChange={(e) => updateSize(index, 'label', e.target.value)}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={size.price || ''}
                        onChange={(e) => updateSize(index, 'price', parseFloat(e.target.value) || 0)}
                      />
                      <Input
                        type="number"
                        min="0"
                        placeholder="300"
                        value={size.ml || ''}
                        onChange={(e) => updateSize(index, 'ml', parseInt(e.target.value) || 0)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => removeSize(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Tamanho Padrão */}
          {sizes.length > 0 && (
            <div className="space-y-2">
              <Label>Tamanho Padrão</Label>
              <Select value={defaultSizeKey} onValueChange={setDefaultSizeKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tamanho padrão" />
                </SelectTrigger>
                <SelectContent>
                  {sizes.map((s) => (
                    <SelectItem key={s.key || `size-${s.label}`} value={s.key || `size-${s.label}`}>
                      {s.label || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Estoque Mínimo ML */}
          <div className="space-y-2">
            <Label htmlFor="minStockMl">Alerta de Estoque Mínimo (ML)</Label>
            <Input
              id="minStockMl"
              type="number"
              min="0"
              value={minStock}
              onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
              placeholder="1000"
            />
            <p className="text-xs text-gray-500">Você será alertado quando o estoque ficar abaixo deste valor</p>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="stock">Quantidade em Estoque</Label>
            <Input
              id="stock"
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="minStock">Alerta de Estoque Mínimo</Label>
            <Input
              id="minStock"
              type="number"
              min="0"
              value={minStock}
              onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
              placeholder="5"
            />
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="space-y-3">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyPress={handleTagKeyPress}
            placeholder="Digite uma tag e pressione Enter"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addTag}>
            Adicionar
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 p-0.5 hover:bg-gray-300 rounded"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Salvando...
          </>
        ) : initialProduct ? (
          'Atualizar Produto'
        ) : (
          'Adicionar Produto'
        )}
      </Button>
    </form>
  );
}
