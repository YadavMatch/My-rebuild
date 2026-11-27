/**
 * Asks for location, in the one place where its absence is visible.
 *
 * Not on launch: a permission dialog before anyone has seen what the app does
 * is the quickest way to get a "no" that only Settings can undo. This appears
 * on Discover, where every card says "Distance unknown", so the reason for
 * asking is on screen next to the ask.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { captureLocation } from '@/lib/location';
import { hasStoredLocation } from '@/services';
import { useAuth } from '@/store/auth';

export function LocationPrompt({ onCaptured }: { onCaptured: () => void }) {
  const theme = useTheme();
  const { user } = useAuth();
  const [needed, setNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    hasStoredLocation()
      .then((stored) => {
        if (!cancelled) {
          setNeeded(!stored);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const enable = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const result = await captureLocation();
    setBusy(false);

    if (result.ok) {
      setNeeded(false);
      onCaptured();
      return;
    }
    setProblem(result.message);
    // A refusal the system will not re-ask for should stop nagging; the
    // message tells them where to change it.
    if (result.reason === 'blocked' || result.reason === 'unavailable') {
      setDismissed(true);
    }
  }, [onCaptured]);

  // Signed out there is nothing to store a location against, and the seed
  // profiles carry their own proximity labels.
  if (!user || !needed || dismissed) {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.accentPale, borderColor: theme.border }]}>
      <View style={styles.text}>
        <ThemedText type="smallBold" style={{ color: theme.text }}>
          See who is actually nearby
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {problem ??
            'Without your location every profile reads “Distance unknown”. Only a rough distance is ever shown to anyone.'}
        </ThemedText>
      </View>

      <View style={styles.actions}>
        <PressableScale
          onPress={() => {
            enable().catch(() => {});
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Turn on location"
          accessibilityState={{ disabled: busy }}
          style={[styles.button, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}>
          {busy ? (
            <ActivityIndicator color={theme.onAccent} />
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.onAccent, fontFamily: Fonts.rounded }}>
              Turn on location
            </ThemedText>
          )}
        </PressableScale>

        <PressableScale
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          style={styles.dismiss}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Not now
          </ThemedText>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.two,
  },
  text: { gap: Spacing.half },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  button: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismiss: { minHeight: 40, paddingHorizontal: Spacing.two, justifyContent: 'center' },
});
