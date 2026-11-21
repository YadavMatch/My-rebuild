import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenLoading, EmptyState } from '@/components/screen-state';
import { SwipeDeck } from '@/components/swipe-deck';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useDecisions } from '@/store/decisions';
import { fetchDeck } from '@/services';
import type { Decision, Profile } from '@/types';

export default function DiscoverScreen() {
  const router = useRouter();
  const { excludedIds, state, like, pass } = useDecisions();
  const [deck, setDeck] = useState<Profile[] | undefined>(undefined);

  // Load once storage has been read, so the deck is not built from an empty
  // exclusion list and then immediately rebuilt.
  useEffect(() => {
    if (!state.hydrated) {
      return;
    }
    let cancelled = false;

    fetchDeck(excludedIds)
      .then((profiles) => {
        if (!cancelled) {
          setDeck(profiles);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDeck([]);
        }
      });

    return () => {
      cancelled = true;
    };
    // Intentionally keyed on hydration only: re-running on every change to
    // `excludedIds` would refetch and reshuffle the deck after each swipe.
    // Cards are removed locally in `handleDecision` instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated]);

  const handleDecision = useCallback(
    (profile: Profile, decision: Decision) => {
      // Drop the card first so the deck advances with the animation rather
      // than waiting on the network round trip.
      setDeck((current) => current?.filter((p) => p.id !== profile.id));

      if (decision === 'pass') {
        pass(profile.id).catch(() => {});
        return;
      }

      like(profile.id)
        .then((conversationId) => {
          if (!conversationId) {
            return;
          }
          Alert.alert(
            `You matched with ${profile.name}`,
            'They liked you too. Say something.',
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Send a message',
                onPress: () => router.push(`/chat/${conversationId}`),
              },
            ],
          );
        })
        .catch(() => {});
    },
    [like, pass, router],
  );

  const handleOpenProfile = useCallback(
    (profileId: string) => {
      router.push(`/profile/${profileId}`);
    },
    [router],
  );

  if (!deck) {
    return <ScreenLoading label="Finding people near you" />;
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.heading}>
          DISCOVER
        </ThemedText>

        {deck.length === 0 ? (
          <EmptyState
            title="That is everyone for now"
            body="You have seen every profile nearby. New people appear as they join — check back later."
          />
        ) : (
          <SwipeDeck
            profiles={deck}
            onDecision={handleDecision}
            onOpenProfile={handleOpenProfile}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  heading: {
    letterSpacing: 1.5,
  },
});
