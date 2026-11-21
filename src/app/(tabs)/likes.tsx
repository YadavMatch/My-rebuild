import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VerifiedBadge } from '@/components/badges';
import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getProfileSync } from '@/services';
import { useDecisions } from '@/store/decisions';

export default function LikesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state } = useDecisions();

  const liked = state.liked
    .map((id) => getProfileSync(id))
    .filter((p) => p !== undefined)
    .filter((p) => !state.blocked.includes(p.id))
    .reverse();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText style={styles.title} accessibilityRole="header">
          Likes
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          {/*
            Honest about the direction. "Who liked you" needs a backend that
            can tell us, so this shows who *you* liked instead of implying
            knowledge the app does not have.
          */}
          People you have liked. Seeing who liked you first needs Premium.
        </ThemedText>

        {liked.length === 0 ? (
          <EmptyState
            emoji="❤️"
            title="No likes yet"
            body="Profiles you like from Discover collect here."
          />
        ) : (
          <FlatList
            data={liked}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.column}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <PressableScale
                onPress={() => router.push(`/profile/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.age}. Open profile.`}
                style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ProfilePhoto
                  emoji={item.emoji}
                  name={item.name}
                  size={56}
                  style={styles.cardPhoto}
                />
                <View style={styles.cardText}>
                  <View style={styles.nameRow}>
                    <ThemedText style={styles.name} numberOfLines={1}>
                      {item.name}, {item.age}
                    </ThemedText>
                    {item.verified ? <VerifiedBadge size={16} /> : null}
                  </View>
                  <ThemedText style={[styles.proximity, { color: theme.textSecondary }]}>
                    {item.proximity}
                  </ThemedText>
                </View>
              </PressableScale>
            )}
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
    gap: Spacing.one,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
    paddingTop: Spacing.two,
  },
  subtitle: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: Spacing.two,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  column: {
    gap: Spacing.two,
  },
  card: {
    flex: 1,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    paddingBottom: Spacing.three,
  },
  cardPhoto: {
    height: 120,
    width: '100%',
  },
  cardText: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  name: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  proximity: {
    fontFamily: Fonts.rounded,
    fontSize: 14,
    fontWeight: '600',
  },
});
