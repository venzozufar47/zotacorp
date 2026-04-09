export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] px-4">
      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="text-center mb-8">
          <h1
            className="font-display text-4xl mb-1"
            style={{ color: "var(--primary)" }}
          >
            Zota Corp
          </h1>
          <p className="text-muted-foreground text-sm">Employee Dashboard</p>
        </div>
        {children}
      </div>
    </div>
  );
}
