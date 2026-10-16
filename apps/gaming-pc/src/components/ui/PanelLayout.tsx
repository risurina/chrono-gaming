import { cn, ui } from '@/ui-kit';
import { StationStatus } from '../../types/pc-client';

interface PanelLayoutProps {
  children: React.ReactNode;
  className?: string;
  stationId?: string;
  status?: StationStatus;
  showSidebar?: boolean;
}

export const PanelLayout: React.FC<PanelLayoutProps> = ({
  children,
  className,
  stationId,
  status,
  showSidebar = false
}) => {
  return (
    <div className={cn("dark flex h-full w-full flex-col bg-background text-foreground overflow-hidden antialiased", className)}>
      {children}
    </div>
  );
};
