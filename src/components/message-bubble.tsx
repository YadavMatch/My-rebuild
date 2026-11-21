import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CURRENT_USER_ID } from '@/services';
import type { Message } from '@/types';

export function MessageBubble({ message, senderName }: { message: Message; senderName: string }) {
  const theme = useTheme();
  const isMine = message.senderId === CURRENT_USER_ID;

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View
        style={[
          styles.bubble,
          isMine
            ? { backgroundColor: theme.accent, borderBottomRightRadius: Radius.sm }
            : { backgroundColor: theme.backgroundElement, borderBottomLeftRadius: Radius.sm },
        ]}>
        <ThemedText
          // The sender is obvious visually from the side and colour, but a
          // screen reader reads bubbles in sequence with no such cue.
          accessibilityLabel={`${isMine ? 'You' : senderName} said: ${message.text}`}
          style={isMine ? { color: theme.onAccent } : undefined}>
          {message.text}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.lg,
  },
});
