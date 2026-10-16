import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';

/**
 * Premium Dotted Background component for React Native.
 * Matches the refined IZUR Chrono aesthetic with multi-layered dots.
 */
export function DottedBackground() {
  const { width, height } = useWindowDimensions();

  const dots = useMemo(() => {
    const layers = [
      { gap: 24, size: 1.5, opacity: 0.15, offset: { x: 0, y: 0 } },
      { gap: 48, size: 2, opacity: 0.08, offset: { x: 12, y: 12 } },
      { gap: 72, size: 2.5, opacity: 0.04, offset: { x: 24, y: 36 } },
    ];

    const allDots: React.ReactNode[] = [];

    layers.forEach((layer, layerIdx) => {
      const columns = Math.ceil(width / layer.gap) + 1;
      const rows = Math.ceil(height / layer.gap) + 1;

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < columns; j++) {
          allDots.push(
            <View
              key={`l${layerIdx}-${i}-${j}`}
              style={[
                styles.dot,
                {
                  width: layer.size,
                  height: layer.size,
                  borderRadius: layer.size / 2,
                  opacity: layer.opacity,
                  left: j * layer.gap + layer.offset.x,
                  top: i * layer.gap + layer.offset.y,
                }
              ]}
            />
          );
        }
      }
    });

    return allDots;
  }, [width, height]);

  return (
    <View style={styles.container} pointerEvents="none">
      {dots}
      {/* Subtle radial gold glows to simulate the landing page atmosphere */}
      <View style={[styles.glow, { top: -100, right: -100, width: 400, height: 400, opacity: 0.06 }]} />
      <View style={[styles.glow, { bottom: '20%', left: -150, width: 350, height: 350, opacity: 0.03 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  dot: {
    position: 'absolute',
    backgroundColor: '#F4C95D',
  },
  glow: {
    position: 'absolute',
    borderRadius: 200,
    backgroundColor: '#F4C95D',
  }
});
