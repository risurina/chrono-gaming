import React from 'react';

export const BrandMark: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={`flex flex-col ${className}`}>
      <span className="text-[10px] font-chrono font-black uppercase tracking-[0.4em] text-gold/60 leading-none">
        Chrono by
      </span>
      <span className="text-xl font-black tracking-tighter premium-text-gradient leading-none mt-1">
        IZUR
      </span>
    </div>
  );
};
