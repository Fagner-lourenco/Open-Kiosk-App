
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

interface ProductFormProps {
  onSubmit: (product: Omit<Product, "id">) => void;
  initialProduct?: Product;
}

const ProductForm = ({ onSubmit, initialProduct }: ProductFormProps) => {
  const { currentCurrency } = useSettings();
  const { toast } = useToast();
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
        title: "Invalid image URL",
        description: "Please enter a valid URL for the image.",
        variant: "destructive"
      });
      return;
    }

    if (isDrink) {
      // Validação mínima para bebidas
      if (!sizes || sizes.length === 0) {
        toast({
          title: "Missing sizes",
          description: "Add at least one size for drinks.",
          variant: "destructive"
        });
        return;
      }

        if (sizes[0]?.ml === 0 || sizes[0]?.ml === undefined) {
          toast({
            title: "Invalid size",
            description: "Size must include volume (ml) greater than 0.",
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
              <Label htmlFor="title">Product Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Enter product title"
              />
            </div>
            { !isDrink && (
              <div className="space-y-2">
                <Label htmlFor="price">Price ({currentCurrency.symbol})</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value))}
                  required
                  placeholder="0.00"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter product description"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="image">Image URL</Label>
              <Input
                id="image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Fruits, Vegetables, Dairy"
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
              <Label htmlFor="isDrink">É uma bebida?</Label>
            </div>
          </div>

          { isDrink ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="totalMl">Total ML Disponível</Label>
                <Input
                  id="totalMl"
                  type="number"
                  value={totalMlAvailable}
                  onChange={(e) => setTotalMlAvailable(Number(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label>Tamanhos</Label>
                <div className="border rounded p-4 space-y-3">
                  <div className="hidden md:grid grid-cols-[1fr_1fr_110px_90px_50px] gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                    <div>Key (ID único)</div>
                    <div>Label (exibição)</div>
                    <div>Preço ({currentCurrency.code})</div>
                    <div>ML</div>
                    <div></div>
                  </div>
                  {sizes.map((size, index) => (
                    <div key={index} className="flex flex-col md:grid md:grid-cols-[1fr_1fr_110px_90px_50px] gap-2">
                      <Input
                        placeholder="Key (ex: s300)"
                        value={size.key}
                        onChange={(e) => {
                          const newSizes = [...sizes];
                          newSizes[index] = { ...newSizes[index], key: e.target.value };
                          setSizes(newSizes);
                        }}
                      />
                      <Input
                        placeholder="Label (ex: 300ml)"
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
                    + Adicionar Tamanho
                  </Button>
                </div>
              </div>

              {sizes.length > 0 && (
                <div className="space-y-2">
                  <Label>Tamanho Padrão</Label>
                  <Select value={defaultSizeKey} onValueChange={setDefaultSizeKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o tamanho padrão" />
                    </SelectTrigger>
                    <SelectContent>
                      {sizes.map((s) => (
                        <SelectItem key={s.key} value={s.key || `size-${s.label}`}>
                          {s.label || '(sem nome)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="minStock">Minimum Stock Alert (ML)</Label>
                <Input
                  id="minStock"
                  type="number"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                  placeholder="1000"
                />
                <p className="text-xs text-muted-foreground">
                  Alerta quando o estoque estiver abaixo deste valor em ML
                </p>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="stock">Stock Quantity</Label>
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
                <Label htmlFor="minStock">Minimum Stock Alert</Label>
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
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleTagInputKeyPress}
                placeholder="Add a tag and press Enter"
                className="flex-1"
              />
              <Button type="button" onClick={addTag}>Add Tag</Button>
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
            {initialProduct ? "Update Product" : "Add Product"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ProductForm;
