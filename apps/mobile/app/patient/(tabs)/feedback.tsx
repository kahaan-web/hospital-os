import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  fieldErrors,
  submitFeedbackSchema,
  type FeedbackCategory,
} from '@hos/shared';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError } from '../../../src/api';
import { useAuth } from '../../../src/auth';
import { copy } from '../../../src/copy';
import { radius, space, type } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';
import { Banner } from '../../../src/ui/Banner';
import { Button } from '../../../src/ui/Button';
import { isFocused, webFocusRing } from '../../../src/ui/focus';
import { Screen } from '../../../src/ui/Screen';
import { TextField } from '../../../src/ui/TextField';

export default function FeedbackScreen() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const location = me?.kind === 'tenant' ? me.locations.find((l) => l.id === me.currentLocationId)?.name : null;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [cats, setCats] = useState<FeedbackCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function toggle(c: FeedbackCategory) {
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function submit() {
    setError(null);
    setFields({});
    const parsed = submitFeedbackSchema.safeParse({ rating, comment, categories: cats });
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setFields(next);
      if (!next.rating && !next.comment) setError(Object.values(next)[0] ?? copy.checkForm);
      return;
    }
    setBusy(true);
    try {
      await api.submitFeedback(parsed.data);
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields ?? {});
        setError(e.fields ? null : e.message);
      } else {
        setError(copy.couldNotSaveFeedback);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={copy.feedback} locationName={location}>
      {done ? <Banner message={copy.feedbackSent} tone="info" /> : null}
      {error ? <Banner message={error} tone="danger" /> : null}
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.rating}</Text>
      <View style={{ flexDirection: 'row', gap: space[8], marginBottom: space[8] }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
            accessibilityRole="button"
            accessibilityLabel={copy.ratingOutOf5(n)}
            accessibilityState={{ selected: rating === n }}
            style={(state) => [
              {
                minWidth: 48,
                minHeight: 48,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: rating === n ? colors.teal : colors.line,
                backgroundColor: rating === n ? colors.tealSubtle : colors.surface,
                alignItems: 'center' as const,
                justifyContent: 'center' as const,
              },
              webFocusRing(colors.teal, isFocused(state)),
            ]}
          >
            <Text style={[type.label, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      {fields.rating ? (
        <Text style={[type.caption, { color: colors.danger, marginBottom: space[16] }]}>{fields.rating}</Text>
      ) : (
        <View style={{ marginBottom: space[8] }} />
      )}
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{copy.about}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8], marginBottom: space[16] }}>
        {FEEDBACK_CATEGORIES.map((c) => {
          const on = cats.includes(c);
          return (
            <Pressable
              key={c}
              onPress={() => toggle(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={FEEDBACK_CATEGORY_LABEL[c]}
              style={(state) => [
                {
                  minHeight: 48,
                  paddingHorizontal: space[12],
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: on ? colors.teal : colors.line,
                  backgroundColor: on ? colors.tealSubtle : colors.surface,
                  justifyContent: 'center' as const,
                },
                webFocusRing(colors.teal, isFocused(state)),
              ]}
            >
              <Text style={[type.caption, { color: colors.ink }]}>{FEEDBACK_CATEGORY_LABEL[c]}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextField
        label={copy.comment}
        value={comment}
        onChangeText={setComment}
        autoCapitalize="sentences"
        error={fields.comment}
      />
      <Button label={copy.sendFeedback} onPress={() => void submit()} loading={busy} disabled={done} />
    </Screen>
  );
}
