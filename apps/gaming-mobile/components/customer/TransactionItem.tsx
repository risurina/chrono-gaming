import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TransactionItem as TransactionType } from '../../constants/schemas/wallet';
import { Colors } from '../../constants/theme';
import { formatCurrency, formatDate } from '../../lib/format';
import { MaterialIcons } from '@expo/vector-icons';

interface TransactionItemProps {
  transaction: TransactionType;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction }) => {
  const themeColors = Colors.dark;

  const getIcon = () => {
    switch (transaction.type) {
      case 'top-up': return 'add-circle';
      case 'session': return 'computer';
      case 'extension': return 'more-time';
      case 'promo': return 'redeem';
      default: return 'Payment';
    }
  };

  const isPositive = transaction.amount > 0;

  return (
    <View style={[styles.container, { borderBottomColor: themeColors.border }]}>
      <View style={[styles.iconContainer, { backgroundColor: themeColors.surface }]}>
        <MaterialIcons name={getIcon() as any} size={24} color={themeColors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.description, { color: themeColors.text }]}>{transaction.description}</Text>
        <Text style={[styles.date, { color: themeColors.mutedText }]}>{formatDate(transaction.date)}</Text>
      </View>
      <Text style={[
        styles.amount,
        { color: isPositive ? themeColors.success : themeColors.text }
      ]}>
        {isPositive ? '+' : ''}{formatCurrency(transaction.amount)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  content: {
    flex: 1,
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  date: {
    fontSize: 13,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
});
