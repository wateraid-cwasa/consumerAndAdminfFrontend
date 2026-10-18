import { StyleSheet } from 'react-native';
import type { Language } from './translation';

export const colors = {
  blue: '#0964C7',
  deepBlue: '#0754AA',
  paleBlue: '#EAF3FF',
  ink: '#172437',
  muted: '#718096',
  border: '#E5EAF1',
  background: '#F5F7FA',
  white: '#FFFFFF',
  green: '#138A5B',
  paleGreen: '#EAF7F1',
  amber: '#AD7600',
  paleAmber: '#FFF6DA',
  red: '#C64A50',
  paleRed: '#FFF0F0',
  purple: '#7758BD',
};

export const openSansRegular = {
  uri: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0C4n.ttf',
};

export function fontFamilyForText(text: string, bold: boolean, language: Language): string {
  const containsBangla = /[\u0980-\u09FF]/.test(text) || (!text && language === 'bn');
  if (containsBangla) return bold ? 'Shurjo-Bold' : 'Shurjo';
  return bold ? 'RBNylo-Bold' : 'OpenSans';
}

export const sharedStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 13,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 11,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
});
