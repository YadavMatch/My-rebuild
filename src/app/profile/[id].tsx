import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { InterestChip } from '@/components/interest-chip';
import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { PromptCard } from '@/components/prompt-card';
import { ScreenLoading, EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchProfile } from '@/services';
import { useDecisions } from '@/store/decisions';
import type { Profile } from '@/types';

export default function ProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { block, isBlocked } = useDecisions();
  const [profile, setProfile] = useState<Profile | undefined | null>(undefined);

  useEffect(() => {
    let cancelled = false;

    fetchProfile(id)
      .then((result) => {
        if (!cancelled) {
          // `null` means "looked and did not find", distinct from `undefined`
          // meaning "still looking".
          setProfile(result ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (profile === undefined) {
    return <ScreenLoading label="Loading profile" />;
  }

  if (profile === null) {
    return <EmptyState title="Profile unavailable" body="This person is no longer on the app." />;
  }

  const blocked = isBlocked(profile.id);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ProfilePhoto
        id={profile.id}
        name={profile.name}
        style={styles.hero}
        initialSize={140}
      />

      <View style={styles.header}>
        <ThemedText type="subtitle" accessibilityRole="header">
          {profile.name}, {profile.age}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {profile.jobTitle} · {profile.location} · {profile.distanceKm} km away
        </ThemedText>
      </View>

      <ThemedText>{profile.bio}</ThemedText>

      <View style={styles.chips}>
        {profile.interests.map((interest) => (
          <InterestChip key={interest} label={interest} />
        ))}
      </View>

      {profile.prompts.map((prompt) => (
        <PromptCard key={prompt.id} prompt={prompt} />
      ))}

      {/*
        Safety controls sit on the profile itself, where someone looking at a
        person they are uneasy about will actually look for them. Apple's
        guideline 1.2 requires both for a dating app.
      */}
      <View style={styles.safety}>
        <PressableScale
          onPress={() => router.push(`/report/${profile.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Report ${profile.name}`}
          style={[styles.safetyButton, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Report this profile
          </ThemedText>
        </PressableScale>

        <PressableScale
          onPress={() => {
            block(profile.id).catch(() => {});
            router.back();
          }}
          disabled={blocked}
          accessibilityRole="button"
          accessibilityLabel={blocked ? `${profile.name} is blocked` : `Block ${profile.name}`}
          style={[styles.safetyButton, { borderColor: theme.border }]}>
          <ThemedText type="small" style={{ color: blocked ? theme.textSecondary : theme.pass }}>
            {blocked ? 'Blocked' : 'Block'}
          </ThemedText>
        </PressableScale>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  hero: {
    height: 320,
    borderRadius: Radius.card,
  },
  header: {
    gap: Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  safety: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  safetyButton: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
