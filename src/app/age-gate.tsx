import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { APP_NAME } from '@/constants/app';
import { BRAND_GRADIENT, Fonts, Radius, Spacing } from '@/constants/theme';
import { ageOn } from '@/lib/age';
import { useDecisions } from '@/store/decisions';

/**
 * Minimum age. Not configurable on purpose — it is a legal floor, not a
 * setting, and the store listing states it.
 */
const MIN_AGE = 18;

/**
 * Age declaration, shown once before anything else.
 *
 * A date of birth rather than a yes/no checkbox: a checkbox records that
 * someone tapped a button, a date records what they actually claimed, which
 * is the thing worth keeping. The confirmation is timestamped in the store.
 *
 * This is a declaration, not verification. It cannot stop a determined
 * person who lies, and it is not meant to — it is the baseline every app
 * store requires before an 18+ product, and the audit trail if a report is
 * ever made.
 */
export default function AgeGateScreen() {
  const router = useRouter();
  const { confirmAge, blockUnderage } = useDecisions();

  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);

  type InputRef = React.ComponentRef<typeof TextInput>;
  const monthRef = useRef<InputRef>(null);
  const yearRef = useRef<InputRef>(null);

  const parsed = useMemo(() => parseDate(day, month, year), [day, month, year]);
  const complete = day.length > 0 && month.length > 0 && year.length === 4;

  async function submit() {
    if (!parsed) {
      setError('That date does not look right. Check the day, month and year.');
      return;
    }
    if (parsed > new Date()) {
      setError('That date is in the future.');
      return;
    }

    const age = ageOn(parsed, new Date());
    if (age < MIN_AGE) {
      await blockUnderage().catch(() => {});
      router.replace('/underage');
      return;
    }

    await confirmAge(parsed).catch(() => {});
    router.replace('/welcome');
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={BRAND_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText style={styles.title} accessibilityRole="header">
            What&apos;s your date of birth?
          </ThemedText>
          <ThemedText style={styles.body}>
            You must be {MIN_AGE} or older to use {APP_NAME}. We keep your date of birth to
            confirm this, and your age is never shown to anyone else.
          </ThemedText>

          <View style={styles.fields}>
            <Field
              label="Day"
              value={day}
              onChange={(v) => {
                setDay(v);
                setError(null);
                if (v.length === 2) {
                  monthRef.current?.focus();
                }
              }}
              maxLength={2}
              placeholder="DD"
            />
            <Field
              ref={monthRef}
              label="Month"
              value={month}
              onChange={(v) => {
                setMonth(v);
                setError(null);
                if (v.length === 2) {
                  yearRef.current?.focus();
                }
              }}
              maxLength={2}
              placeholder="MM"
            />
            <Field
              ref={yearRef}
              label="Year"
              value={year}
              onChange={(v) => {
                setYear(v);
                setError(null);
              }}
              maxLength={4}
              placeholder="YYYY"
              wide
            />
          </View>

          {error ? (
            <ThemedText style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          ) : null}
        </View>

        <View style={styles.actions}>
          <PressableScale
            onPress={submit}
            disabled={!complete}
            accessibilityRole="button"
            accessibilityLabel={`Confirm I am ${MIN_AGE} or older`}
            accessibilityState={{ disabled: !complete }}
            style={[styles.button, { opacity: complete ? 1 : 0.5 }]}>
            <ThemedText style={styles.buttonLabel}>
              I&apos;m {MIN_AGE} or older — continue
            </ThemedText>
          </PressableScale>

          <ThemedText style={styles.legal}>
            Confirming records the date and time of your declaration.
          </ThemedText>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Field({
  ref,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  wide,
}: {
  ref?: React.Ref<React.ComponentRef<typeof TextInput>>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.field, wide && styles.fieldWide]}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <TextInput
        ref={ref}
        value={value}
        // Strips anything that is not a digit, so paste and some keyboards
        // cannot get a letter into a date field.
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.45)"
        accessibilityLabel={label}
        style={styles.input}
      />
    </View>
  );
}

/** Parses a day/month/year entry, rejecting dates that do not exist. */
function parseDate(day: string, month: string, year: string): Date | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || year.length !== 4) {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  const date = new Date(y, m - 1, d);
  // Rejects 31 February and friends: JS rolls those over to the next month.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/** Whole years between two dates, counting the birthday correctly. */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#241611' },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  body: {
    fontFamily: Fonts.rounded,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  fields: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  field: { flex: 1, gap: Spacing.one },
  fieldWide: { flex: 1.6 },
  fieldLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  input: {
    minHeight: 56,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.rounded,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  error: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFD9D0',
  },
  actions: { gap: Spacing.two },
  button: {
    minHeight: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  buttonLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: '700',
    color: '#D1674A',
  },
  legal: {
    fontFamily: Fonts.rounded,
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
});
