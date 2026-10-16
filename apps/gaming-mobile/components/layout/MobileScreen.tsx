import React from 'react';
import { View, StyleSheet, ScrollView, ViewStyle, StatusBar, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';
import { DottedBackground } from '../ui/DottedBackground';

interface MobileScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  scrollable?: boolean;
  withSafeArea?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export const MobileScreen: React.FC<MobileScreenProps> = ({
  children,
  style,
  scrollable = true,
  withSafeArea = true,
  onRefresh,
  refreshing = false,
}) => {
  const themeColors = Colors.dark;
  const Wrapper = withSafeArea ? SafeAreaView : View;
  const ContentWrapper = scrollable ? ScrollView : View;

  return (
    <Wrapper style={[styles.container, { backgroundColor: themeColors.background }, style]}>
      <StatusBar barStyle="light-content" />
      <DottedBackground />
      <ContentWrapper
        style={styles.content}
        contentContainerStyle={scrollable ? styles.scrollContent : undefined}
        showsVerticalScrollIndicator={false}
        refreshControl={
          scrollable && onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={themeColors.primary}
              colors={[themeColors.primary]}
            />
          ) : undefined
        }
      >
        {children}
      </ContentWrapper>
    </Wrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
});
