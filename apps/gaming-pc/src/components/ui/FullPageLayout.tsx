import { cn, ui } from '@/ui-kit';
import { StationStatus } from '../../types/pc-client';

interface FullPageLayoutProps {
  children: React.ReactNode;
  className?: string;
  stationId?: string;
  status?: StationStatus;
  showSidebar?: boolean;
  specs?: {
    cpu?: string;
    gpu?: string;
    ram?: string;
  } | null;
}

export const FullPageLayout: React.FC<FullPageLayoutProps> = ({
  children,
  className,
  stationId,
  status,
  showSidebar = false,
  specs
}) => {
  return (
    <div className={cn("dark min-h-screen w-full flex flex-col md:flex-row bg-background text-foreground overflow-hidden antialiased", ui.premiumDots)}>

      {/* Left Panel: Brand & Atmosphere */}
      <section className="relative w-full flex flex-col items-center justify-center">
        {/* Background Atmosphere */}
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(8,8,6,0.8)_100%)]" />

        <div className="relative z-10 text-center p-8">
          <h1 className="text-6xl font-chrono text-primary tracking-tighter leading-none mb-2 uppercase">CHRONO</h1>
          <p className="text-sm text-muted-foreground uppercase tracking-[0.3em] font-bold">Gaming Lounge Platform</p>
        </div>

        <div className="max-w-md">
            <p className="text-base text-muted-foreground">
                Premium gaming lounge access, station control, and session security. Precision, elegance, and unrivaled control in one seamless interface.
            </p>
        </div>

        {/* Station Specs */}
        {specs && (
          <div className="relative z-10 mt-12 grid grid-cols-1 gap-4 w-full max-w-sm px-8">
            <div className="flex flex-col gap-1 border-l-2 border-primary/20 pl-4 py-1">
              <span className="text-[10px] uppercase tracking-widest text-primary font-bold">Processor</span>
              <span className="text-sm text-foreground/90 font-medium truncate">{specs.cpu || 'High-End CPU'}</span>
            </div>
            <div className="flex flex-col gap-1 border-l-2 border-primary/20 pl-4 py-1">
              <span className="text-[10px] uppercase tracking-widest text-primary font-bold">Graphics Card</span>
              <span className="text-sm text-foreground/90 font-medium truncate">{specs.gpu || 'Discrete GPU'}</span>
            </div>
            <div className="flex flex-col gap-1 border-l-2 border-primary/20 pl-4 py-1">
              <span className="text-[10px] uppercase tracking-widest text-primary font-bold">Memory</span>
              <span className="text-sm text-foreground/90 font-medium truncate">{specs.ram || 'Gaming RAM'}</span>
            </div>
          </div>
        )}
      </section>

      {/* Right Panel: Content Slot */}
      <section className={cn("flex w-full max-w-[450px] bg-transparent", className)}>
        {children}
      </section>
    </div>
  );
};
