/**
 * Sign in or create an account.
 *
 * One screen for both, because the fields are identical and a toggle beats
 * two near-identical files. The mode arrives as a route param so the welcome
 * screen's two buttons land on the right one.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth';
import { useDecisions } from '@/store/decisions';

type Mode = 'signup' | 'signin';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { signIn, signUp, enabled } = useAuth();
  const { completeWelcome } = useDecisions();

  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError('Enter your email and a password.');
      return;
    }
    if (isSignUp && password.length < 8) {
      setError('Passwords need at least 8 characters.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = isSignUp ? await signUp(trimmed, password) : await signIn(trimmed, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.needsEmailConfirmation) {
      setConfirmationSentTo(trimmed);
      return;
    }

    completeWelcome().catch(() => {});
    router.replace('/(tabs)');
  }

  function switchMode() {
    setMode(isSignUp ? 'signin' : 'signup');
    setError(null);
  }

  // Sign-up succeeded but the account is not usable until the link is
  // clicked. Showing the deck now would be a lie, so the screen stops here.
  if (confirmationSentTo) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ThemedText type="title" style={styles.heading}>
          Check your email
        </ThemedText>
        <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
          We sent a confirmation link to {confirmationSentTo}. Open it, then come back and sign in.
        </ThemedText>
        <PressableScale
          onPress={() => {
            setConfirmationSentTo(null);
            setMode('signin');
            setPassword('');
          }}
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
          style={[styles.button, { backgroundColor: theme.accent }]}>
          <ThemedText type="smallBold" style={[styles.buttonLabel, { color: theme.onAccent }]}>
            Back to sign in
          </ThemedText>
        </PressableScale>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <ThemedText type="title" style={styles.heading} accessibilityRole="header">
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </ThemedText>

        {!enabled ? (
          <View style={[styles.notice, { backgroundColor: theme.accentPale }]}>
            <ThemedText type="small" style={{ color: theme.text }}>
              No backend is configured in this build, so accounts cannot be created. Go back and
              choose “Skip for now” to look around with sample data.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.field}>
          <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
            Email
          </ThemedText>
          <TextInput
            value={email}
            onChangeText={setEmail}
            editable={enabled && !busy}
            placeholder="you@example.com"
            placeholderTextColor={theme.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            accessibilityLabel="Email"
            style={[
              styles.input,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text },
            ]}
          />
        </View>

        <View style={styles.field}>
          <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
            Password
          </ThemedText>
          <TextInput
            value={password}
            onChangeText={setPassword}
            editable={enabled && !busy}
            placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            accessibilityLabel="Password"
            onSubmitEditing={() => {
              if (enabled && !busy) {
                submit().catch(() => {});
              }
            }}
            returnKeyType="go"
            style={[
              styles.input,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text },
            ]}
          />
        </View>

        {error ? (
          <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        ) : null}

        <PressableScale
          onPress={() => {
            submit().catch(() => {});
          }}
          disabled={!enabled || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !enabled || busy }}
          accessibilityLabel={isSignUp ? 'Create account' : 'Sign in'}
          style={[styles.button, { backgroundColor: theme.accent, opacity: !enabled || busy ? 0.5 : 1 }]}>
          {busy ? (
            <ActivityIndicator color={theme.onAccent} />
          ) : (
            <ThemedText type="smallBold" style={[styles.buttonLabel, { color: theme.onAccent }]}>
              {isSignUp ? 'Create account' : 'Sign in'}
            </ThemedText>
          )}
        </PressableScale>

        <PressableScale
          onPress={switchMode}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={isSignUp ? 'I already have an account' : 'Create an account instead'}
          style={styles.switch}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {isSignUp ? 'I already have an account' : 'Create an account instead'}
          </ThemedText>
        </PressableScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  scroll: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  heading: { marginBottom: Spacing.one },
  body: { lineHeight: 22 },
  notice: { padding: Spacing.three, borderRadius: Radius.md },
  field: { gap: Spacing.one },
  input: {
    minHeight: 50,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.rounded,
    fontSize: 16,
  },
  button: {
    minHeight: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  buttonLabel: { fontFamily: Fonts.rounded, fontSize: 16 },
  switch: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
