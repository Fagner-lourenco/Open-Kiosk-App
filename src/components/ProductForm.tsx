
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
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
        minStock,  // ✅ Usando a variável do state
        // Compatibilidade com fluxo antigo
        price: sizes[0]?.price || 0,
        stock: 0,
        inStock: (totalMlAvailable || 0) > 0
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="title">{t('products.productTitle')}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder={t('products.enterTitle')}
              />
            </div>
            { !isDrink && (
              <div className="space-y-2">
                <Label htmlFor="price">{t('products.price')} ({currentCurrency.symbol})</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  required
                  placeholder="0.00"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('products.description')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('products.enterDescription')}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="image">{t('products.imageUrl')}</Label>
              <Input
                id="image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder={t('products.imageUrlPlaceholder')}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">{t('products.category')}</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t('products.categoryPlaceholder')}
              />
            </div>
          </div>

          {/* Toggle: É uma bebida? */}
          <div className="col-span-2 space-y-2">
            <div className="flex items-center space-x-2">
              <Switch
                checked={isDrink}
                onCheckedChange={setIsDrink}
                id="isDrink"
              />
              <Label htmlFor="isDrink">{t('products.isDrink')}</Label>
            </div>
          </div>

          { isDrink ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="totalMl">{t('products.totalMl')}</Label>
                <Input
                  id="totalMl"
                  type="number"
                  value={totalMlAvailable}
                  onChange={(e) => setTotalMlAvailable(Number(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label>{t('products.sizes')}</Label>
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
                        placeholder="0.00"
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
                        placeholder="0"
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
              </div>

              {sizes.length > 0 && (
                <div className="space-y-2">
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
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="minStock">{t('products.minStockAlertMl')}</Label>
                <Input
                  id="minStock"
                  type="number"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                  placeholder="1000"
                />
                <p className="text-xs text-muted-foreground">
                  {t('products.minStockAlertDescription')}
                </p>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="stock">{t('products.stockQuantity')}</Label>
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
                <Label htmlFor="minStock">{t('products.minStockAlert')}</Label>
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

          <div className="space-y-4">
            <Label>{t('products.tags')}</Label>
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
          </div>

          <Button type="submit" className="w-full">
            {initialProduct ? t('products.updateProduct') : t('products.addProduct')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ProductForm;
