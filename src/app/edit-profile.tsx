import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { InterestChip, VerifiedBadge } from '@/components/badges';
import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { PromptCard } from '@/components/prompt-card';
import { ScreenLoading } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVerification } from '@/hooks/use-verification';
import { fetchCurrentUser } from '@/services';
import { useDecisions } from '@/store/decisions';
import type { CurrentUser } from '@/types';

export default function EditProfileScreen() {
  const theme = useTheme();
  const { state } = useDecisions();
  const [me, setMe] = useState<CurrentUser | undefined>(undefined);
  const [bio, setBio] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetchCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setMe(user);
          setBio(user.bio);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!me) {
    return <ScreenLoading label="Loading your profile" />;
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        <ProfilePhoto emoji={me.emoji} name={me.name} size={34} style={styles.avatar} />
        <View style={styles.identityText}>
          <View style={styles.nameRow}>
            <ThemedText style={styles.name} accessibilityRole="header">
              {me.name}, {me.age}
            </ThemedText>
            {me.verified ? <VerifiedBadge size={18} /> : null}
          </View>
          <ThemedText style={[styles.meta, { color: theme.textSecondary }]}>
            {me.jobTitle} · {me.location}
          </ThemedText>
        </View>
      </View>

      <VerificationSection />

      <Section title="ABOUT YOU">
        <TextInput
          value={bio}
          onChangeText={setBio}
          multiline
          accessibilityLabel="Your bio"
          style={[styles.bioInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
        <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>
          {/* Honest about what this does. */}
          Edits are not saved yet — this needs a backend to write to.
        </ThemedText>
      </Section>

      <Section title="INTERESTS">
        <View style={styles.chips}>
          {me.interests.map((interest) => (
            <InterestChip key={interest} label={interest} />
          ))}
        </View>
      </Section>

      <Section title="YOUR PROMPTS">
        {me.prompts.map((prompt) => (
          <PromptCard key={prompt.id} prompt={prompt} />
        ))}
      </Section>

      <Section title="ACTIVITY">
        <View style={[styles.stats, { backgroundColor: theme.backgroundElement }]}>
          <Stat label="Liked" value={state.liked.length} />
          <Stat label="Passed" value={state.passed.length} />
          <Stat label="Blocked" value={state.blocked.length} />
        </View>
      </Section>
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
 * Reads `profiles.verified` from the server rather than the seed profile
 * above: the badge is awarded by the webhook, and the service role is the
 * only thing that may set it, so the server's answer is the only one worth
 * showing.
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
              ? 'Check submitted. The badge appears once the result comes through.'
              : 'A one-time ID check adds a Verified badge: photograph a government ID, then take a selfie so the two can be matched. Both are deleted once the check finishes, and neither ever reaches our database.'}
        </ThemedText>
      </View>

      {state === 'unavailable' ? null : (
        <PressableScale
          onPress={() => {
            start().catch(() => {});
          }}
          disabled={busy || state === 'pending'}
          accessibilityRole="button"
          accessibilityLabel="Start the ID check"
          accessibilityState={{ disabled: busy || state === 'pending' }}
          style={[
            styles.button,
            { backgroundColor: busy || state === 'pending' ? theme.border : theme.accent },
          ]}>
          <ThemedText type="smallBold" style={[styles.buttonLabel, { color: theme.onAccent }]}>
            {busy ? 'Opening…' : state === 'pending' ? 'Waiting for the result' : 'Start ID check'}
          </ThemedText>
        </PressableScale>
      )}

      {message ? (
        <ThemedText style={[styles.hint, { color: theme.textSecondary }]}>{message}</ThemedText>
      ) : null}
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: Radius.pill,
  },
  identityText: { gap: 2, flexShrink: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  name: {
    fontFamily: Fonts.rounded,
    fontSize: 22,
    fontWeight: '700',
  },
  meta: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: '600',
  },
  section: { gap: Spacing.two },
  sectionTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  bioInput: {
    minHeight: 100,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    fontFamily: Fonts.rounded,
    fontSize: 17,
    lineHeight: 24,
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stats: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: {
    fontFamily: Fonts.rounded,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  statLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 14,
    fontWeight: '600',
  },
});
