interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-y-2 mb-6 animate-bounce-up">
      <div className="flex items-start gap-3">
        {/* Decorative geometric accent */}
        <span
          aria-hidden
          className="hidden md:block size-3 rounded-full bg-tertiary border-2 border-foreground mt-3 animate-float"
        />
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-none">
            {title}
            <span className="text-primary">.</span>
          </h1>
          {subtitle && (
            <p className="text-muted-foreground text-sm mt-2 font-medium">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
