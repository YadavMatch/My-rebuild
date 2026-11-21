import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { SwipeCard, type SwipeCardHandle } from '@/components/swipe-card';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Decision, Profile } from '@/types';

/** How many cards are rendered behind the top one. */
const VISIBLE_BEHIND = 2;

type Props = {
  /** Cards still to be decided on, top card first. */
  profiles: Profile[];
  onDecision: (profile: Profile, decision: Decision) => void;
  onOpenProfile: (profileId: string) => void;
};

export function SwipeDeck({ profiles, onDecision, onOpenProfile }: Props) {
  const theme = useTheme();
  const topCard = useRef<SwipeCardHandle>(null);

  const top = profiles[0];

  // The buttons drive the same exit animation and the same callback as a real
  // swipe. Swipe-only would make the app unusable with a screen reader or
  // with limited motor control, so these are not a secondary affordance.
  const handleButton = useCallback((decision: Decision) => {
    topCard.current?.swipe(decision);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.deck}>
        {/* Rendered back-to-front so the top card is last in the stack. */}
        {profiles
          .slice(0, VISIBLE_BEHIND + 1)
          .map((profile, index) => ({ profile, index }))
          .reverse()
          .map(({ profile, index }) =>
            index === 0 ? (
              <View key={profile.id} style={StyleSheet.absoluteFill}>
                <SwipeCard
                  ref={topCard}
                  profile={profile}
                  onDecision={onDecision}
                  onOpenProfile={onOpenProfile}
                  colors={theme as typeof Colors.light}
                />
              </View>
            ) : (
              // Cards behind are inert. Their transform changes when the deck
              // advances, and the CSS transition animates that promotion for
              // free — no gesture, no shared value needed.
              <View
                key={profile.id}
                style={[
                  StyleSheet.absoluteFill,
                  styles.behind,
                  {
                    backgroundColor: theme.backgroundElement,
                    transform: [{ scale: 1 - index * 0.04 }, { translateY: -index * 12 }],
                  },
                ]}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                <ProfilePhoto
                  id={profile.id}
                  name={profile.name}
                  style={StyleSheet.absoluteFill}
                  initialSize={160}
                />
              </View>
            ),
          )}
      </View>

      <View style={styles.actions}>
        <PressableScale
          onPress={() => handleButton('pass')}
          disabled={!top}
          accessibilityRole="button"
          accessibilityLabel={top ? `Pass on ${top.name}` : 'Pass'}
          style={[styles.actionButton, { borderColor: theme.pass, backgroundColor: theme.background }]}>
          <ThemedText type="smallBold" style={{ color: theme.pass }}>
            Pass
          </ThemedText>
        </PressableScale>

        <PressableScale
          onPress={() => handleButton('like')}
          disabled={!top}
          accessibilityRole="button"
          accessibilityLabel={top ? `Like ${top.name}` : 'Like'}
          style={[styles.actionButton, { borderColor: theme.like, backgroundColor: theme.background }]}>
          <ThemedText type="smallBold" style={{ color: theme.like }}>
            Like
          </ThemedText>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: Spacing.four,
  },
  deck: {
    flex: 1,
  },
  behind: {
    borderRadius: Radius.card,
    overflow: 'hidden',
    transitionProperty: 'transform',
    transitionDuration: '220ms',
    transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  actionButton: {
    minWidth: 120,
    minHeight: 48,
    borderWidth: 2,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
});
