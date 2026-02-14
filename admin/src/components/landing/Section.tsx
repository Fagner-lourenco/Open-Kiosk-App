interface SectionProps {
  /**
   * Id para âncora de navegação. Deve ser único.
   */
  id: string;
  /**
   * Título principal da seção. Use linguagem clara e objetiva.
   */
  title: string;
  /**
   * Texto opcional abaixo do título, usado para dar contexto.
   */
  subtitle?: string;
  /** Conteúdo da seção. */
  children: React.ReactNode;
  /**
   * Estilização extra opcional para o wrapper da seção.
   */
  className?: string;
}

/**
 * Container de seção padronizado. Centraliza a largura com `container mx-auto` e
 * aplica espaçamentos verticais. Inclui título e subtítulo centralizados.
 */
export default function Section({
  id,
  title,
  subtitle,
  children,
  className,
}: SectionProps) {
  return (
    <section id={id} className={`scroll-mt-24 py-16 md:py-24 ${className ?? ''}`.trim()}>
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
