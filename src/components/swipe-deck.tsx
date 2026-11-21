import { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { SwipeCard, type SwipeCardHandle } from '@/components/swipe-card';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Decision, Profile } from '@/types';

/** How many cards are rendered behind the top one. */
const VISIBLE_BEHIND = 2;

type Props = {
  /** Cards still to be decided on, top card first. */
  profiles: Profile[];
  onDecision: (profile: Profile, decision: Decision) => void;
  onOpenProfile: (profileId: string) => void;
  /** Opens a conversation without deciding, the middle action. */
  onMessage: (profile: Profile) => void;
};

export function SwipeDeck({ profiles, onDecision, onOpenProfile, onMessage }: Props) {
  const theme = useTheme();
  const topCard = useRef<SwipeCardHandle>(null);

  const top = profiles[0];

  // The buttons drive the same exit animation and the same callback as a
  // real swipe. Swipe-only would make the app unusable with a screen reader
  // or with limited motor control, so these are not a secondary affordance.
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
                    transform: [{ scale: 1 - index * 0.03 }, { translateY: -index * 10 }],
                  },
                ]}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                <View style={[styles.behindPhoto, { backgroundColor: theme.photoBackground }]}>
                  <ProfilePhoto
                    emoji={profile.emoji}
                    name={profile.name}
                    size={88}
                    background="transparent"
                    style={styles.behindPhotoInner}
                  />
                </View>
              </View>
            ),
          )}
      </View>

      {/*
        Three actions, as in the design. Every one is a labelled button, so
        nothing is reachable only by swiping — that would lock out anyone
        using a screen reader or with limited motor control.
      */}
      <View style={styles.actions}>
        <ActionButton
          glyph="✕"
          size={60}
          colour={theme.pass}
          background={theme.verifiedPale}
          disabled={!top}
          onPress={() => handleButton('pass')}
          label={top ? `Pass on ${top.name}` : 'Pass'}
        />
        <ActionButton
          glyph="💬"
          size={52}
          colour={theme.textSecondary}
          background={theme.backgroundElement}
          borderColour={theme.border}
          disabled={!top}
          onPress={() => (top ? onMessage(top) : undefined)}
          label={top ? `Message ${top.name}` : 'Message'}
        />
        <ActionButton
          glyph="♥"
          size={68}
          colour={theme.onAccent}
          background={theme.accent}
          disabled={!top}
          onPress={() => handleButton('like')}
          label={top ? `Like ${top.name}` : 'Like'}
        />
      </View>
    </View>
  );
}

function ActionButton({
  glyph,
  size,
  colour,
  background,
  borderColour,
  disabled,
  onPress,
  label,
}: {
  glyph: string;
  size: number;
  colour: string;
  background: string;
  borderColour?: string;
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        styles.action,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          borderColor: borderColour ?? 'transparent',
          borderWidth: borderColour ? 1.5 : 0,
          opacity: disabled ? 0.45 : 1,
        },
      ]}>
      <Text style={[styles.actionGlyph, { color: colour, fontSize: size * 0.4 }]} allowFontScaling={false}>
        {glyph}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: Spacing.three,
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
  behindPhoto: {
    height: 165,
  },
  behindPhotoInner: {
    width: '100%',
    height: '100%',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGlyph: {
    fontFamily: Fonts.rounded,
    fontWeight: '700',
  },
});
