/**
 * Camera spike — throwaway. Delete once the question below is answered.
 *
 * Persona's Hosted Flow is a web page we open from the app, and a selfie
 * check needs `getUserMedia`. Nothing in the Expo SDK 58 docs for
 * expo-web-browser says whether the camera is reachable from inside the
 * in-app browser, and the two open modes use different native containers:
 *
 *   openAuthSessionAsync -> ASWebAuthenticationSession (iOS) / Custom Tabs
 *   openBrowserAsync     -> SFSafariViewController (iOS) / Custom Tabs
 *
 * ASWebAuthenticationSession is a hardened context built for OAuth, so it is
 * the one in doubt. This screen opens the same URL both ways and logs what
 * comes back, so the answer comes from a device rather than from guesswork.
 *
 * The camera verdict is NOT in the logged result — the result only describes
 * how the browser closed. The verdict is what you see on the page: a live
 * preview of your own face means the camera opened.
 *
 * Must be run on a PHYSICAL device. The iOS Simulator has no camera, so it
 * reports failure whatever the browser does.
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A plain getUserMedia page, served over HTTPS and not framed. Tier one of
 * the spike: if the camera cannot open here, no amount of Persona
 * configuration will make it open in their flow either.
 *
 * Tier two is to paste a real Persona sandbox hosted-flow URL into the field
 * below once an account exists. Persona's WebView guidance also asks for
 * `is-webview=true` on the URL, which matters for the WebView fallback
 * rather than for these two modes.
 */
const PROBE_URL = 'https://webrtc.github.io/samples/src/content/getusermedia/gum/';

type Entry = { mode: string; at: string; detail: string };

export default function CameraSpikeScreen() {
  const theme = useTheme();
  const [url, setUrl] = useState(PROBE_URL);
  const [log, setLog] = useState<Entry[]>([]);

  const record = (mode: string, detail: string) => {
    const at = new Date().toLocaleTimeString();
    setLog((prev) => [{ mode, at, detail }, ...prev]);
  };

  const runAuthSession = async () => {
    // Linking.createURL keeps this correct in both Expo Go (exp://) and a
    // dev build (myrebuild://, from `scheme` in app.json). iOS requires the
    // redirect to use the app's scheme and not https.
    const redirect = Linking.createURL('/dev/camera-spike');
    try {
      const result = await WebBrowser.openAuthSessionAsync(url, redirect);
      record('openAuthSessionAsync', JSON.stringify(result));
    } catch (error) {
      record('openAuthSessionAsync', `threw: ${String(error)}`);
    }
  };

  const runBrowser = async () => {
    try {
      const result = await WebBrowser.openBrowserAsync(url);
      record('openBrowserAsync', JSON.stringify(result));
    } catch (error) {
      record('openBrowserAsync', `threw: ${String(error)}`);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <ThemedText style={styles.title} accessibilityRole="header">
        Camera spike
      </ThemedText>

      <View style={[styles.notice, { backgroundColor: theme.accentPale }]}>
        <ThemedText style={[styles.noticeText, { color: theme.accent }]}>
          Physical device only. Allow the camera prompt, then look for a live preview of your own
          face — that is the pass. A permission error, a black frame or no prompt at all is a fail.
        </ThemedText>
      </View>

      <ThemedText type="smallBold">Probe URL</ThemedText>
      <TextInput
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        multiline
        accessibilityLabel="Probe URL"
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
        ]}
      />

      <Pressable
        onPress={runAuthSession}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: pressed ? theme.accentPressed : theme.accent },
        ]}>
        <ThemedText style={[styles.buttonText, { color: theme.onAccent }]}>
          1 — openAuthSessionAsync
        </ThemedText>
      </Pressable>

      <Pressable
        onPress={runBrowser}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: pressed ? theme.accentPressed : theme.accent },
        ]}>
        <ThemedText style={[styles.buttonText, { color: theme.onAccent }]}>
          2 — openBrowserAsync
        </ThemedText>
      </Pressable>

      <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
        If both fail, the fallback is react-native-webview with camera permissions declared in
        app.json. That needs a package install and a new dev build, so it is deliberately not
        wired up here.
      </ThemedText>

      {log.length > 0 && (
        <>
          <View style={styles.logHeader}>
            <ThemedText type="smallBold">Results</ThemedText>
            <Pressable onPress={() => setLog([])} accessibilityRole="button">
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Clear
              </ThemedText>
            </Pressable>
          </View>
          {log.map((entry, index) => (
            <View
              key={`${entry.at}-${index}`}
              style={[styles.entry, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">
                {entry.mode} · {entry.at}
              </ThemedText>
              <ThemedText type="code" style={{ color: theme.textSecondary }}>
                {entry.detail}
              </ThemedText>
            </View>
          ))}
          <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
            These lines describe how the browser closed, not whether the camera worked. Record the
            camera verdict yourself from what the page showed.
          </ThemedText>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
  },
  body: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  notice: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  noticeText: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.three,
    fontSize: 14,
    minHeight: 72,
  },
  button: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: '700',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entry: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.one,
  },
});
