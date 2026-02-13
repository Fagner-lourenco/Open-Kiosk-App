import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DangerZoneCardProps {
  description: string;
  children: React.ReactNode;
}

export function DangerZoneCard({ description, children }: DangerZoneCardProps) {
  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-base text-red-600">Zona de Perigo</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
