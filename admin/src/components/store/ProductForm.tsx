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
import { X, Plus, Loader2, GlassWater, Beer } from 'lucide-react';
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

  // Beer info (UI "Quadro de Chopes")
  tapNumber?: number;
  style?: string;
  abv?: number;
  ibu?: number;
  priceUnitLabel?: string;
  accentColor?: string;
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

  // Beer info (Quadro de Chopes)
  const [tapNumber, setTapNumber] = useState<number | undefined>(initialProduct?.tapNumber);
  const [beerStyle, setBeerStyle] = useState(initialProduct?.style || '');
  const [abv, setAbv] = useState<number | undefined>(initialProduct?.abv);
  const [ibu, setIbu] = useState<number | undefined>(initialProduct?.ibu);
  const [priceUnitLabel, setPriceUnitLabel] = useState(initialProduct?.priceUnitLabel || '');
  const [accentColor, setAccentColor] = useState(initialProduct?.accentColor || '');

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
        // Beer info fields (only include if set)
        ...(tapNumber != null ? { tapNumber } : {}),
        ...(beerStyle ? { style: beerStyle } : {}),
        ...(abv != null ? { abv } : {}),
        ...(ibu != null ? { ibu } : {}),
        ...(priceUnitLabel ? { priceUnitLabel } : {}),
        ...(accentColor ? { accentColor } : {}),
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
      {/* ═══ INFORMAÇÕES BÁSICAS ═══ */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide border-b pb-2 mb-2 w-full">
          Informações Básicas
        </legend>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Nome do Produto <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Pilsen Artesanal, Café Expresso, Coxinha..."
              required
            />
            <p className="text-xs text-muted-foreground">
              Nome que será exibido ao cliente no kiosk e no painel administrativo.
            </p>
          </div>
          {!isDrink && (
            <div className="space-y-1.5">
              <Label htmlFor="price">Preço Unitário (R$) <span className="text-red-500">*</span></Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                placeholder="Ex: 12.90"
              />
              <p className="text-xs text-muted-foreground">
                Valor cobrado por unidade. Para bebidas, o preço é definido por tamanho.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Cerveja leve e refrescante, com notas de malte e lúpulo. Ideal para dias quentes."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Texto descritivo exibido ao cliente. Ajuda a entender o produto e facilita buscas.
          </p>
        </div>
      </fieldset>

      {/* ═══ IMAGEM E CATEGORIA ═══ */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide border-b pb-2 mb-2 w-full">
          Organização
        </legend>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="image">URL da Imagem (opcional)</Label>
            <Input
              id="image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="Ex: https://exemplo.com/foto-produto.jpg"
            />
            <p className="text-xs text-muted-foreground">
              Link direto para a foto do produto. Aceita JPG, PNG ou WebP.
            </p>
            {image && isValidUrl(image) && (
              <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden bg-muted border">
                <img src={image} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Cervejas, Lanches, Sobremesas..."
            />
            <p className="text-xs text-muted-foreground">
              Agrupa produtos semelhantes. Usado para filtros e organização no kiosk.
            </p>
          </div>
        </div>
      </fieldset>

      {/* ═══ TIPO DE PRODUTO ═══ */}
      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <GlassWater className="h-5 w-5 text-blue-600 shrink-0" />
        <div className="flex-1">
          <Label htmlFor="isDrink" className="font-medium cursor-pointer">Este produto é uma bebida (chopp/drink)?</Label>
          <p className="text-sm text-muted-foreground">
            Ative para produtos servidos em ML com múltiplos tamanhos (ex: 300ml, 500ml).
            O estoque será controlado em mililitros e o cliente escolhe o tamanho no kiosk.
          </p>
        </div>
        <Switch
          id="isDrink"
          checked={isDrink}
          onCheckedChange={setIsDrink}
        />
      </div>

      {isDrink ? (
        <>
          {/* ═══ ESTOQUE DE BEBIDA ═══ */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-foreground uppercase tracking-wide border-b pb-2 mb-2 w-full">
              Estoque da Bebida
            </legend>

            <div className="space-y-1.5">
              <Label htmlFor="totalMl">Volume Total Disponível (ML) <span className="text-red-500">*</span></Label>
              <Input
                id="totalMl"
                type="number"
                min="0"
                value={totalMlAvailable}
                onChange={(e) => setTotalMlAvailable(Number(e.target.value) || 0)}
                placeholder="Ex: 50000 (50 litros)"
              />
              <p className="text-xs text-muted-foreground">
                Quantidade total em mililitros (barril/reservatório). Ex: um barril de 50L = 50000 ML.
                O sistema subtrai conforme os copos são servidos.
              </p>
            </div>
          </fieldset>

          {/* ═══ TAMANHOS DISPONÍVEIS ═══ */}
          <fieldset className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <legend className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Tamanhos de Copo
                </legend>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Defina os tamanhos que o cliente poderá escolher no kiosk. Cada um com seu preço.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addSize}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Tamanho
              </Button>
            </div>
            
            <div className="border rounded-lg p-4 space-y-3">
              {sizes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum tamanho cadastrado. Adicione pelo menos um para que o produto apareça no kiosk.
                </p>
              ) : (
                <>
                  {/* Header com dicas */}
                  <div className="hidden md:grid grid-cols-[1fr_1fr_100px_80px_40px] gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                    <div title="Identificador interno do tamanho, ex: p300, m500">Chave (ID)</div>
                    <div title="Nome exibido ao cliente no kiosk">Nome (exibição)</div>
                    <div title="Valor cobrado por este tamanho">Preço (R$)</div>
                    <div title="Volume em mililitros que será descontado do estoque">ML</div>
                    <div></div>
                  </div>
                  
                  {/* Size rows */}
                  {sizes.map((size, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_100px_80px_40px] gap-2">
                      <Input
                        placeholder="Ex: p300"
                        value={size.key}
                        onChange={(e) => updateSize(index, 'key', e.target.value)}
                        title="ID interno — sem espaços, use letras e números"
                      />
                      <Input
                        placeholder="Ex: Pequeno (300ml)"
                        value={size.label}
                        onChange={(e) => updateSize(index, 'label', e.target.value)}
                        title="Texto que o cliente verá na tela"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ex: 14.90"
                        value={size.price || ''}
                        onChange={(e) => updateSize(index, 'price', parseFloat(e.target.value) || 0)}
                      />
                      <Input
                        type="number"
                        min="0"
                        placeholder="Ex: 300"
                        value={size.ml || ''}
                        onChange={(e) => updateSize(index, 'ml', parseInt(e.target.value) || 0)}
                        title="Volume em mililitros"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => removeSize(index)}
                        title="Remover tamanho"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </fieldset>

          {/* Tamanho Padrão */}
          {sizes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Tamanho Pré-Selecionado</Label>
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
              <p className="text-xs text-muted-foreground">
                O tamanho que já vem selecionado quando o cliente abre o produto no kiosk.
              </p>
            </div>
          )}

          {/* Estoque Mínimo ML */}
          <div className="space-y-1.5">
            <Label htmlFor="minStockMl">Alerta de Estoque Mínimo (ML)</Label>
            <Input
              id="minStockMl"
              type="number"
              min="0"
              value={minStock}
              onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
              placeholder="Ex: 1000 (1 litro)"
            />
            <p className="text-xs text-muted-foreground">
              Você receberá um alerta quando o volume restante ficar abaixo deste valor. Ex: 1000 = 1 litro.
            </p>
          </div>

          {/* ═══ INFORMAÇÕES DA CERVEJA / QUADRO DE CHOPES ═══ */}
          <fieldset className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <Beer className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <legend className="text-sm font-semibold text-foreground">Informações da Cerveja (opcional)</legend>
                <p className="text-sm text-muted-foreground">
                  Dados exibidos no card estilo "Quadro de Chopes" na tela do kiosk.
                  Preencha para enriquecer a experiência visual do cliente.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tapNumber">Nº da Torneira</Label>
                <Input
                  id="tapNumber"
                  type="number"
                  min="1"
                  max="99"
                  value={tapNumber ?? ''}
                  onChange={(e) => setTapNumber(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Ex: 1"
                />
                <p className="text-xs text-muted-foreground">
                  Número da torneira física. Exibido em destaque no card.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="beerStyle">Estilo da Cerveja</Label>
                <Input
                  id="beerStyle"
                  list="beer-styles"
                  value={beerStyle}
                  onChange={(e) => setBeerStyle(e.target.value)}
                  placeholder="Ex: IPA, Pilsen, Stout..."
                />
                <datalist id="beer-styles">
                  <option value="Pilsen" />
                  <option value="Lager" />
                  <option value="IPA" />
                  <option value="Session IPA" />
                  <option value="American IPA" />
                  <option value="New England IPA (NEIPA)" />
                  <option value="Double IPA" />
                  <option value="Amber Ale" />
                  <option value="Pale Ale" />
                  <option value="American Pale Ale (APA)" />
                  <option value="Stout" />
                  <option value="Porter" />
                  <option value="Wheat / Weiss" />
                  <option value="Witbier" />
                  <option value="Red Ale" />
                  <option value="Blonde Ale" />
                  <option value="Belgian Tripel" />
                  <option value="Sour" />
                  <option value="Catharina Sour" />
                </datalist>
                <p className="text-xs text-muted-foreground">
                  Estilo cervejeiro. Define a cor do card automaticamente e é exibido como badge.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="priceUnitLabel">Rótulo de Preço (opcional)</Label>
                <Input
                  id="priceUnitLabel"
                  value={priceUnitLabel}
                  onChange={(e) => setPriceUnitLabel(e.target.value)}
                  placeholder="Ex: /100ml, /copo..."
                />
                <p className="text-xs text-muted-foreground">
                  Texto auxiliar ao lado do preço. Ex: "/100ml" para indicar a unidade.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="abv">ABV — Teor Alcoólico (%)</Label>
                <Input
                  id="abv"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={abv ?? ''}
                  onChange={(e) => setAbv(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="Ex: 4.8"
                />
                <p className="text-xs text-muted-foreground">
                  Alcohol By Volume. Porcentagem de álcool na bebida.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ibu">IBU — Amargor</Label>
                <Input
                  id="ibu"
                  type="number"
                  min="0"
                  max="200"
                  value={ibu ?? ''}
                  onChange={(e) => setIbu(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Ex: 45"
                />
                <p className="text-xs text-muted-foreground">
                  International Bitterness Units. Quanto maior, mais amarga. Pilsen ≈ 5–15, IPA ≈ 40–70.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accentColor">Cor do Card no Kiosk</Label>
                <Select value={accentColor} onValueChange={setAccentColor}>
                  <SelectTrigger id="accentColor">
                    <SelectValue placeholder="Automático (definido pelo estilo)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      <span className="flex items-center gap-2">🎨 Automático (pelo estilo)</span>
                    </SelectItem>
                    <SelectItem value="violet">
                      <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-violet-600" /> Violeta (IPA)</span>
                    </SelectItem>
                    <SelectItem value="cream">
                      <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-amber-100 ring-1 ring-amber-300" /> Creme (Pilsen/Lager)</span>
                    </SelectItem>
                    <SelectItem value="sky">
                      <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-sky-600" /> Azul</span>
                    </SelectItem>
                    <SelectItem value="amber">
                      <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Âmbar (Session)</span>
                    </SelectItem>
                    <SelectItem value="yellow">
                      <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-yellow-400" /> Amarelo</span>
                    </SelectItem>
                    <SelectItem value="red">
                      <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-red-600" /> Vermelho</span>
                    </SelectItem>
                    <SelectItem value="green">
                      <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-green-600" /> Verde</span>
                    </SelectItem>
                    <SelectItem value="stone">
                      <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-stone-600" /> Escuro (Stout/Porter)</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cor de destaque do card. "Automático" escolhe com base no estilo da cerveja.
                </p>
              </div>
            </div>
          </fieldset>
        </>
      ) : (
        /* ═══ ESTOQUE PRODUTO NORMAL ═══ */
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-foreground uppercase tracking-wide border-b pb-2 mb-2 w-full">
            Controle de Estoque
          </legend>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="stock">Quantidade em Estoque <span className="text-red-500">*</span></Label>
              <Input
                id="stock"
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                placeholder="Ex: 50"
              />
              <p className="text-xs text-muted-foreground">
                Quantas unidades disponíveis para venda. Zero = produto indisponível no kiosk.
              </p>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="minStock">Alerta de Estoque Mínimo</Label>
              <Input
                id="minStock"
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                placeholder="Ex: 5"
              />
              <p className="text-xs text-muted-foreground">
                Você será alertado quando o estoque atingir este número. Ex: 5 unidades.
              </p>
            </div>
          </div>
        </fieldset>
      )}

      {/* ═══ TAGS ═══ */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide border-b pb-2 mb-2 w-full">
          Tags (opcional)
        </legend>
        <p className="text-xs text-muted-foreground -mt-1">
          Palavras-chave que ajudam o cliente a encontrar o produto no kiosk. Ex: "artesanal", "sem glúten", "promoção".
        </p>
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
                  className="ml-1 p-0.5 hover:bg-muted-foreground/20 rounded"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </fieldset>

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
