import { useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { colors, fontFamilyForText, sharedStyles } from './theme';
import { Language } from './translation';
import { GuestSection, GuestTranslationKey, translateGuest } from './guestTranslations';

export type GuestComplaint = {
  name: string;
  email: string;
  phone: string;
  location: string;
  details: string;
  reference: string;
};

type GuestServicesProps = {
  section: GuestSection;
  language: Language;
  onNavigate: (section: GuestSection) => void;
  onSignIn: () => void;
  onSubmit: (complaint: GuestComplaint) => void;
};

const questions = [
  ['faqBillQuestion', 'faqBillAnswer'],
  ['faqConnectionQuestion', 'faqConnectionAnswer'],
  ['faqComplaintQuestion', 'faqComplaintAnswer'],
  ['faqGuestQuestion', 'faqGuestAnswer'],
  ['faqStatusQuestion', 'faqStatusAnswer'],
] as const;

export default function GuestServices({
  section,
  language,
  onNavigate,
  onSignIn,
  onSubmit,
}: GuestServicesProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [successReference, setSuccessReference] = useState('');

  const t = (key: GuestTranslationKey) => translateGuest(language, key);
  const label = (content: string, style?: object, bold = false) => (
    <Text style={[styles.text, { fontFamily: fontFamilyForText(content, bold, language) }, style]}>{content}</Text>
  );

  const useCurrentLocation = async () => {
    try {
      if (Platform.OS === 'web') {
        if (!globalThis.navigator?.geolocation) {
          setError(t('locationPermissionError'));
          return;
        }
        globalThis.navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            setLocation(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
            setError('');
          },
          () => setError(t('locationPermissionError')),
          { enableHighAccuracy: true, timeout: 12000 },
        );
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError(t('locationPermissionError'));
        return;
      }
      const coords = await Location.getCurrentPositionAsync({});
      setLocation(`${coords.coords.latitude.toFixed(5)}, ${coords.coords.longitude.toFixed(5)}`);
      setError('');
    } catch {
      setError(t('locationPermissionError'));
    }
  };

  const submit = () => {
    setError('');
    if (!name.trim() || !email.trim() || !phone.trim() || !location.trim() || !details.trim()) {
      setError(t('requiredError'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('emailError'));
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      setError(t('phoneError'));
      return;
    }
    if (details.trim().length < 12) {
      setError(t('detailError'));
      return;
    }

    const reference = `CWASA-GST-${Date.now().toString().slice(-8)}`;
    setSuccessReference(reference);
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
      details: details.trim(),
      reference,
    });
  };

  const link = (title: string, destination: GuestSection) => (
    <Pressable onPress={() => onNavigate(destination)} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
      {label(title, styles.linkText)}
      {label('›', styles.linkText)}
    </Pressable>
  );

  const field = (
    key: GuestTranslationKey,
    value: string,
    onChangeText: (text: string) => void,
    options: { placeholder?: GuestTranslationKey; multiline?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad' } = {},
  ) => (
    <View style={styles.field}>
      {label(t(key), styles.fieldLabel, true)}
      <TextInput
        accessibilityLabel={t(key)}
        value={value}
        onChangeText={onChangeText}
        placeholder={options.placeholder ? t(options.placeholder) : undefined}
        placeholderTextColor={colors.muted}
        keyboardType={options.keyboardType ?? 'default'}
        autoCapitalize={key === 'email' ? 'none' : 'sentences'}
        multiline={options.multiline}
        textAlignVertical={options.multiline ? 'top' : 'center'}
        style={[sharedStyles.input, options.multiline && styles.multiline, { fontFamily: fontFamilyForText(value || (options.placeholder ? t(options.placeholder) : t(key)), false, language), fontSize: 14 }]}
      />
    </View>
  );

  if (section === 'home') {
    return (
      <View>
        <View style={styles.hero}>
          {label(t('publicServices'), styles.eyebrow)}
          {label(t('guestWelcome'), styles.heroTitle, true)}
          {label(t('guestDescription'), styles.heroDescription)}
        </View>
        <Pressable onPress={() => onNavigate('about')} style={styles.choiceCard}>
          <View style={[styles.choiceIcon, { backgroundColor: colors.paleBlue }]}>{label('i', styles.choiceIconBlue, true)}</View>
          <View style={styles.choiceContent}>{label(t('aboutUs'), styles.choiceTitle, true)}{label(t('aboutIntro'), styles.choiceDescription)}</View>
          {label('›', styles.choiceArrow)}
        </Pressable>
        <Pressable onPress={() => onNavigate('faq')} style={styles.choiceCard}>
          <View style={[styles.choiceIcon, { backgroundColor: colors.paleGreen }]}>{label('?', styles.choiceIconGreen, true)}</View>
          <View style={styles.choiceContent}>{label(t('faq'), styles.choiceTitle, true)}{label(t('faqIntro'), styles.choiceDescription)}</View>
          {label('›', styles.choiceArrow)}
        </Pressable>
        <Pressable onPress={() => onNavigate('complaint')} style={styles.choiceCard}>
          <View style={[styles.choiceIcon, { backgroundColor: colors.paleAmber }]}>{label('!', styles.choiceIconAmber, true)}</View>
          <View style={styles.choiceContent}>{label(t('registerComplaint'), styles.choiceTitle, true)}{label(t('complaintIntro'), styles.choiceDescription)}</View>
          {label('›', styles.choiceArrow)}
        </Pressable>
        <Pressable onPress={onSignIn} style={styles.signInHint}>{label(t('accountAccess'), styles.signInText)}</Pressable>
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={() => onNavigate('home')} style={styles.backButton}>{label(`‹  ${t('back')}`, styles.linkText)}</Pressable>
      {section === 'about' ? (
        <View>
          <View style={styles.hero}>
            {label(t('publicServices'), styles.eyebrow)}
            {label(t('aboutUs'), styles.heroTitle, true)}
            {label(t('aboutIntro'), styles.heroDescription)}
          </View>
          <View style={styles.infoCard}>
            {label(t('aboutMissionTitle'), styles.cardTitle, true)}
            {label(t('aboutMission'), styles.bodyText)}
          </View>
          <View style={styles.infoCard}>
            {label(t('aboutServicesTitle'), styles.cardTitle, true)}
            {label(t('aboutServices'), styles.bodyText)}
          </View>
          <View style={styles.infoCard}>
            {label(t('contactTitle'), styles.cardTitle, true)}
            {label(t('contactDetails'), styles.bodyText)}
            <Pressable onPress={() => Linking.openURL('tel:16129').catch(() => setError(t('locationPermissionError')))} style={styles.callButton}>
              {label('16129  ·  ' + (language === 'bn' ? 'কল করুন' : 'Call CWASA'), styles.callButtonText, true)}
            </Pressable>
          </View>
          {link(t('faq'), 'faq')}
          {link(t('registerComplaint'), 'complaint')}
        </View>
      ) : null}
      {section === 'faq' ? (
        <View>
          <View style={styles.hero}>
            {label(t('publicServices'), styles.eyebrow)}
            {label(t('faq'), styles.heroTitle, true)}
            {label(t('faqIntro'), styles.heroDescription)}
          </View>
          {questions.map(([question, answer], index) => (
            <Pressable key={question} onPress={() => setExpandedFaq((current) => current === index ? null : index)} style={styles.faqCard}>
              <View style={styles.faqQuestionRow}>{label(t(question), styles.faqQuestion, true)}{label(expandedFaq === index ? '−' : '+', styles.faqToggle)}</View>
              {expandedFaq === index ? label(t(answer), styles.faqAnswer) : null}
            </Pressable>
          ))}
          {link(t('aboutUs'), 'about')}
          {link(t('registerComplaint'), 'complaint')}
        </View>
      ) : null}
      {section === 'complaint' ? (
        <View>
          <View style={styles.hero}>
            {label(t('publicServices'), styles.eyebrow)}
            {label(successReference ? t('complaintReceived') : t('registerComplaint'), styles.heroTitle, true)}
            {label(successReference ? t('receivedDescription') : t('complaintIntro'), styles.heroDescription)}
          </View>
          {successReference ? (
            <View style={styles.infoCard}>
              {label(t('reference'), styles.cardTitle, true)}
              {label(successReference, styles.reference)}
              {label(t('guestDemoNote'), styles.demoNote)}
              <Pressable onPress={() => {
                setName('');
                setEmail('');
                setPhone('');
                setLocation('');
                setDetails('');
                setSuccessReference('');
                setError('');
              }} style={styles.submitButton}>
                {label(t('submitAnother'), styles.submitText, true)}
              </Pressable>
            </View>
          ) : (
            <View style={styles.formCard}>
              {field('name', name, setName, { placeholder: 'namePlaceholder' })}
              {field('email', email, setEmail, { placeholder: 'emailPlaceholder', keyboardType: 'email-address' })}
              {field('phone', phone, setPhone, { placeholder: 'phonePlaceholder', keyboardType: 'phone-pad' })}
              {field('location', location, setLocation, { placeholder: 'locationPlaceholder' })}
              <Pressable onPress={useCurrentLocation} style={styles.locationButton}>
                {label(`⌖  ${t('useCurrentLocation')}`, styles.locationButtonText)}
              </Pressable>
              {field('details', details, setDetails, { placeholder: 'detailsPlaceholder', multiline: true })}
              {error ? label(error, styles.errorText) : null}
              {label(t('guestDemoNote'), styles.demoNote)}
              <Pressable onPress={submit} style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]}>
                {label(t('submitComplaint'), styles.submitText, true)}
              </Pressable>
            </View>
          )}
          {link(t('faq'), 'faq')}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.ink, fontSize: 14 },
  hero: { backgroundColor: colors.blue, padding: 20, borderRadius: 18, marginBottom: 14 },
  eyebrow: { color: '#D9E9FF', fontSize: 11, marginBottom: 6 },
  heroTitle: { color: colors.white, fontSize: 23, marginBottom: 7 },
  heroDescription: { color: '#E7F1FF', fontSize: 13, lineHeight: 20 },
  choiceCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 10 },
  choiceIcon: { width: 41, height: 41, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  choiceIconBlue: { color: colors.blue, fontSize: 20 },
  choiceIconGreen: { color: colors.green, fontSize: 20 },
  choiceIconAmber: { color: colors.amber, fontSize: 20 },
  choiceContent: { flex: 1 },
  choiceTitle: { fontSize: 15, marginBottom: 3 },
  choiceDescription: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  choiceArrow: { color: colors.blue, fontSize: 23 },
  signInHint: { alignItems: 'center', padding: 12 },
  signInText: { color: colors.blue, textAlign: 'center', fontSize: 12 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 4 },
  linkButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  linkText: { color: colors.blue, fontSize: 13 },
  infoCard: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 17, marginBottom: 11 },
  cardTitle: { fontSize: 16, marginBottom: 8 },
  bodyText: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  callButton: { backgroundColor: colors.paleBlue, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, alignSelf: 'flex-start', marginTop: 12 },
  callButtonText: { color: colors.blue, fontSize: 13 },
  faqCard: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 9 },
  faqQuestionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  faqQuestion: { flex: 1, fontSize: 14 },
  faqToggle: { color: colors.blue, fontSize: 21 },
  faqAnswer: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 11 },
  formCard: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 16, marginBottom: 12 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, marginBottom: 6 },
  multiline: { minHeight: 110, paddingTop: 12 },
  locationButton: { alignSelf: 'flex-start', paddingVertical: 7, marginTop: -8, marginBottom: 9 },
  locationButtonText: { color: colors.blue, fontSize: 12 },
  errorText: { color: colors.red, fontSize: 12, marginBottom: 9 },
  demoNote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginVertical: 6 },
  submitButton: { minHeight: 46, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 9 },
  submitText: { color: colors.white, fontSize: 14 },
  reference: { color: colors.blue, fontSize: 19, marginBottom: 8 },
  pressed: { opacity: 0.78 },
});
