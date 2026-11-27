/**
 * The editable half of a profile, for both setting one up and changing it.
 *
 * One component rather than two screens, because a setup form and an edit
 * form that drift apart is how an app ends up with fields you can set once
 * and never correct.
 *
 * Age is not a field. It comes from the date of birth the age gate already
 * collected: asking twice invites two answers, and the one that gates access
 * should be the one shown on the card.
 */

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ProfilePhoto } from '@/components/profile-photo';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ageFromStoredDate } from '@/lib/age';
import { choosePhoto } from '@/lib/photo';
import {
  PLACEHOLDER_NAME,
  removeProfilePhoto,
  uploadProfilePhoto,
  fetchCurrentUser,
  fetchPromptCatalogue,
  saveMyPrompts,
  updateMyProfile,
} from '@/services';
import { useDecisions } from '@/store/decisions';

const EMOJI_CHOICES = ['🌸', '🍜', '🐕', '📚', '🎨', '🏃', '🎧', '🌙', '🌉', '🌿', '📷', '🎸'];

const INTEREST_CHOICES = [
  'Art', 'Astronomy', 'Baking', 'Birds', 'Books', 'Chess', 'Cinema', 'Climbing',
  'Coffee', 'Comedy', 'Cooking', 'Crosswords', 'Cycling', 'Dogs', 'Food',
  'Football', 'Gardening', 'History', 'Illustration', 'Music', 'Photography',
  'Plants', 'Quizzes', 'Records', 'Running', 'Swimming', 'Tea', 'Travel',
];

const MAX_INTERESTS = 5;
const PROMPT_SLOTS = 3;

