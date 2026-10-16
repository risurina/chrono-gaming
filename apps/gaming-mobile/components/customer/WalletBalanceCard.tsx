import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PremiumCard } from '../ui/PremiumCard';
import { GoldButton } from '../ui/GoldButton';
import { Colors } from '../../constants/theme';
import { formatCurrency } from '../../lib/format';
import { MaterialIcons } from '@expo/vector-icons';

interface WalletBalanceCardProps {
  balance: number;
  onTopUp: () => void;
}

export const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({ balance, onTopUp }) => {
  const themeColors = Colors.dark;

  return (
    <PremiumCard variant="gold-border" withGlow style={styles.container}>
      <View>
        <Text style={[styles.label, { color: themeColors.mutedText }]}>WALLET BALANCE</Text>
        <Text style={[styles.balance, { color: themeColors.accent }]}>{formatCurrency(balance)}</Text>
      </View>
      <GoldButton
        title="Top Up"
        onPress={onTopUp}
        style={styles.button}
        icon={<MaterialIcons name="add-circle" size={20} color="#000" />}
      />
    </PremiumCard>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  balance: {
    fontSize: 32,
    fontWeight: '800',
  },
  button: {
    height: 44,
    paddingHorizontal: 16,
  },
});
