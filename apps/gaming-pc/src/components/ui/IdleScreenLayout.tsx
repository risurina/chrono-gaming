import React, { useEffect, useState } from 'react';
import { Flame, Gamepad2, MapPin, Megaphone, MonitorCheck } from 'lucide-react';
import { Box, Flex, Text, cn, ui } from '@/ui-kit';
import { formatStationLabel, formatStationStatus, LoginSlide, loginSlides, tenantLoginDefaults } from '../login/login-defaults';
import { SessionViewModel } from '../../types/pc-client';
import { FooterStatusBar } from '../FooterStatusBar';
import { useUiConfig } from '../../contexts/UiConfigContext';

function SlideIcon({ slide, className }: { slide: LoginSlide; className?: string }) {
    const iconClassName = cn('h-4 w-4 text-primary', className);

    if (slide.icon === 'monitor') return <MonitorCheck className={iconClassName} />;
    if (slide.icon === 'event') return <Gamepad2 className={iconClassName} />;
    if (slide.icon === 'promo') return <Flame className={iconClassName} />;
    if (slide.icon === 'social') return <Megaphone className={iconClassName} />;
    return null;
}

export function IdleScreenLayout({ session, children }: { session: SessionViewModel, children: React.ReactNode }) {
    const uiConfig = useUiConfig();
    const [activeSlideIndex, setActiveSlideIndex] = useState(0);
    const slides = session.tenantHeroSlide ? [session.tenantHeroSlide as LoginSlide, ...loginSlides] : loginSlides;
    const activeSlide = (slides[activeSlideIndex] ?? slides[0]) as LoginSlide;
    const isSocialSlide = activeSlide.icon === 'social';

    const groupLabel = session.deviceGroup?.name?.trim() || formatStationLabel(session.stationId);
    const groupCode = session.deviceGroup?.code?.trim();
    const stationName = session.stationName?.trim() || (session.stationId && session.stationId !== session.deviceName
        ? session.stationId
        : session.deviceName);
    const pcNumber = stationName?.match(/\d+/)?.[0] || session.stationId.match(/\d+/)?.[0];
    const stationDisplayLabel = groupCode && pcNumber
        ? `${groupCode} #${pcNumber}`
        : stationName || groupCode || formatStationLabel(session.stationId);
    const stationStatus = formatStationStatus(session.status);

    const tenantName = uiConfig?.publicName || tenantLoginDefaults.tenantName;
    const branchLocation = session.branchName || tenantLoginDefaults.branchLocation;

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveSlideIndex((current) => (current + 1) % slides.length);
        }, 15000);

        return () => clearInterval(interval);
    }, [slides.length]);

    return (
        <div className="dark flex min-h-screen w-full overflow-hidden bg-background text-foreground antialiased">
            <section className={cn('relative hidden min-h-screen flex-1 overflow-hidden bg-background px-10 py-8 lg:flex', ui.premiumDots)}>
                {activeSlide.backgroundImage ? (
                    <div
                        className="pointer-events-none absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url('${activeSlide.backgroundImage}')` }}
                    />
                ) : null}
                <div
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.86)_0%,rgba(0,0,0,0.58)_44%,rgba(0,0,0,0.24)_100%),radial-gradient(circle_at_20%_20%,rgba(var(--primary-rgb),0.2),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(var(--primary-rgb),0.1),transparent_38%)]"
                />

                <Flex direction="col" justify="between" className="relative z-10 w-full">
                    <Box className="flex justify-between">
                        <Box>
                            <Text className="font-chrono text-5xl font-black uppercase leading-none tracking-tight text-primary">
                                {tenantLoginDefaults.platformName}
                            </Text>
                            <Text className="mt-2 text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">
                                {tenantLoginDefaults.platformTagline}
                            </Text>
                        </Box>
                        <Box className="px-6 py-3 rounded-sm text-right flex flex-col items-center border border-primary/25 bg-primary/10">
                            <Text className="text-4xl font-black uppercase text-foreground">
                                {stationDisplayLabel}
                            </Text>
                            <Text
                                className="text-[10px] font-bold uppercase tracking-[4px] text-muted-foreground"
                            >
                                {groupLabel}
                            </Text>
                            <Box className="flex max-w-[150px] justify-center items-center rounded-full border border-primary/25 bg-primary/10 gap-1.5 px-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.8)]" />
                                <div className="text-[8px] font-black uppercase tracking-widest text-primary">
                                    {stationStatus}
                                </div>
                            </Box>
                        </Box>
                    </Box>

                    <Box className="max-w-4xl space-y-7">
                        <Box key={activeSlide.title} className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-700">
                            <Box className="h-px w-48 bg-primary/40" />

                            <Flex align="center" gap="3">
                                {activeSlide.icon !== 'platform' ? (
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-sm font-black text-primary">
                                        <SlideIcon slide={activeSlide} className="h-5 w-5" />
                                    </div>
                                ) : null}
                                <Text className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
                                    {activeSlide.eyebrow}
                                </Text>
                            </Flex>
                            <Text className={cn('font-black leading-tight tracking-normal text-foreground', isSocialSlide ? 'text-4xl' : 'text-5xl')}>
                                {activeSlide.title}
                            </Text>
                            <Text className="  text-lg font-medium leading-6 text-muted-foreground">
                                {activeSlide.description}
                            </Text>
                            <Text className="text-[10px] font-black uppercase tracking-[0.22em] text-primary/80">
                                {activeSlide.detail}
                            </Text>
                        </Box>

                        <Flex align="center" gap="3">
                            <Text className=" text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">
                                {String(activeSlideIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
                            </Text>
                            <Text className=" text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">
                                |
                            </Text>
                            <Flex align="center" gap="2">
                                {slides.map((slide, index) => (
                                    <button
                                        key={slide.title}
                                        type="button"
                                        aria-label={`Show ${slide.eyebrow}`}
                                        onClick={() => setActiveSlideIndex(index)}
                                        className={cn(
                                            'h-1.5 rounded-full transition-all duration-300',
                                            activeSlideIndex === index ? 'w-6 bg-primary' : 'w-2 bg-primary/30 hover:bg-primary/60',
                                        )}
                                    />
                                ))}
                            </Flex>
                        </Flex>
                    </Box>

                    <Box className="h-10" />
                </Flex>

                <FooterStatusBar className="absolute bottom-0 left-0 right-0 bg-transparent border-none opacity-40" />
            </section>

            <section className="relative flex h-screen w-full max-w-[480px] min-w-[480px] flex-col overflow-hidden bg-background/95 px-8 py-8 shadow-2xl backdrop-blur-xl">
                <Flex justify="between" align="start" className="fixed shrink-0">
                    <Flex align="center" gap="3">
                        {uiConfig?.logoUrl ? (
                            <img
                                src={uiConfig.logoUrl}
                                alt={tenantName}
                                className="h-8 w-8 object-contain"
                            />
                        ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 border border-primary/25 text-xs font-black text-primary">
                                {tenantName.slice(0, 2).toUpperCase()}
                            </div>
                        )}
                        <Box className="space-y-0.5">
                            <Text className="text-sm font-black uppercase leading-tight tracking-[0.12em] text-foreground">
                                {tenantName}
                            </Text>
                            <Text className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                <MapPin className="h-3 w-3 -mt-0.5 text-primary" /> {branchLocation}
                            </Text>
                        </Box>
                    </Flex>
                </Flex>
                {children}
            </section>
        </div>
    );
}

