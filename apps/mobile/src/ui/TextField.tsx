import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, space, type } from '../theme';
import { useTheme } from '../theme-context';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  secure,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  autoComplete?: 'email' | 'password' | 'off';
  editable?: boolean;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const invalid = !!error;

  return (
    <View style={styles.wrap}>
      <Text style={[type.label, { color: colors.ink, marginBottom: space[8] }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        style={[
          styles.input,
          type.bodyComfortable,
          {
            color: colors.ink,
            backgroundColor: colors.surface,
            borderColor: invalid ? colors.danger : focused ? colors.teal : colors.line,
          },
        ]}
      />
      {error ? (
        <Text style={[type.caption, { color: colors.danger, marginTop: space[4] }]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.caption, { color: colors.inkMuted, marginTop: space[4] }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space[16] },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: space[12],
    paddingVertical: space[12],
  },
});
