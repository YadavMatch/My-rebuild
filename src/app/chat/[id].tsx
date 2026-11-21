import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { MessageBubble } from '@/components/message-bubble';
import { PressableScale } from '@/components/pressable-scale';
import { ScreenLoading, EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchConversation, getProfileSync, sendMessage } from '@/services';
import type { Conversation } from '@/types';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useTheme();

  const [conversation, setConversation] = useState<Conversation | undefined | null>(undefined);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const profile = conversation ? getProfileSync(conversation.profileId) : undefined;

  useEffect(() => {
    let cancelled = false;

    fetchConversation(id)
      .then((result) => {
        if (!cancelled) {
          setConversation(result ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConversation(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Title the screen with the other person once we know who they are.
  useLayoutEffect(() => {
    navigation.setOptions({ title: profile?.name ?? '' });
  }, [navigation, profile?.name]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || !conversation) {
      return;
    }

    setSending(true);
    setDraft('');
    try {
      await sendMessage(conversation.id, text);
      // Re-read rather than appending locally, so this screen behaves the
      // same way it will against a real server.
      const updated = await fetchConversation(conversation.id);
      setConversation(updated ?? conversation);
    } catch {
      // Put the text back so it is not silently lost.
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  if (conversation === undefined) {
    return <ScreenLoading label="Loading conversation" />;
  }

  if (conversation === null || !profile) {
    return (
      <EmptyState
        title="Conversation unavailable"
        body="This conversation no longer exists. It may have been removed, or the person left the app."
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        ref={listRef}
        data={conversation.messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          <PressableScale
            onPress={() => router.push(`/profile/${profile.id}`)}
            accessibilityRole="link"
            accessibilityLabel={`View ${profile.name}'s profile`}
            style={styles.header}>
            <ThemedText type="small" themeColor="textSecondary">
              You matched with {profile.name} · View profile
            </ThemedText>
          </PressableScale>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText type="small" themeColor="textSecondary">
              You matched. Nobody has said anything yet.
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => <MessageBubble message={item} senderName={profile.name} />}
      />

      <View style={[styles.composer, { borderTopColor: theme.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={`Message ${profile.name}`}
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            { backgroundColor: theme.backgroundElement, color: theme.text },
          ]}
          multiline
          accessibilityLabel={`Message ${profile.name}`}
          onSubmitEditing={handleSend}
        />
        <PressableScale
          onPress={handleSend}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={[
            styles.send,
            { backgroundColor: draft.trim() ? theme.accent : theme.backgroundElement },
          ]}>
          <ThemedText
            type="smallBold"
            style={{ color: draft.trim() ? theme.onAccent : theme.textSecondary }}>
            Send
          </ThemedText>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  header: {
    alignItems: 'center',
    paddingBottom: Spacing.three,
  },
  empty: {
    alignItems: 'center',
    padding: Spacing.four,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    fontSize: 16,
  },
  send: {
    minHeight: 44,
    minWidth: 72,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
});
