/**
 * Setting up a profile, straight after the account exists.
 *
 * The signup trigger gives every new account the name "New member" and an age
 * of 18. Letting someone into the deck in that state puts a profile in front
 * of real people that says nothing true about them, so this comes first.
 */

import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileForm } from '@/components/profile-form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileSetupScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ProfileForm
          submitLabel="Start swiping"
          onSaved={() => router.replace('/(tabs)')}
          header={
            <View style={styles.intro}>
              <ThemedText type="title" accessibilityRole="header">
                Tell people who you are
              </ThemedText>
              <ThemedText style={{ color: theme.textSecondary }}>
                This is what someone sees before they decide to swipe. You can change all of it
                later.
              </ThemedText>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  intro: { gap: Spacing.one },
});
