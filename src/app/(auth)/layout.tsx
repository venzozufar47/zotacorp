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
          <img
            src="/zota-corp-full-logo-tosca.png"
            alt="Zota Corp"
            className="h-10 mx-auto mb-1"
          />
          <p className="text-muted-foreground text-sm">Employee Dashboard</p>
        </div>
        {children}
      </div>
    </div>
  );
}
