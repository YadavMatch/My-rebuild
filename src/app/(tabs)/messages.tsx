import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pill, VerifiedBadge } from '@/components/badges';
import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { ScreenLoading, EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentUserId, fetchConversations, getProfileSync } from '@/services';
import { useDecisions } from '@/store/decisions';
import type { Conversation } from '@/types';

export default function MessagesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state } = useDecisions();
  const [conversations, setConversations] = useState<Conversation[] | undefined>(undefined);

  // Refetch on focus: a match made on Discover, or a message just sent,
  // should be reflected when coming back here.
  useFocusEffect(
    useCallback(() => {
      if (!state.hydrated) {
        return;
      }
      let cancelled = false;

      fetchConversations(state.blocked)
        .then((result) => {
          if (!cancelled) {
            setConversations(result);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setConversations([]);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [state.hydrated, state.blocked]),
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText style={styles.title} accessibilityRole="header">
            Messages
          </ThemedText>
          <PressableScale
            onPress={() => router.push('/invite')}
            accessibilityRole="button"
            accessibilityLabel="Invite a friend">
            <Pill label="Invite" glyph="+" variant="tinted" />
          </PressableScale>
        </View>

        {!conversations ? (
          <ScreenLoading label="Loading your messages" />
        ) : conversations.length === 0 ? (
          <EmptyState
            emoji="💬"
            title="No messages yet"
            body="When someone you liked likes you back, your conversation starts here."
          />
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const profile = getProfileSync(item.profileId);
              if (!profile) {
                return null;
              }

              const last = item.messages.at(-1);
              const preview = last
                ? `${last.senderId === currentUserId() ? 'You: ' : ''}${last.text}`
                : 'You matched — say hello';

              return (
                <PressableScale
                  onPress={() => router.push(`/chat/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Conversation with ${profile.name}. ${preview}`}
                  style={styles.row}>
                  <ProfilePhoto
                    emoji={profile.emoji}
                    name={profile.name}
                    size={26}
                    style={styles.avatar}
                  />
                  <View style={styles.rowText}>
                    <View style={styles.nameRow}>
                      <ThemedText style={styles.name}>{profile.name}</ThemedText>
                      {profile.verified ? <VerifiedBadge size={18} /> : null}
                    </View>
                    <ThemedText
                      style={[styles.preview, { color: theme.textSecondary }]}
                      numberOfLines={1}>
                      {preview}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.more, { color: theme.textSecondary }]}>···</ThemedText>
                </PressableScale>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 72,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  name: {
    fontFamily: Fonts.rounded,
    fontSize: 18,
    fontWeight: '700',
  },
  preview: {
    fontFamily: Fonts.rounded,
    fontSize: 16,
    fontWeight: '500',
  },
  more: {
    fontSize: 20,
    fontWeight: '700',
  },
});
