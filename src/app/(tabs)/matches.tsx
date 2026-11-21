import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { ScreenLoading, EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CURRENT_USER_ID, fetchConversations, getProfileSync, lastActivityAt } from '@/services';
import { useDecisions } from '@/store/decisions';
import type { Conversation } from '@/types';

export default function MatchesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state } = useDecisions();
  const [conversations, setConversations] = useState<Conversation[] | undefined>(undefined);

  // Refetch on focus: a match made on the Discover tab, or a message just
  // sent, should be reflected when coming back here.
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

  if (!conversations) {
    return <ScreenLoading label="Loading your matches" />;
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.heading}>
          MATCHES
        </ThemedText>

        {conversations.length === 0 ? (
          <EmptyState
            title="No matches yet"
            body="When someone you liked likes you back, they turn up here and you can start talking."
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
                ? `${last.senderId === CURRENT_USER_ID ? 'You: ' : ''}${last.text}`
                : 'You matched — say hello';

              return (
                <PressableScale
                  onPress={() => router.push(`/chat/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Conversation with ${profile.name}. ${preview}`}
                  style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                  <ProfilePhoto
                    id={profile.id}
                    name={profile.name}
                    style={styles.avatar}
                    initialSize={24}
                  />
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold">{profile.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {preview}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {relativeTime(lastActivityAt(item))}
                  </ThemedText>
                </PressableScale>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

/** Coarse relative time. Good enough for a list and needs no date library. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
  heading: {
    letterSpacing: 1.5,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    minHeight: 72,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
