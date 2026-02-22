
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, GlassWater, Beer } from "lucide-react";
import { Product, ProductSize } from "@/types/product";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";

interface ProductFormProps {
  onSubmit: (product: Omit<Product, "id">) => void;
  initialProduct?: Product;
}

const ProductForm = ({ onSubmit, initialProduct }: ProductFormProps) => {
  const { currentCurrency } = useSettings();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialProduct?.title || "");
  const [price, setPrice] = useState(initialProduct?.price || 0);
  const [description, setDescription] = useState(initialProduct?.description || "");
  const [image, setImage] = useState(initialProduct?.image || "");
  const [category, setCategory] = useState(initialProduct?.category || "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(initialProduct?.tags || []);
  const [inStock, setInStock] = useState(initialProduct?.inStock ?? true);
  const [stock, setStock] = useState(initialProduct?.stock || 0);
  const [minStock, setMinStock] = useState(initialProduct?.minStock || 5);

  // Bebidas: estados opcionais (intervenção mínima)
  const [isDrink, setIsDrink] = useState(initialProduct?.isDrink || false);
  const [sizes, setSizes] = useState<ProductSize[]>(initialProduct?.sizes || []);
  const [defaultSizeKey, setDefaultSizeKey] = useState(initialProduct?.defaultSizeKey || "");
  const [totalMlAvailable, setTotalMlAvailable] = useState(initialProduct?.totalMlAvailable || 0);

  // Beer info (Quadro de Chopes)
  const [tapNumber, setTapNumber] = useState<number | undefined>(initialProduct?.tapNumber);
  const [beerStyle, setBeerStyle] = useState(initialProduct?.style || "");
  const [abv, setAbv] = useState<number | undefined>(initialProduct?.abv);
  const [ibu, setIbu] = useState<number | undefined>(initialProduct?.ibu);
  const [priceUnitLabel, setPriceUnitLabel] = useState(initialProduct?.priceUnitLabel || "");
  const [accentColor, setAccentColor] = useState(initialProduct?.accentColor || "");

  const isValidUrl = (value: string) => {
    if (!value) return true; // empty allowed
    try {
      new URL(value);
      return true;
    } catch (error) {
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (image && !isValidUrl(image)) {
      toast({
        title: t('products.invalidImageUrl'),
        description: t('products.invalidImageUrlDescription'),
        variant: "destructive"
      });
      return;
    }

    if (isDrink) {
      // Validação mínima para bebidas
      if (!sizes || sizes.length === 0) {
        toast({
          title: t('products.missingSizes'),
          description: t('products.missingSizesDescription'),
          variant: "destructive"
        });
        return;
      }

        if (sizes[0]?.ml === 0 || sizes[0]?.ml === undefined) {
          toast({
            title: t('products.invalidSize'),
            description: t('products.invalidSizeDescription'),
            variant: "destructive"
          });
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
        defaultSizeKey,
        totalMlAvailable,
        minStock,
        // Compatibilidade com fluxo antigo
        price: sizes[0]?.price || 0,
        stock: 0,
        inStock: (totalMlAvailable || 0) > 0,
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
        inStock: stock > 0,
        stock,
        minStock
      });
    }
    
    // Reset form if not editing
    if (!initialProduct) {
      setTitle("");
      setPrice(0);
      setDescription("");
      setImage("");
      setCategory("");
      setTags([]);
      setTagInput("");
      setInStock(true);
      setStock(0);
      setMinStock(5);
      setIsDrink(false);
      setSizes([]);
      setDefaultSizeKey("");
      setTotalMlAvailable(0);
      setTapNumber(undefined);
      setBeerStyle("");
      setAbv(undefined);
      setIbu(undefined);
      setPriceUnitLabel("");
      setAccentColor("");
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleTagInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ═══ INFORMAÇÕES BÁSICAS ═══ */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wide border-b pb-2 mb-2 w-full">
              {t('products.sectionBasicInfo')}
            </legend>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <Label htmlFor="title">{t('products.productTitle')} <span className="text-red-500">*</span></Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder={t('products.enterTitle')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('products.titleHint')}
                </p>
              </div>
              { !isDrink && (
                <div className="space-y-1.5">
                  <Label htmlFor="price">{t('products.price')} ({currentCurrency.symbol}) <span className="text-red-500">*</span></Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                    required
                    placeholder="Ex: 12.90"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('products.priceHint')}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">{t('products.description')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('products.enterDescription')}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {t('products.descriptionHint')}
              </p>
            </div>
          </fieldset>

          {/* ═══ ORGANIZAÇÃO ═══ */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wide border-b pb-2 mb-2 w-full">
              {t('products.sectionOrganization')}
            </legend>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <Label htmlFor="image">{t('products.imageUrl')}</Label>
                <Input
                  id="image"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder={t('products.imageUrlPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('products.imageHint')}
                </p>
                {image && isValidUrl(image) && (
                  <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden bg-muted border">
                    <img src={image} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="category">{t('products.category')}</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={t('products.categoryPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('products.categoryHint')}
                </p>
              </div>
            </div>
          </fieldset>

          {/* ═══ TIPO DE PRODUTO ═══ */}
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <GlassWater className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="flex-1">
              <Label htmlFor="isDrink" className="font-medium cursor-pointer">{t('products.isDrink')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('products.isDrinkHint')}
              </p>
            </div>
            <Switch
              checked={isDrink}
              onCheckedChange={setIsDrink}
              id="isDrink"
            />
          </div>

          { isDrink ? (
            <>
              {/* ═══ ESTOQUE DA BEBIDA ═══ */}
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold uppercase tracking-wide border-b pb-2 mb-2 w-full">
                  {t('products.sectionDrinkStock')}
                </legend>

                <div className="space-y-1.5">
                  <Label htmlFor="totalMl">{t('products.totalMl')} <span className="text-red-500">*</span></Label>
                  <Input
                    id="totalMl"
                    type="number"
                    value={totalMlAvailable}
                    onChange={(e) => setTotalMlAvailable(Number(e.target.value) || 0)}
                    placeholder="Ex: 50000 (50 litros)"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('products.totalMlHint')}
                  </p>
                </div>
              </fieldset>

              {/* ═══ TAMANHOS DE COPO ═══ */}
              <fieldset className="space-y-3">
                <div>
                  <legend className="text-sm font-semibold uppercase tracking-wide">
                    {t('products.sizes')}
                  </legend>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('products.sizesHint')}
                  </p>
                </div>

                <div className="border rounded p-4 space-y-3">
                  <div className="hidden md:grid grid-cols-[1fr_1fr_110px_90px_50px] gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                    <div>{t('products.sizeKeyHeader')}</div>
                    <div>{t('products.sizeLabelHeader')}</div>
                    <div>{t('products.sizePriceHeader')} ({currentCurrency.code})</div>
                    <div>{t('products.sizeMlHeader')}</div>
                    <div></div>
                  </div>
                  {sizes.map((size, index) => (
                    <div key={index} className="flex flex-col md:grid md:grid-cols-[1fr_1fr_110px_90px_50px] gap-2">
                      <Input
                        placeholder={t('products.sizeKeyPlaceholder')}
                        value={size.key}
                        onChange={(e) => {
                          const newSizes = [...sizes];
                          newSizes[index] = { ...newSizes[index], key: e.target.value };
                          setSizes(newSizes);
                        }}
                      />
                      <Input
                        placeholder={t('products.sizeLabelPlaceholder')}
                        value={size.label}
                        onChange={(e) => {
                          const newSizes = [...sizes];
                          newSizes[index] = { ...newSizes[index], label: e.target.value };
                          setSizes(newSizes);
                        }}
                      />
                      <Input
                        placeholder="Ex: 14.90"
                        type="number"
                        step="0.01"
                        min="0"
                        value={size.price}
                        onChange={(e) => {
                          const newSizes = [...sizes];
                          newSizes[index] = { ...newSizes[index], price: Number(e.target.value) || 0 };
                          setSizes(newSizes);
                        }}
                      />
                      <Input
                        placeholder="Ex: 300"
                        type="number"
                        min="0"
                        value={size.ml}
                        onChange={(e) => {
                          const newSizes = [...sizes];
                          newSizes[index] = { ...newSizes[index], ml: Number(e.target.value) || 0 };
                          setSizes(newSizes);
                        }}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setSizes(sizes.filter((_, i) => i !== index))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSizes([...sizes, { key: "", label: "", price: 0, ml: 0 }])}
                  >
                    {t('products.addSize')}
                  </Button>
                </div>
              </fieldset>

              {sizes.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t('products.defaultSize')}</Label>
                  <Select value={defaultSizeKey} onValueChange={setDefaultSizeKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('products.selectDefaultSize')} />
                    </SelectTrigger>
                    <SelectContent>
                      {sizes.map((s) => (
                        <SelectItem key={s.key} value={s.key || `size-${s.label}`}>
                          {s.label || t('products.noName')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('products.defaultSizeHint')}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="minStock">{t('products.minStockAlertMl')}</Label>
                <Input
                  id="minStock"
                  type="number"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                  placeholder="Ex: 1000 (1 litro)"
                />
                <p className="text-xs text-muted-foreground">
                  {t('products.minStockAlertDescription')}
                </p>
              </div>

              {/* ═══ INFORMAÇÕES DA CERVEJA ═══ */}
              <fieldset className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                  <Beer className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <legend className="text-sm font-semibold">{t('products.beerInfoTitle')}</legend>
                    <p className="text-sm text-muted-foreground">
                      {t('products.beerInfoDescription')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="tapNumber">{t('products.tapNumber')}</Label>
                    <Input
                      id="tapNumber"
                      type="number"
                      min="1"
                      max="99"
                      value={tapNumber ?? ''}
                      onChange={(e) => setTapNumber(e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Ex: 1"
                    />
                    <p className="text-xs text-muted-foreground">{t('products.tapNumberHint')}</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="beerStyle">{t('products.beerStyle')}</Label>
                    <Input
                      id="beerStyle"
                      list="beer-styles-kiosk"
                      value={beerStyle}
                      onChange={(e) => setBeerStyle(e.target.value)}
                      placeholder="Ex: IPA, Pilsen, Stout..."
                    />
                    <datalist id="beer-styles-kiosk">
                      <option value="Pilsen" />
                      <option value="Lager" />
                      <option value="IPA" />
                      <option value="Session IPA" />
                      <option value="American IPA" />
                      <option value="New England IPA (NEIPA)" />
                      <option value="Double IPA" />
                      <option value="Amber Ale" />
                      <option value="Pale Ale" />
                      <option value="Stout" />
                      <option value="Porter" />
                      <option value="Wheat / Weiss" />
                      <option value="Red Ale" />
                      <option value="Blonde Ale" />
                      <option value="Sour" />
                    </datalist>
                    <p className="text-xs text-muted-foreground">{t('products.beerStyleHint')}</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="priceUnitLabel">{t('products.priceUnitLabel')}</Label>
                    <Input
                      id="priceUnitLabel"
                      value={priceUnitLabel}
                      onChange={(e) => setPriceUnitLabel(e.target.value)}
                      placeholder="Ex: /100ml, /copo..."
                    />
                    <p className="text-xs text-muted-foreground">{t('products.priceUnitLabelHint')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="abv">{t('products.abv')}</Label>
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
                    <p className="text-xs text-muted-foreground">{t('products.abvHint')}</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ibu">{t('products.ibu')}</Label>
                    <Input
                      id="ibu"
                      type="number"
                      min="0"
                      max="200"
                      value={ibu ?? ''}
                      onChange={(e) => setIbu(e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Ex: 45"
                    />
                    <p className="text-xs text-muted-foreground">{t('products.ibuHint')}</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="accentColor">{t('products.accentColor')}</Label>
                    <Select value={accentColor} onValueChange={setAccentColor}>
                      <SelectTrigger id="accentColor">
                        <SelectValue placeholder={t('products.accentColorAuto')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          <span className="flex items-center gap-2">🎨 {t('products.accentColorAuto')}</span>
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
                          <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-stone-600" /> Escuro (Stout)</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t('products.accentColorHint')}</p>
                  </div>
                </div>
              </fieldset>
            </>
          ) : (
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold uppercase tracking-wide border-b pb-2 mb-2 w-full">
                {t('products.sectionStock')}
              </legend>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label htmlFor="stock">{t('products.stockQuantity')} <span className="text-red-500">*</span></Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                    placeholder="Ex: 50"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('products.stockHint')}
                  </p>
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="minStock">{t('products.minStockAlert')}</Label>
                  <Input
                    id="minStock"
                    type="number"
                    min="0"
                    value={minStock}
                    onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                    placeholder="Ex: 5"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('products.minStockHint')}
                  </p>
                </div>
              </div>
            </fieldset>
          )}

          {/* ═══ TAGS ═══ */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold uppercase tracking-wide border-b pb-2 mb-2 w-full">
              {t('products.tags')}
            </legend>
            <p className="text-xs text-muted-foreground -mt-1">
              {t('products.tagsHint')}
            </p>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleTagInputKeyPress}
                placeholder={t('products.addTagPlaceholder')}
                className="flex-1"
              />
              <Button type="button" onClick={addTag}>{t('products.addTag')}</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <X 
                    className="w-3 h-3 cursor-pointer hover:text-red-500" 
                    onClick={() => removeTag(tag)}
                  />
                </Badge>
              ))}
            </div>
          </fieldset>

          <Button type="submit" className="w-full">
            {initialProduct ? t('products.updateProduct') : t('products.addProduct')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ProductForm;
