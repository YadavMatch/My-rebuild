import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InterestChip } from '@/components/interest-chip';
import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { PromptCard } from '@/components/prompt-card';
import { ScreenLoading } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCurrentUser } from '@/services';
import { useDecisions } from '@/store/decisions';
import type { CurrentUser } from '@/types';

export default function OwnProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, reset, showWelcomeAgain } = useDecisions();
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
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.identity}>
            <ProfilePhoto id={me.id} name={me.name} style={styles.avatar} initialSize={40} />
            <View style={styles.identityText}>
              <ThemedText type="smallBold" accessibilityRole="header">
                {me.name}, {me.age}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {me.jobTitle} · {me.location}
              </ThemedText>
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
              ABOUT YOU
            </ThemedText>
            <TextInput
              value={bio}
              onChangeText={setBio}
              multiline
              accessibilityLabel="Your bio"
              style={[
                styles.bioInput,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {/*
                Honest about what this does. Wiring it up is a one-line change
                in the service layer once there is somewhere to save to.
              */}
              Edits are not saved yet — this needs a backend to write to.
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
              INTERESTS
            </ThemedText>
            <View style={styles.chips}>
              {me.interests.map((interest) => (
                <InterestChip key={interest} label={interest} />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
              YOUR PROMPTS
            </ThemedText>
            {me.prompts.map((prompt) => (
              <PromptCard key={prompt.id} prompt={prompt} />
            ))}
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
              ACTIVITY
            </ThemedText>
            <View style={[styles.stats, { backgroundColor: theme.backgroundElement }]}>
              <Stat label="Liked" value={state.liked.length} />
              <Stat label="Passed" value={state.passed.length} />
              <Stat label="Blocked" value={state.blocked.length} />
            </View>

            <PressableScale
              onPress={() => {
                showWelcomeAgain().catch(() => {});
                router.replace('/welcome');
              }}
              accessibilityRole="button"
              accessibilityLabel="View the welcome screen again"
              style={[styles.resetButton, { borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                View welcome screen
              </ThemedText>
            </PressableScale>

            <PressableScale
              onPress={() => {
                Alert.alert(
                  'Reset your swipes?',
                  'Everyone you have liked, passed and blocked comes back into the deck. Useful while developing.',
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
              accessibilityRole="button"
              accessibilityLabel="Reset all swipes"
              style={[styles.resetButton, { borderColor: theme.border }]}>
              <ThemedText type="small" style={{ color: theme.pass }}>
                Reset swipes
              </ThemedText>
            </PressableScale>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="smallBold" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
  },
  identityText: {
    gap: 2,
  },
  section: {
    gap: Spacing.two,
  },
  label: {
    letterSpacing: 1.5,
  },
  bioInput: {
    minHeight: 96,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 24,
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
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 24,
    lineHeight: 30,
  },
  resetButton: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
