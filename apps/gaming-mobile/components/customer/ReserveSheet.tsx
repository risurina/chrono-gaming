import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { PremiumCard } from '../ui/PremiumCard';
import { GoldButton } from '../ui/GoldButton';
import { Colors } from '../../constants/theme';
import { PublicStation, stationLabel } from '../../constants/schemas/station';
import { RESERVATION_DURATION_OPTIONS } from '../../constants/schemas/reservation';

interface ReserveSheetProps {
  visible: boolean;
  station: PublicStation | null;
  submitting?: boolean;
  onConfirm: (durationMinutes: number) => void;
  onClose: () => void;
}

export const ReserveSheet: React.FC<ReserveSheetProps> = ({
  visible,
  station,
  submitting,
  onConfirm,
  onClose,
}) => {
  const themeColors = Colors.dark;
  const [duration, setDuration] = useState<number>(RESERVATION_DURATION_OPTIONS[1]);

  if (!station) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <PremiumCard variant="gold-border" style={styles.sheet}>
          <Text style={[styles.title, { color: themeColors.text }]}>
            Reserve Station {stationLabel(station)}
          </Text>
          <Text style={[styles.subtitle, { color: themeColors.mutedText }]}>
            Choose how long you want to book this station.
          </Text>

          <View style={styles.options}>
            {RESERVATION_DURATION_OPTIONS.map((mins) => {
              const active = duration === mins;
              return (
                <TouchableOpacity
                  key={mins}
                  onPress={() => setDuration(mins)}
                  style={[
                    styles.option,
                    {
                      borderColor: active ? themeColors.primary : themeColors.border,
                      backgroundColor: active ? 'rgba(214, 168, 79, 0.12)' : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: active ? themeColors.primary : themeColors.text },
                    ]}
                  >
                    {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.actions}>
            <GoldButton title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
            <GoldButton
              title="Confirm"
              onPress={() => onConfirm(duration)}
              isLoading={submitting}
              disabled={submitting}
              style={{ flex: 1 }}
            />
          </View>
        </PremiumCard>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    gap: 16,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
  },
  options: {
    flexDirection: 'row',
    gap: 12,
  },
  option: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
});
