import React, { useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

/**
 * Componente que detecta gesto secreto (5 cliques r?pidos)
 * e redireciona para login/admin.
 */

interface AdminSecretAccessProps {
  children: ReactNode;
}

export const AdminSecretAccess: React.FC<AdminSecretAccessProps> = ({ children }) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [tapCount, setTapCount] = useState(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleScreenTap = useCallback((e: React.MouseEvent) => {
    // Ignorar cliques em elementos interativos
    const target = e.target as HTMLElement;
    const interactiveTags = ['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA'];
    const isInteractive = interactiveTags.includes(target.tagName) ||
      target.closest('button, a, input, select, textarea, [role="button"]');

    if (isInteractive) return;

    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    const newCount = tapCount + 1;
    setTapCount(newCount);

    if (newCount === 5) {
      setTapCount(0);
      navigate(isAuthenticated ? '/admin' : '/login');
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      setTapCount(0);
    }, 500);
  }, [tapCount, navigate, isAuthenticated]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
      }
    };
  }, []);

  return (
    <div onClick={handleScreenTap} style={{ width: '100%', height: '100%' }}>
      {children}
    </div>
  );
};
