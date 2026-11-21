import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { InterestChip, VerifiedBadge } from '@/components/badges';
import { ProfilePhoto } from '@/components/profile-photo';
import { PromptCard } from '@/components/prompt-card';
import { ScreenLoading } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
