import { Platform, type ViewStyle } from 'react-native';

/** Visible 2px teal focus ring on web. No-op on native. */
export function webFocusRing(teal: string, focused: boolean): ViewStyle {
  if (Platform.OS !== 'web' || !focused) return {};
  return {
    // RN web accepts outline* though they are not in ViewStyle.
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: teal,
    outlineOffset: 2,
  } as ViewStyle;
}

export function isFocused(state: object): boolean {
  return 'focused' in state && (state as { focused?: boolean }).focused === true;
}
