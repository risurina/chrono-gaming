import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { FormInput } from '../../components/ui/FormInput';
import { GoldButton } from '../../components/ui/GoldButton';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { logger } from '../../lib/logger';

export default function AccountScreen() {
  const themeColors = Colors.dark;
  const api = useApi();

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [initialName, setInitialName] = useState('');
  const [initialPhone, setInitialPhone] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [me, profile] = await Promise.all([
          api.customerAuth.me(),
          api.members.me().catch(() => null),
        ]);
        if (!mounted) return;
        setName(me.name);
        setInitialName(me.name);
        const p = profile?.phone ?? '';
        setPhone(p);
        setInitialPhone(p);
      } catch (e) {
        logger.error('Failed to load account:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [api]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      if (name.trim() && name.trim() !== initialName) {
        await api.customerAuth.updateName({ name: name.trim() });
        setInitialName(name.trim());
      }
      if (phone.trim() !== initialPhone) {
        await api.members.updatePhone({ phone: phone.trim() });
        setInitialPhone(phone.trim());
      }
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Error', 'Enter your current and new password.');
      return;
    }
    setSavingPassword(true);
    try {
      await api.customerAuth.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Done', 'Your password has been changed.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not change your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Account" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  return (
    <MobileScreen>
      <ScreenHeader title="Account" showBack />
      <View style={styles.container}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>PROFILE</Text>
          <FormInput label="Name" value={name} onChangeText={setName} placeholder="Your name" />
          <FormInput
            label="Mobile Number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+63 917 123 4567"
          />
          <GoldButton
            title={savingProfile ? 'Saving...' : 'Save Changes'}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>SECURITY</Text>
          <FormInput
            label="Current Password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholder="••••••••"
          />
          <FormInput
            label="New Password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="••••••••"
          />
          <GoldButton
            title={savingPassword ? 'Updating...' : 'Update Password'}
            onPress={handleChangePassword}
            variant="outline"
            disabled={savingPassword}
          />
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 32,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
