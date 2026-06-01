import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../../../theme';

export interface ShopChoiceCardProps {
  itemName: string;
  price: number;
  balance: number;
  loading: boolean;
  insufficientGems: boolean;
  onChoose: (choice: 'buy' | 'decline') => void;
}

export function ShopChoiceCard({
  itemName,
  price,
  balance,
  loading,
  insufficientGems,
  onChoose,
}: ShopChoiceCardProps) {
  const canBuy = !loading && !insufficientGems;

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.container}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>🛍️ Cửa hàng trong game</Text>
        </View>

        {/* Item info */}
        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={styles.label}>Vật phẩm:</Text>
            <Text style={styles.value}>{itemName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Giá:</Text>
            <Text style={styles.priceValue}>{price} 💎</Text>
          </View>
        </View>

        {/* Insufficient gems warning */}
        {insufficientGems && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>⚠️ Không đủ gem để mua vật phẩm này.</Text>
          </View>
        )}

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.buyButton, !canBuy && styles.buttonDisabled]}
            onPress={() => onChoose('buy')}
            disabled={!canBuy}
            activeOpacity={0.75}
          >
            <Text style={[styles.buyButtonText, !canBuy && styles.buttonTextDisabled]}>
              💎 Mua
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.declineButton, loading && styles.buttonDisabled]}
            onPress={() => onChoose('decline')}
            disabled={loading}
            activeOpacity={0.75}
          >
            <Text style={[styles.declineButtonText, loading && styles.buttonTextDisabled]}>
              ❌ Không, cảm ơn
            </Text>
          </TouchableOpacity>
        </View>

        {/* Balance footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Số dư của bạn: {balance} 💎</Text>
        </View>

        {/* Loading overlay */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  headerText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  body: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '600',
    minWidth: 70,
  },
  value: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
    flex: 1,
  },
  priceValue: {
    fontSize: 15,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  warningBanner: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    backgroundColor: '#FEF2F2',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  warningText: {
    fontSize: 13,
    color: theme.colors.error,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  buyButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  declineButtonText: {
    color: theme.colors.textMuted,
    fontWeight: '600',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonTextDisabled: {
    opacity: 0.6,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: '#F8FAFC',
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.lg,
  },
});
