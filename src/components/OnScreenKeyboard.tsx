
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { useTranslation } from "@/i18n";

interface OnScreenKeyboardProps {
  onKeyPress: (key: string) => void;
  onClose: () => void;
  isVisible: boolean;
  darkMode?: boolean;
}

const OnScreenKeyboard = ({ onKeyPress, onClose, isVisible, darkMode = false }: OnScreenKeyboardProps) => {
  const { t } = useTranslation();
  const keyboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (keyboardRef.current && !keyboardRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const keys = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ];

  const handleKeyPress = (key: string) => {
    onKeyPress(key);
  };

  const handleSpecialKey = (action: string) => {
    switch (action) {
      case 'space':
        onKeyPress(' ');
        break;
      case 'backspace':
        onKeyPress('BACKSPACE');
        break;
      case 'clear':
        onKeyPress('CLEAR');
        break;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
      <div ref={keyboardRef} className={"w-full p-4 rounded-t-lg shadow-2xl " + (darkMode ? "bg-neutral-900 text-white" : "bg-white")}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{t('keyboard.title')}</h3>
          <Button variant="outline" size="sm" onClick={onClose}
            className={darkMode ? "border-neutral-700 text-white hover:bg-neutral-800" : ""}
          >
            {t('keyboard.close')}
          </Button>
        </div>
        
        <div className="space-y-2">
          {keys.map((row, rowIndex) => (
            <div key={rowIndex} className="flex justify-center gap-1">
              {row.map((key) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className={"min-w-[2.5rem] h-10 " + (darkMode ? "border-neutral-700 text-white hover:bg-neutral-800 active:bg-neutral-700" : "active:bg-blue-100")}
                  onClick={() => handleKeyPress(key)}
                >
                  {key.toUpperCase()}
                </Button>
              ))}
            </div>
          ))}
          
          <div className="flex justify-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              className={"px-6 " + (darkMode ? "border-neutral-700 text-white hover:bg-neutral-800" : "")}
              onClick={() => handleSpecialKey('space')}
            >
              {t('keyboard.space')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={"px-4 " + (darkMode ? "border-neutral-700 text-white hover:bg-neutral-800" : "")}
              onClick={() => handleSpecialKey('backspace')}
            >
              ⌫
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={"px-4 " + (darkMode ? "border-neutral-700 text-white hover:bg-neutral-800" : "")}
              onClick={() => handleSpecialKey('clear')}
            >
              {t('keyboard.clear')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnScreenKeyboard;
