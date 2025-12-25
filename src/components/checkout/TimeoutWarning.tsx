import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TimeoutWarningProps } from "@/types/checkoutFlow";

export function TimeoutWarning({ isOpen, secondsLeft, action, onExtend, onProceed }: TimeoutWarningProps) {
  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <DialogTitle className="text-lg font-bold text-red-700">Atenção!</DialogTitle>
          </div>
        </DialogHeader>

        <DialogDescription className="text-base text-gray-700">
          A sessão fechará em <span className="font-bold text-red-600">{secondsLeft}s</span> se não houver interação.
          <br />
          <br />
          Quando isso acontecer, {action}.
        </DialogDescription>

        <div className="flex gap-2 mt-6">
          <Button variant="outline" onClick={onExtend} className="flex-1">
            Estender (+60s)
          </Button>
          <Button onClick={onProceed} className="flex-1 bg-red-600 hover:bg-red-700">
            Continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
