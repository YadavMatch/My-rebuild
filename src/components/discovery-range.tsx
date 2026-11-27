/**
 * Choosing how far to look.
 *
 * Six presets and two sentences of explanation. The sentences matter as much
 * as the control: a member who picks 150 km reasonably assumes they are now
 * visible to everyone within 150 km, and they are not — the other person's
 * range has to cover the separation too. Leaving that unsaid would make the
 * widest option feel broken.
 *
 * Nothing here is a distance to anybody. The value is the member's own
 * setting; the server never tells the client how far away a candidate is.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DISCOVERY_MUTUAL_EXPLAINER,
  DISCOVERY_RADII_M,
  DISCOVERY_RANGE_EXPLAINER,
  radiusLabel,
} from '@/lib/discovery';
import { fetchDiscoveryStatus, saveDiscoveryRadius } from '@/services';

export function DiscoveryRangeSection({ onChanged }: { onChanged?: () => void }) {
  const theme = useTheme();
  const [radiusM, setRadiusM] = useState<number | null>(null);
  const [hasLocation, setHasLocation] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDiscoveryStatus()
      .then((status) => {
        if (!cancelled) {
          setRadiusM(status.radiusM);
          setHasLocation(status.hasLocation);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function choose(next: number) {
    if (saving !== null || next === radiusM) {
      return;
    }
    setSaving(next);
    saveDiscoveryRadius(next)
      .then(() => {
        setRadiusM(next);
        onChanged?.();
      })
      .catch(() => {})
      .finally(() => setSaving(null));
  }

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {radiusM === null ? (
        <ThemedText style={[styles.prompt, { color: theme.accent }]}>
          Choose a range to turn on discovery.
        </ThemedText>
      ) : null}

      <View style={styles.chips}>
        {DISCOVERY_RADII_M.map((m) => {
          const selected = m === radiusM;
          return (
            <PressableScale
              key={m}
              onPress={() => choose(m)}
              accessibilityRole="button"
              accessibilityLabel={`Look up to ${radiusLabel(m)} away`}
              accessibilityState={{ selected, disabled: saving !== null }}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.accent : theme.backgroundElement,
                  borderColor: selected ? theme.accent : theme.border,
                },
              ]}>
              <ThemedText
                type="smallBold"
                style={[styles.chipLabel, { color: selected ? theme.onAccent : theme.text }]}>
                {radiusLabel(m)}
              </ThemedText>
            </PressableScale>
          );
        })}
      </View>

      {!hasLocation ? (
        <ThemedText style={[styles.note, { color: theme.textSecondary }]}>
          Set your location under Location above, and your range starts working.
        </ThemedText>
      ) : null}

      <ThemedText style={[styles.note, { color: theme.textSecondary }]}>
        {DISCOVERY_RANGE_EXPLAINER}
      </ThemedText>
      <ThemedText style={[styles.note, { color: theme.textSecondary }]}>
        {DISCOVERY_MUTUAL_EXPLAINER}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  loading: { padding: Spacing.four, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipLabel: { fontFamily: Fonts.rounded, fontSize: 15 },
  prompt: { fontFamily: Fonts.rounded, fontSize: 15, fontWeight: '700' },
  note: { fontFamily: Fonts.rounded, fontSize: 13, lineHeight: 19 },
});
