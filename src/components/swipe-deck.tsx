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
  onUndo: () => void;
  canUndo: boolean;
};

export function SwipeDeck({ profiles, onDecision, onOpenProfile, onUndo, canUndo }: Props) {
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

      {/*
        Every action is a labelled button, not just a gesture. Swiping stays
        the fast path, but nothing is reachable *only* by swiping — that would
        lock out anyone using a screen reader or with limited motor control,
        and it hides half the app from someone who has never used it.
      */}
      <View style={styles.actions} accessibilityRole="toolbar">
        <ActionButton
          glyph="↺"
          label="Rewind"
          colour={theme.textSecondary}
          disabled={!canUndo}
          onPress={onUndo}
          hint={canUndo ? 'Take back your last swipe' : 'Nothing to take back yet'}
        />
        <ActionButton
          glyph="✕"
          label="Pass"
          colour={theme.pass}
          disabled={!top}
          onPress={() => handleButton('pass')}
          hint={top ? `Pass on ${top.name}` : 'Pass'}
        />
        <ActionButton
          glyph="★"
          label="Super like"
          colour={theme.accent}
          disabled={!top}
          onPress={() => handleButton('superlike')}
          hint={top ? `Super like ${top.name}, they are told straight away` : 'Super like'}
        />
        <ActionButton
          glyph="♥"
          label="Like"
          colour={theme.like}
          disabled={!top}
          onPress={() => handleButton('like')}
          hint={top ? `Like ${top.name}` : 'Like'}
        />
      </View>
    </View>
  );
}

function ActionButton({
  glyph,
  label,
  colour,
  disabled,
  onPress,
  hint,
}: {
  glyph: string;
  label: string;
  colour: string;
  disabled: boolean;
  onPress: () => void;
  hint: string;
}) {
  const theme = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled }}
      style={styles.action}>
      <View
        style={[
          styles.actionCircle,
          {
            borderColor: disabled ? theme.border : colour,
            backgroundColor: theme.background,
            opacity: disabled ? 0.45 : 1,
          },
        ]}>
        <ThemedText
          style={[styles.actionGlyph, { color: disabled ? theme.textSecondary : colour }]}
          allowFontScaling={false}>
          {glyph}
        </ThemedText>
      </View>
      {/* The label is always visible. An icon alone is a guess for the user. */}
      <ThemedText
        type="small"
        style={[styles.actionLabel, { color: disabled ? theme.textSecondary : theme.text }]}>
        {label}
      </ThemedText>
    </PressableScale>
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
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
  },
  action: {
    alignItems: 'center',
    gap: Spacing.one,
    minWidth: 64,
  },
  actionCircle: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGlyph: {
    fontSize: 24,
    lineHeight: 30,
  },
  actionLabel: {
    fontSize: 12,
  },
});
