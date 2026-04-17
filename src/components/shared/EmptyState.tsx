interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = "📭", title, description, action }: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center py-16 px-4 text-center bg-dots-light rounded-2xl border-2 border-dashed border-foreground/30">
      {/* Decorative shapes */}
      <span
        aria-hidden
        className="hidden md:block absolute top-6 left-12 size-4 rounded-full bg-pop-pink border-2 border-foreground"
      />
      <span
        aria-hidden
        className="hidden md:block absolute top-10 right-10 size-5 rounded-full bg-quaternary border-2 border-foreground animate-float"
      />
      <span
        aria-hidden
        className="hidden md:block absolute bottom-12 left-16"
      >
        <svg width="20" height="20" viewBox="0 0 20 20">
          <polygon
            points="10,2 18,18 2,18"
            fill="var(--tertiary)"
            stroke="var(--foreground)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <div className="relative inline-flex items-center justify-center size-20 rounded-full border-2 border-foreground bg-tertiary shadow-hard mb-5 animate-pop-in">
        <span className="text-4xl">{icon}</span>
      </div>
      <h3 className="font-display text-xl font-bold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-muted-foreground text-sm max-w-sm font-medium">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
