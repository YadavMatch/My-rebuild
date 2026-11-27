/**
 * Changing a profile after it exists.
 *
 * Shares its form with setup, so a field you can set once is a field you can
 * correct. Previously this screen rendered the profile read-only and admitted
 * in small print that edits were not saved.
 *
 * The identity check lives here too, below the form. It is deliberately not
 * part of `ProfileForm`: setup should not block on a one-time check that runs
 * in another app and reports back by webhook, and nothing on this screen can
 * award the badge anyway.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ProfileForm } from '@/components/profile-form';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVerification } from '@/hooks/use-verification';
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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}>
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
      <VerificationSection />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</ThemedText>
      {children}
    </View>
  );
}

/**
 * The only way into the identity check.
 *
 * Reads `profiles.verified` from the server rather than any local copy: the
 * badge is awarded by the webhook, and the service role is the only thing
 * that may set it, so the server's answer is the only one worth showing.
 */
function VerificationSection() {
  const theme = useTheme();
  const { state, message, busy, start } = useVerification();

  if (state === 'verified') {
    return (
      <Section title="VERIFICATION">
        <View style={[styles.verifyCard, { backgroundColor: theme.verifiedPale }]}>
          <ThemedText style={[styles.verifyText, { color: theme.verified }]}>
            Your ID check passed. Neither your ID nor your photo was kept.
          </ThemedText>
        </View>
      </Section>
    );
  }

  return (
    <Section title="VERIFICATION">
      <View style={[styles.verifyCard, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText style={[styles.verifyText, { color: theme.textSecondary }]}>
          {state === 'unavailable'
            ? 'Verification needs the backend configured and you signed in.'
            : state === 'pending'
              ? 'Finish the check in your browser, then come back — the badge appears here once the result arrives.'
              : 'A one-time ID check adds a Verified badge: photograph a government ID, then take a selfie so the two can be matched. It opens in your browser, and both images are deleted once the check finishes — neither ever reaches our database.'}
        </ThemedText>
      </View>

      {state === 'unavailable' ? null : (
        <PressableScale
          onPress={() => {
            start().catch(() => {});
          }}
          disabled={busy || state === 'pending'}
          accessibilityRole="button"
          accessibilityLabel="Open the ID check in your browser"
          accessibilityState={{ disabled: busy || state === 'pending' }}
          style={[
            styles.button,
            { backgroundColor: busy || state === 'pending' ? theme.border : theme.accent },
          ]}>
          <ThemedText type="smallBold" style={[styles.buttonLabel, { color: theme.onAccent }]}>
            {busy
              ? 'Opening…'
              : state === 'pending'
                ? 'Waiting for the result'
                : 'Open ID check in browser'}
          </ThemedText>
        </PressableScale>
      )}

      {message ? (
        <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>{message}</ThemedText>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Spacing.six, gap: Spacing.four },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  saved: { textAlign: 'center', paddingVertical: Spacing.two },
  section: { gap: Spacing.two, paddingHorizontal: Spacing.four },
  sectionTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  hint: {
    fontFamily: Fonts.rounded,
    fontSize: 14,
    fontWeight: '600',
  },
  verifyCard: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  verifyText: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  button: {
    minHeight: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontFamily: Fonts.rounded, fontSize: 16 },
});
