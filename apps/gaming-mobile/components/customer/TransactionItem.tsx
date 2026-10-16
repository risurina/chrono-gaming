import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { WalletTransaction } from '../../constants/schemas/api';
import { Colors } from '../../constants/theme';
import { formatCurrency, formatDate } from '../../lib/format';
import { MaterialIcons } from '@expo/vector-icons';

interface TransactionItemProps {
  transaction: WalletTransaction;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction }) => {
  const themeColors = Colors.dark;

  const getIcon = () => {
    switch (transaction.type) {
      case 'credit':
        return 'add-circle';
      case 'debit':
        return 'payments';
      case 'adjustment':
        return 'tune';
      default:
        return 'receipt-long';
    }
  };

  const amount = Number(transaction.amount);
  const isCredit = transaction.type === 'credit';
  const sign = isCredit ? '+' : transaction.type === 'debit' ? '-' : '';

  return (
    <View style={[styles.container, { borderBottomColor: themeColors.border }]}>
      <View style={[styles.iconContainer, { backgroundColor: themeColors.surface }]}>
        <MaterialIcons name={getIcon() as any} size={24} color={themeColors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.description, { color: themeColors.text }]}>{transaction.reason}</Text>
        <Text style={[styles.date, { color: themeColors.mutedText }]}>
          {formatDate(transaction.createdAt)}
        </Text>
      </View>
      <Text
        style={[styles.amount, { color: isCredit ? themeColors.success : themeColors.text }]}
      >
        {sign}
        {formatCurrency(amount)}
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
