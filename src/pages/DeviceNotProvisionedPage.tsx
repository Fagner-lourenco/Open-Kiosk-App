import { Button } from "@/components/ui/button";
import { MonitorX, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DeviceNotProvisionedPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 text-white flex items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-3xl border border-white/10 bg-black/30 backdrop-blur-md shadow-2xl p-8 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15 border border-amber-400/20">
          <MonitorX className="h-10 w-10 text-amber-300" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Dispositivo nao provisionado</h1>
        <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
          Este tablet iniciou sem uma loja vinculada. Faca login com seu usuario e senha
          para vincular este dispositivo a sua franquia.
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm text-slate-300">
          <p className="font-medium text-white">Como corrigir</p>
          <p className="mt-2">
            Faca login com sua conta de administrador. Apos autenticar, selecione a
            loja/franquia correta. O bootstrap do kiosk sera salvo localmente para os
            proximos reinicios e atualizacoes.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            className="gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950"
            onClick={() => navigate('/login')}
          >
            <LogIn className="h-4 w-4" />
            Fazer Login
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeviceNotProvisionedPage;
