import { MapPin } from 'lucide-react';

/**
 * RegionsSection - Mostra as regiões atendidas de forma clara
 * Diferencia eventos pequenos/médios vs grandes
 */
export default function RegionsSection() {
  return (
    <div className="bg-muted/30 rounded-lg p-8 border border-border">
      <h3 className="text-2xl font-bold mb-6 text-center">Onde atuamos</h3>
      <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
        <div className="space-y-3 bg-card p-6 rounded-lg border">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-2">
                Eventos pequenos e médios
              </h4>
              <p className="text-muted-foreground text-sm mb-1">
                Curitiba e Região Metropolitana
              </p>
              <p className="text-xs text-muted-foreground">
                Atendemos eventos de até 20 mil pessoas com estrutura local completa
              </p>
            </div>
          </div>
        </div>
        
        <div className="space-y-3 bg-card p-6 rounded-lg border">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-2">
                Eventos grandes
              </h4>
              <p className="text-muted-foreground text-sm mb-1">
                Todo o Sul do Brasil
              </p>
              <p className="text-xs text-muted-foreground">
                Operação completa para eventos acima de 20 mil pessoas no PR, SC e RS
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <p className="text-center text-xs text-muted-foreground mt-6">
        Para unidades próprias, atendemos todo o Brasil com implantação e suporte remoto
      </p>
    </div>
  );
}
