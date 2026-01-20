import React, { useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Device } from '@capacitor/device';
import { useAuth } from '@/context/AuthContext';
import { useAdminPin } from '@/hooks/useAdminPin';
import { isFranchiseMode } from '@/lib/pathResolver';

/**
 * Componente que detecta gesto secreto (5 cliques rápidos)
 * 
 * Em modo legado: Abre modal com PIN
 * Em modo franquia: Redireciona para /login (usa Firebase Auth)
 *
 * Use envolvendo o App inteiro:
 * <AdminSecretAccess>
 *   <AppContent />
 * </AdminSecretAccess>
 */

interface AdminSecretAccessProps {
  children: ReactNode;
}

export const AdminSecretAccess: React.FC<AdminSecretAccessProps> = ({ children }) => {
  const navigate = useNavigate();
  const { setIsAuthenticated, isAuthenticated, loginWithPin } = useAuth();
  const { validatePinWithRateLimit } = useAdminPin();

  // State do gesto
  const [tapCount, setTapCount] = useState(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State do modal (apenas modo legado)
  const [showModal, setShowModal] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Detectar 5 cliques rápidos (< 500ms entre eles)
   * Ignora cliques em elementos interativos e quando modal está aberto
   */
  const handleScreenTap = useCallback((e: React.MouseEvent) => {
    // Ignorar se modal está aberto
    if (showModal) return;
    
    // Ignorar cliques em elementos interativos
    const target = e.target as HTMLElement;
    const interactiveTags = ['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'];
    const isInteractive = interactiveTags.includes(target.tagName) ||
      target.closest('button, a, input, select, textarea, [role="button"]');
    
    if (isInteractive) return;
    
    // Limpar timer anterior
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    const newCount = tapCount + 1;
    setTapCount(newCount);

    // Se 5 cliques em 500ms
    if (newCount === 5) {
      console.log('[AdminAccess] 🎯 Gesto secreto detectado!');
      setTapCount(0);
      
      // Modo franquia: redirecionar para login
      if (isFranchiseMode()) {
        console.log('[AdminAccess] Modo franquia - redirecionando para /login');
        navigate('/login');
        return;
      }
      
      // Modo legado: abrir modal PIN
      console.log('[AdminAccess] Modo legado - abrindo modal PIN');
      setShowModal(true);
      setPin('');
      setError('');
    } else {
      // Resetar contador após 500ms
      tapTimerRef.current = setTimeout(() => {
        setTapCount(0);
      }, 500);
    }
  }, [tapCount, showModal, navigate]);

  /**
   * Limpar timer ao desmontar
   */
  useEffect(() => {
    return () => {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
      }
    };
  }, []);

  /**
   * Validar PIN e desbloquear (modo legado)
   */
  const handlePinSubmit = async () => {
    try {
      setLoading(true);
      setError('');

      // Em modo franquia, usar loginWithPin do contexto
      if (isFranchiseMode()) {
        const result = await loginWithPin(pin);
        
        if (!result.success) {
          setError(result.error || 'PIN incorreto');
          setPin('');
          return;
        }
        
        setShowModal(false);
        setPin('');
        setTimeout(() => navigate('/admin'), 300);
        return;
      }

      // Modo legado: usar validatePinWithRateLimit
      const result = await validatePinWithRateLimit(pin);

      if (!result.valid) {
        setError(result.message || 'PIN incorreto');
        setPin('');
        return;
      }

      // ✅ PIN correto!
      console.log('[AdminAccess] ✅ PIN correto! Desbloqueando admin...');

      setIsAuthenticated(true);
      setShowModal(false);
      setPin('');

      // Log auditoria
      const deviceId = await Device.getId();
      console.info('[AdminAccess] ADMIN_UNLOCK_SUCCESS', {
        deviceId: deviceId.identifier,
        timestamp: new Date().toISOString(),
      });

      // Navegar para admin
      setTimeout(() => navigate('/admin'), 300);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao validar PIN';
      setError(errorMessage);
      console.error('[AdminAccess] Erro ao validar PIN:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fechar modal e resetar
   */
  const handleCancel = () => {
    setShowModal(false);
    setPin('');
    setError('');
  };

  /**
   * Permitir Enter para submeter
   */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handlePinSubmit();
    }
  };

  return (
    <div onClick={handleScreenTap} style={{ width: '100%', height: '100%' }}>
      {children}

      {/* Modal secreto de administrador */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={(e) => {
            // Fechar ao clicar fora do modal
            if (e.target === e.currentTarget) {
              handleCancel();
            }
          }}
        >
          <div
            style={{
              background: '#ffffff',
              padding: '40px 30px',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '400px',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()} // Prevenir fechar ao clicar no modal
          >
            {/* Cabeçalho */}
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ margin: '0 0 10px 0', fontSize: '24px', fontWeight: 'bold' }}>
                🔐 Painel de Administrador
              </h2>
              <p
                style={{
                  margin: '0',
                  fontSize: '14px',
                  color: '#666',
                  fontWeight: 'normal',
                }}
              >
                Digite o PIN para desbloquear
              </p>
            </div>

            {/* Input de PIN */}
            <input
              type="password"
              value={pin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setPin(value);
              }}
              onKeyPress={handleKeyPress}
              placeholder="0000"
              maxLength={6}
              disabled={loading}
              autoFocus
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '28px',
                textAlign: 'center',
                letterSpacing: '8px',
                border: error ? '2px solid #f44336' : '1px solid #ddd',
                borderRadius: '8px',
                marginBottom: '10px',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                background: '#f9f9f9',
              }}
            />

            {/* Mensagem de erro */}
            {error && (
              <div
                style={{
                  color: '#f44336',
                  marginBottom: '15px',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                ❌ {error}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handlePinSubmit}
                disabled={loading || pin.length < 4}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: loading || pin.length < 4 ? '#ccc' : '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading || pin.length < 4 ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!loading && pin.length >= 4) {
                    (e.target as HTMLButtonElement).style.background = '#45a049';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading && pin.length >= 4) {
                    (e.target as HTMLButtonElement).style.background = '#4CAF50';
                  }
                }}
              >
                {loading ? '⏳ Validando...' : '✅ Desbloquear'}
              </button>

              <button
                onClick={handleCancel}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: loading ? '#ccc' : '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    (e.target as HTMLButtonElement).style.background = '#da190b';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    (e.target as HTMLButtonElement).style.background = '#f44336';
                  }
                }}
              >
                ❌ Cancelar
              </button>
            </div>

            {/* Info */}
            <p style={{ margin: '15px 0 0 0', fontSize: '12px', color: '#999' }}>
              Clique em qualquer lugar 5 vezes para abrir este painel
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
