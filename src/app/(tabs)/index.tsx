import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Pill } from '@/components/badges';
import { LocationPrompt } from '@/components/location-prompt';
import { ScreenLoading, EmptyState } from '@/components/screen-state';
import { Segmented } from '@/components/segmented';
import { SwipeDeck } from '@/components/swipe-deck';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createConversation, fetchDeck } from '@/services';
import { useDecisions } from '@/store/decisions';
import { type Decision, type Profile } from '@/types';

const SEGMENTS = ['Discover', 'Top Picks'] as const;
type Segment = (typeof SEGMENTS)[number];

export default function DiscoverScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { excludedIds, state, like, pass, canLike, likesRemaining } = useDecisions();
  const [segment, setSegment] = useState<Segment>('Discover');
  const [deck, setDeck] = useState<Profile[] | undefined>(undefined);
  // Bumped to refetch deliberately — after a location is set, the feed can
  // finally order by distance and every card gains a real label.
  const [reloadKey, setReloadKey] = useState(0);

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
    // Keyed on hydration and an explicit reload: re-running on every change
    // to `excludedIds` would refetch and reshuffle the deck after each swipe.
    // Cards are removed locally in `handleDecision` instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated, reloadKey]);

  const handleDecision = useCallback(
    (profile: Profile, decision: Decision) => {
      // Passes are never capped — the limit exists to slow down likes, and
      // blocking passes would trap people on a card they do not want.
      if (decision !== 'pass' && !canLike) {
        router.push('/paywall');
        return;
      }

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
          // A real screen rather than a system alert: this is the best
          // moment in the app, and `Alert` is also a no-op on web.
          router.push({
            pathname: '/match/[id]',
            params: { id: profile.id, conversationId },
          });
        })
        .catch((e: unknown) => {
          // The daily cap is enforced by a database trigger, so the server
          // can refuse a like the client thought was allowed. Swallowing it
          // made the card vanish and the like disappear with it.
          setDeck((current) => (current ? [profile, ...current] : [profile]));
          if (e instanceof Error && e.message === 'daily_like_limit_reached') {
            router.push('/paywall');
          }
        });
    },
    [like, pass, router, canLike],
  );

  const handleMessage = useCallback(
    (profile: Profile) => {
      // Opens a thread without deciding — the card stays in the deck.
      createConversation(profile.id)
        .then((conversation) => {
          if (conversation) {
            router.push(`/chat/${conversation.id}`);
          }
        })
        .catch(() => {});
    },
    [router],
  );

  const handleOpenProfile = useCallback(
    (profileId: string) => {
      router.push(`/profile/${profileId}`);
    },
    [router],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppHeader />
        <Segmented options={SEGMENTS} value={segment} onChange={setSegment} />

        {segment === 'Discover' && likesRemaining !== null ? (
          <ThemedText style={[styles.quota, { color: theme.textSecondary }]}>
            {likesRemaining === 0
              ? 'No likes left today — they come back tomorrow'
              : `${likesRemaining} ${likesRemaining === 1 ? 'like' : 'likes'} left today`}
          </ThemedText>
        ) : null}

        {segment === 'Discover' ? (
          <LocationPrompt
            onCaptured={() => {
              setDeck(undefined);
              setReloadKey((n) => n + 1);
            }}
          />
        ) : null}

        {segment === 'Discover' ? (
          !deck ? (
            <ScreenLoading label="Finding people near you" />
          ) : deck.length === 0 ? (
            <EmptyState
              emoji="🌿"
              title="That is everyone for now"
              body="You have seen every profile nearby. New people appear as they join."
            />
          ) : (
            <SwipeDeck
              profiles={deck}
              onDecision={handleDecision}
              onOpenProfile={handleOpenProfile}
              onMessage={handleMessage}
            />
          )
        ) : (
          <TopPicks />
        )}
      </SafeAreaView>
    </View>
  );
}

/**
 * Curated picks.
 *
 * Deliberately empty: there is no ranking model behind this yet, and showing
 * the same deck under a different title would be a lie about what the app
 * does. The empty state says when it will look again.
 */
function TopPicks() {
  const theme = useTheme();

  return (
    <View style={styles.picks}>
      <View style={styles.picksHeader}>
        <View style={styles.picksHeading}>
          <ThemedText style={styles.picksTitle}>Today&apos;s picks</ThemedText>
          <ThemedText style={[styles.picksSubtitle, { color: theme.textSecondary }]}>
            Five profiles chosen for you
          </ThemedText>
        </View>
        <Pill label="Refreshes in 4h 36m" variant="tinted" colour={theme.verified} />
      </View>

      <EmptyState
        emoji="🌿"
        title="No new picks today"
        body="We'll look again when more profiles fit your preferences."
      />
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
    paddingBottom: Spacing.two,
    gap: Spacing.three,
  },
  picks: {
    flex: 1,
    gap: Spacing.three,
  },
  picksHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  picksHeading: {
    flexShrink: 1,
  },
  quota: {
    fontFamily: Fonts.rounded,
    fontSize: 14,
    fontWeight: '600',
    marginTop: -Spacing.two,
  },
  picksTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  picksSubtitle: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: '600',
  },
});
