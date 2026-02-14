import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
}

/**
 * Renderiza um acordeão simples para perguntas frequentes. Apenas um item
 * pode ficar aberto de cada vez. Usa botões semânticos para acessibilidade
 * com atributo `aria-expanded`.
 */
export default function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={index} className="border rounded-lg">
            <button
              type="button"
              className="flex w-full items-center justify-between p-4 text-left focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
            >
              <span className="font-medium text-foreground">
                {item.question}
              </span>
              {isOpen ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </button>
            {isOpen && (
              <div className="border-t p-4 text-sm text-muted-foreground">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
