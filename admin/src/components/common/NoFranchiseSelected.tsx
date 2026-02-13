import { Building2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface NoFranchiseSelectedProps {
  description?: string;
}

export function NoFranchiseSelected({
  description = 'Selecione uma franquia no menu lateral',
}: NoFranchiseSelectedProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <CardTitle>Nenhuma franquia selecionada</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
