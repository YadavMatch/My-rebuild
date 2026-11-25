/**
 * Changing a profile after it exists.
 *
 * Shares its form with setup, so a field you can set once is a field you can
 * correct. Previously this screen rendered the profile read-only and admitted
 * in small print that edits were not saved.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProfileForm } from '@/components/profile-form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth';

export default function EditProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);

  // Without an account there is nothing to write to; the sample profiles are
  // not anybody's to edit.
  if (!user) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background }]}>
        <ThemedText type="subtitle">Sign in to edit your profile</ThemedText>
        <ThemedText style={{ color: theme.textSecondary, textAlign: 'center' }}>
          You are browsing sample profiles. Create an account to have one of your own.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {saved ? (
        <ThemedText
          type="smallBold"
          accessibilityLiveRegion="polite"
          style={[styles.saved, { backgroundColor: theme.verifiedPale, color: theme.verified }]}>
          Saved
        </ThemedText>
      ) : null}
      <ProfileForm
        submitLabel="Save changes"
        onSaved={() => {
          setSaved(true);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  saved: { textAlign: 'center', paddingVertical: Spacing.two },
});