export function ProfileForm({
  submitLabel,
  onSaved,
  header,
}: {
  submitLabel: string;
  onSaved: () => void;
  /** Rendered inside the scroll view, so it scrolls away instead of clipping it. */
  header?: ReactNode;
}) {
  const theme = useTheme();
  const { state } = useDecisions();

  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]);
  const [interests, setInterests] = useState<string[]>([]);
  const [catalogue, setCatalogue] = useState<{ id: number; question: string }[]>([]);
  const [slots, setSlots] = useState<{ promptId: number | null; answer: string }[]>(
    Array.from({ length: PROMPT_SLOTS }, () => ({ promptId: null, answer: '' })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const age = useMemo(() => ageFromStoredDate(state.dateOfBirth), [state.dateOfBirth]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchCurrentUser().catch(() => null), fetchPromptCatalogue().catch(() => [])])
      .then(([me, prompts]) => {
        if (cancelled) {
          return;
        }
        if (me) {
          // The placeholder is not a name anyone chose, so it starts empty
          // rather than making them delete it first.
          setName(me.name === PLACEHOLDER_NAME ? '' : me.name);
          setJobTitle(me.jobTitle);
          setLocation(me.location);
          setBio(me.bio);
          setInterests(me.interests.slice(0, MAX_INTERESTS));
          if (me.emoji) {
            setEmoji(me.emoji);
          }
          setPhotoUrl(me.photoUrl ?? null);
        }
        setCatalogue(prompts);
        if (prompts.length > 0) {
          const existing = me?.prompts ?? [];
          setSlots(
            Array.from({ length: PROMPT_SLOTS }, (_, i) => {
              const answered = existing[i];
              const matched = answered
                ? prompts.find((p) => p.question === answered.question)
                : undefined;
              return {
                promptId: matched?.id ?? prompts[i % prompts.length]?.id ?? null,
                answer: answered?.answer ?? '',
              };
            }),
          );
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    return () => {
      cancelled = true;
    };
  }, []);

  /** Uploads immediately rather than on save: a photo is its own action, and
   *  holding megabytes in memory until the form is submitted helps nobody. */
  async function pickPhoto() {
    setPhotoBusy(true);
    setError(null);
    const choice = await choosePhoto();
    if (!choice.ok) {
      setPhotoBusy(false);
      if (choice.reason !== 'cancelled') {
        setError(choice.message);
      }
      return;
    }
    try {
      setPhotoUrl(await uploadProfilePhoto(choice.base64, choice.mimeType));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The photo could not be uploaded.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function dropPhoto() {
    setPhotoBusy(true);
    try {
      await removeProfilePhoto();
      setPhotoUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The photo could not be removed.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function toggleInterest(label: string) {
    setInterests((current) =>
      current.includes(label)
        ? current.filter((i) => i !== label)
        : current.length >= MAX_INTERESTS
          ? current
          : [...current, label],
    );
  }

  /** Moves a slot to the next question nobody else is using. */
  function cycleQuestion(index: number) {
    setSlots((current) => {
      const taken = new Set(current.map((s, i) => (i === index ? null : s.promptId)));
      const start = catalogue.findIndex((p) => p.id === current[index].promptId);
      for (let step = 1; step <= catalogue.length; step++) {
        const candidate = catalogue[(start + step + catalogue.length) % catalogue.length];
        if (candidate && !taken.has(candidate.id)) {
          return current.map((s, i) => (i === index ? { ...s, promptId: candidate.id } : s));
        }
      }
      return current;
    });
  }

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Your name is the one thing people see first.');
      return;
    }
    if (trimmed === PLACEHOLDER_NAME) {
      setError('That is the placeholder the app starts you with. Use your own name.');
      return;
    }
    if (age === null) {
      setError('Your date of birth is missing, so your age cannot be shown.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await updateMyProfile({ name: trimmed, age, jobTitle, location, bio, interests, emoji });
      await saveMyPrompts(
        slots
          .filter((s) => s.promptId !== null)
          .map((s) => ({ promptId: s.promptId as number, answer: s.answer })),
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const field = {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.border,
    color: theme.text,
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      {header}

      <Section title="HOW YOU APPEAR">
        <View style={styles.photoRow}>
          <ProfilePhoto emoji={emoji} photoUrl={photoUrl} name={name || '?'} size={44} style={styles.photo} />
          <View style={styles.photoActions}>
            <PressableScale
              onPress={() => {
                pickPhoto().catch(() => {});
              }}
              disabled={photoBusy}
              accessibilityRole="button"
              accessibilityLabel={photoUrl ? 'Change your photo' : 'Add a photo'}
              accessibilityState={{ disabled: photoBusy }}
              style={[styles.photoButton, { backgroundColor: theme.accent, opacity: photoBusy ? 0.6 : 1 }]}>
              {photoBusy ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                  {photoUrl ? 'Change photo' : 'Add a photo'}
                </ThemedText>
              )}
            </PressableScale>
            {photoUrl ? (
              <PressableScale
                onPress={() => {
                  dropPhoto().catch(() => {});
                }}
                disabled={photoBusy}
                accessibilityRole="button"
                accessibilityLabel="Remove your photo"
                style={styles.photoRemove}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Remove
                </ThemedText>
              </PressableScale>
            ) : null}
          </View>
        </View>

        <View style={styles.emojiRow}>
          {EMOJI_CHOICES.map((choice) => (
            <PressableScale
              key={choice}
              onPress={() => setEmoji(choice)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${choice} as your picture`}
              accessibilityState={{ selected: emoji === choice }}
              style={[
                styles.emoji,
                {
                  backgroundColor: emoji === choice ? theme.accentPale : theme.backgroundElement,
                  borderColor: emoji === choice ? theme.accent : theme.border,
                },
              ]}>
              <ThemedText style={styles.emojiGlyph}>{choice}</ThemedText>
            </PressableScale>
          ))}
        </View>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {photoUrl
            ? 'Your emoji shows anywhere the photo has not loaded.'
            : 'Without a photo, this emoji is what people see.'}
        </ThemedText>
      </Section>

      <Section title="ABOUT YOU">
        <Labelled label="Name">
          <TextInput
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError(null);
            }}
            placeholder="Your first name"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Your name"
            maxLength={40}
            style={[styles.input, field]}
          />
        </Labelled>

        <Labelled label="Age">
          <View style={[styles.input, styles.readonly, { borderColor: theme.border }]}>
            <ThemedText style={{ color: theme.textSecondary }}>
              {age === null ? 'Not set' : `${age} — from the date of birth you gave`}
            </ThemedText>
          </View>
        </Labelled>

        <Labelled label="What you do">
          <TextInput
            value={jobTitle}
            onChangeText={setJobTitle}
            placeholder="Graphic designer"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="What you do"
            style={[styles.input, field]}
          />
        </Labelled>

        <Labelled label="Neighbourhood">
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Indiranagar"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Your neighbourhood"
            style={[styles.input, field]}
          />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Shown as written. Distance is worked out separately and only ever shown roughly.
          </ThemedText>
        </Labelled>

        <Labelled label="Bio">
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="What should someone know before they swipe?"
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={500}
            accessibilityLabel="Your bio"
            style={[styles.input, styles.bio, field]}
          />
        </Labelled>
      </Section>

      <Section title={`INTERESTS — PICK UP TO ${MAX_INTERESTS}`}>
        <View style={styles.chips}>
          {INTEREST_CHOICES.map((choice) => {
            const on = interests.includes(choice);
            return (
              <PressableScale
                key={choice}
                onPress={() => toggleInterest(choice)}
                accessibilityRole="button"
                accessibilityLabel={choice}
                accessibilityState={{ selected: on }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? theme.accent : 'transparent',
                    borderColor: on ? theme.accent : theme.border,
                  },
                ]}>
                <ThemedText
                  type="small"
                  style={{ color: on ? theme.onAccent : theme.textSecondary }}>
                  {choice}
                </ThemedText>
              </PressableScale>
            );
          })}
        </View>
      </Section>

      {catalogue.length > 0 ? (
        <Section title="PROMPTS">
          {slots.map((slot, index) => {
            const question = catalogue.find((p) => p.id === slot.promptId)?.question ?? '';
            return (
              <View
                key={index}
                style={[styles.prompt, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <View style={styles.promptHead}>
                  <ThemedText type="smallBold" style={{ color: theme.accent, flex: 1 }}>
                    {question}
                  </ThemedText>
                  <PressableScale
                    onPress={() => cycleQuestion(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Change question ${index + 1}`}
                    style={styles.change}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      Change
                    </ThemedText>
                  </PressableScale>
                </View>
                <TextInput
                  value={slot.answer}
                  onChangeText={(text) =>
                    setSlots((c) => c.map((s, i) => (i === index ? { ...s, answer: text } : s)))
                  }
                  placeholder="Your answer"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  maxLength={240}
                  accessibilityLabel={`Answer for ${question}`}
                  style={[styles.input, styles.promptInput, field]}
                />
              </View>
            );
          })}
        </Section>
      ) : null}

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}

      <PressableScale
        onPress={() => {
          save().catch(() => {});
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: busy }}
        style={[styles.save, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}>
        {busy ? (
          <ActivityIndicator color={theme.onAccent} />
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.onAccent, fontFamily: Fonts.rounded, fontSize: 16 }}>
            {submitLabel}
          </ThemedText>
        )}
      </PressableScale>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</ThemedText>
      {children}
    </View>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.labelled}>
      <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  sectionTitle: { fontFamily: Fonts.rounded, fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  labelled: { gap: Spacing.one },
  input: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontFamily: Fonts.rounded,
    fontSize: 16,
  },
  readonly: { justifyContent: 'center' },
  bio: { minHeight: 110, textAlignVertical: 'top' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  photo: { width: 96, height: 96, borderRadius: Radius.lg },
  photoActions: { gap: Spacing.one, flex: 1 },
  photoButton: {
    minHeight: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  photoRemove: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  emoji: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: { fontSize: 26, lineHeight: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  prompt: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.two, gap: Spacing.one },
  promptHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  change: { minHeight: 36, paddingHorizontal: Spacing.two, justifyContent: 'center' },
  promptInput: { minHeight: 70, textAlignVertical: 'top' },
  save: {
    minHeight: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
