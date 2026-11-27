import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingsRow, SettingsSection } from '@/components/settings-row';
import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { captureLocation } from '@/lib/location';
import { registerForPush } from '@/lib/push';
import { useAuth } from '@/store/auth';
import { useDecisions } from '@/store/decisions';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, reset, showWelcomeAgain, setPremium } = useDecisions();
  const { user, enabled: authEnabled, signOut } = useAuth();

  function confirmWithdrawConsent() {
    Alert.alert(
      'Withdraw consent?',
      `This stops ${APP_NAME} processing your data for matching. Your profile is hidden and you will not appear in anyone's Discover.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Not wired up yet',
              'Withdrawing consent has to be recorded server-side to mean anything. Nothing was changed.',
            );
          },
        },
      ],
    );
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'This permanently removes your profile, matches and messages. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // All this can honestly do today is clear local state. The real
            // deletion is a server-side erasure, which the README calls out
            // as required before submission.
            reset()
              .then(() => showWelcomeAgain())
              .then(() => router.replace('/welcome'))
              .catch(() => {});
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText style={styles.title} accessibilityRole="header">
            Settings
          </ThemedText>

          {authEnabled ? (
            <SettingsSection title="ACCOUNT">
              {user ? (
                <SettingsRow
                  emoji="🚪"
                  label={`Sign out of ${user.email ?? 'this account'}`}
                  onPress={() => {
                    signOut().catch(() => {});
                  }}
                  last
                />
              ) : (
                <SettingsRow
                  emoji="🔑"
                  label="Sign in or create an account"
                  onPress={() => router.push('/sign-in')}
                  last
                />
              )}
            </SettingsSection>
          ) : null}

          {user ? (
            <SettingsSection title="NOTIFICATIONS">
              <SettingsRow
                emoji="🔔"
                label="Turn on message notifications"
                onPress={() => {
                  registerForPush()
                    .then((r) => {
                      Alert.alert(
                        r.ok ? 'Notifications on' : 'Not turned on',
                        r.ok
                          ? 'You will hear about new messages on this device.'
                          : r.message,
                      );
                    })
                    .catch(() => {});
                }}
                last
              />
            </SettingsSection>
          ) : null}

          {user ? (
            <SettingsSection title="LOCATION">
              <SettingsRow
                emoji="📍"
                label="Update my location"
                onPress={() => {
                  captureLocation()
                    .then((r) => {
                      Alert.alert(
                        r.ok ? 'Location updated' : 'Location not updated',
                        r.ok
                          ? 'Distances on profile cards will use your new location.'
                          : r.message,
                      );
                    })
                    .catch(() => {});
                }}
                last
              />
            </SettingsSection>
          ) : null}

          <SettingsSection title="MEMBERSHIP">
            <SettingsRow
              emoji="👑"
              label={`${APP_NAME} Premium`}
              onPress={() => router.push('/(tabs)/premium')}
            />
            <SettingsRow
              emoji="✏️"
              label="Edit profile"
              onPress={() => router.push('/edit-profile')}
              last
            />
          </SettingsSection>

          <SettingsSection title="PRIVACY & LEGAL">
            <SettingsRow
              emoji="🔒"
              label="Privacy Policy"
              onPress={() => router.push('/legal/privacy')}
            />
            <SettingsRow
              emoji="📋"
              label="Terms & Conditions"
              onPress={() => router.push('/legal/terms')}
            />
            <SettingsRow
              emoji="✉️"
              label="Data request / support"
              onPress={() => router.push('/legal/data-request')}
            />
            <SettingsRow
              emoji="↩️"
              label="Withdraw consent"
              onPress={confirmWithdrawConsent}
              destructive
              last
            />
          </SettingsSection>

          <SettingsSection title="DANGER ZONE">
            <SettingsRow
              emoji="🗑️"
              label="Delete account"
              onPress={confirmDeleteAccount}
              destructive
            />
            {/*
              Only offered on sample data. With a real account the swipes and
              matches live on the server, so this would clear local state and
              appear to do nothing — a button that lies is worse than one that
              is not there.
            */}
            {user ? null : (
            <SettingsRow
              emoji="🔄"
              label="Reset swipes and matches"
              onPress={() => {
                Alert.alert(
                  'Reset everything?',
                  'Everyone you liked, passed and blocked comes back, and your matches are cleared. Useful while developing.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: () => {
                        reset().catch(() => {});
                      },
                    },
                  ],
                );
              }}
            />
            )}
            {/*
              Only on sample data. With an account, Premium comes from the
              entitlements table, which the client cannot write — a toggle
              that appears to grant it would promise unlimited likes the
              database then refuses.
            */}
            {user ? null : (
            <SettingsRow
              emoji="🧪"
              label={
                state.premium
                  ? 'Simulate Premium: on — tap to turn off'
                  : 'Simulate Premium: off — tap to turn on'
              }
              onPress={() => {
                // There is no billing, so this is the only way to exercise
                // the unlimited-likes path. Labelled as a simulation rather
                // than dressed up as a real subscription.
                setPremium(!state.premium).catch(() => {});
              }}
            />
            )}
            <SettingsRow
              emoji="👋"
              label="View welcome screen"
              onPress={() => {
                showWelcomeAgain()
                  .then(() => router.replace('/welcome'))
                  .catch(() => {});
              }}
              last
            />
          </SettingsSection>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
    paddingTop: Spacing.two,
  },
});
