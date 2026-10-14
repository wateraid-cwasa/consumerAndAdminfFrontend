import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { colors, sharedStyles } from './theme';
import { Language, TranslationKey, translate } from './translation';
import GuestServices, { GuestComplaint } from './GuestServices';
import { GuestSection, translateGuest } from './guestTranslations';
import MeterAdmin from './MeterAdmin';
import { getLatestApprovedReading, MeterReading, subscribeToMeterReadings } from './meterReadings';
import {
  requestCustomerOtp,
  verifyCustomerOtp,
  getStoredCustomerSession,
  getCustomerBills,
  signOutCustomer,
  ApiRequestError,
  ApiConnectionError,
  type CustomerSession,
  type BillHistoryEntry,
} from './consumerApi';

type Screen =
  | 'welcome'
  | 'sign-in'
  | 'verify'
  | 'home'
  | 'bill'
  | 'history'
  | 'new-connection'
  | 'application'
  | 'complaint-form'
  | 'complaints'
  | 'notifications'
  | 'support'
  | 'account'
  | 'public-services';

type NotificationItem = {
  id: number;
  title: string;
  detail: string;
  category: 'Bills' | 'Service' | 'Alerts';
  read: boolean;
  icon: string;
  color: string;
};

type Payment = {
  id: string;
  date: string;
  amount: number;
  method: string;
};

const initialNotifications: NotificationItem[] = [
  { id: 1, title: 'Field team is on the way', detail: 'Complaint CWASA-CMP-2026-1023 · ETA 13:30', category: 'Service', read: false, icon: '↗', color: colors.blue },
  { id: 2, title: 'May bill is ready', detail: '৳1,250 due 15 May 2026', category: 'Bills', read: false, icon: '৳', color: colors.purple },
  { id: 3, title: 'Site inspection confirmed', detail: 'Halishahar · Tomorrow at 10:00 AM', category: 'Service', read: true, icon: '✓', color: colors.green },
  { id: 4, title: 'Planned supply interruption', detail: 'Halishahar zone · 12 May, 10:00–14:00', category: 'Alerts', read: true, icon: '!', color: colors.red },
  { id: 5, title: 'OCR meter reading verified', detail: 'Your April meter reading has been confirmed', category: 'Bills', read: true, icon: '⌕', color: colors.amber },
  { id: 6, title: 'SMS fallback is on', detail: 'You will receive critical alerts if you are offline', category: 'Alerts', read: true, icon: '•', color: colors.blue },
];

const paymentMethods = ['bKash', 'Nagad', 'Debit / credit', 'Internet banking'];

function ActionButton({
  title,
  onPress,
  secondary = false,
  disabled = false,
  fontFamily = 'Shurjo',
  compact = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  fontFamily?: string;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        compact && styles.buttonCompact,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText, compact && styles.buttonCompactText, { fontFamily }]}>
        {title}
      </Text>
    </Pressable>
  );
}

function Chip({
  title,
  selected,
  onPress,
  fontFamily = 'Shurjo',
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
  fontFamily?: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected, { fontFamily }]}>{title}</Text>
    </Pressable>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Shurjo: require('./fonts/Shurjo-Regular.ttf'),
    'Shurjo-Bold': require('./fonts/Shurjo-bold.ttf'),
    'RBNylo-Bold': require('./fonts/RBNylo-Bold.otf'),
  });
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const [screen, setScreen] = useState<Screen>('welcome');
  const [isGuest, setIsGuest] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [guestSection, setGuestSection] = useState<GuestSection>('home');
  const [notice, setNotice] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(
    () => (Platform.OS === 'web' ? getStoredCustomerSession() : null),
  );
  const [customerBills, setCustomerBills] = useState<BillHistoryEntry[]>([]);
  const [authBusy, setAuthBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]);
  const [paymentPhone, setPaymentPhone] = useState('01712 345 678');
  const [payments, setPayments] = useState<Payment[]>([
    { id: 'CW-PAY-2604-1842', date: '20 Apr 2026', amount: 1200, method: 'bKash' },
    { id: 'CW-PAY-2603-0741', date: '21 Mar 2026', amount: 1150, method: 'Nagad' },
    { id: 'CW-PAY-2602-5520', date: '19 Feb 2026', amount: 1150, method: 'Debit / credit' },
  ]);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [notificationFilter, setNotificationFilter] = useState('All');
  const [applicationId, setApplicationId] = useState('CWASA-NC-2026-0488');
  const [complaintId, setComplaintId] = useState('CWASA-CMP-2026-1023');
  const [complaintType, setComplaintType] = useState<TranslationKey>('lowPressure');
  const [complaintDescription, setComplaintDescription] = useState('Pressure dropped to a trickle since Tuesday morning. It affects the upper floor of the building. Multiple neighbours also reporting.');
  const [complaintContact, setComplaintContact] = useState<TranslationKey>('inApp');
  const [connectionCategory, setConnectionCategory] = useState<TranslationKey>('domestic');
  const [connectionName, setConnectionName] = useState('Anika Rahman');
  const [holdingNumber, setHoldingNumber] = useState('HD-12/4-A · Halishahar');
  const [nationalId, setNationalId] = useState('');
  const [connectionEmail, setConnectionEmail] = useState('');
  const [propertyType, setPropertyType] = useState('Residential — single family');
  const [pipeDiameter, setPipeDiameter] = useState('¾″');
  const [siteLocation, setSiteLocation] = useState('Halishahar Block C, Lane 4');
  const [coordinates, setCoordinates] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [largeText, setLargeText] = useState(false);
  const [smsFallback, setSmsFallback] = useState(true);
  const [billFilter, setBillFilter] = useState<'due' | 'paid'>('due');
  const [profileEditing, setProfileEditing] = useState(false);
  const [applicationStage, setApplicationStage] = useState(2);
  const [applicationSummary, setApplicationSummary] = useState('New domestic connection');
  const [showPaymentConfirmation, setShowPaymentConfirmation] = useState(false);
  const [currentBillPaid, setCurrentBillPaid] = useState(false);
  const [latestApprovedReading, setLatestApprovedReading] = useState<MeterReading | undefined>(
    () => Platform.OS === 'web' ? getLatestApprovedReading('CW-2026-0488') : undefined,
  );
  const cameraRef = useRef<CameraView>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const t = useCallback((key: TranslationKey) => translate(language, key), [language]);
  const font = 'Shurjo';
  const fontBold = language === 'bn' ? 'Shurjo-Bold' : 'RBNylo-Bold';
  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);
  const meterConsumption = latestApprovedReading
    ? Math.max(0, latestApprovedReading.currentReading - latestApprovedReading.previousReading)
    : 1000;
  const realCurrentBill = customerBills[0]?.billTotal != null ? Number(customerBills[0].billTotal) : null;
  const currentBillAmount = realCurrentBill !== null && Number.isFinite(realCurrentBill)
    ? Math.round(realCurrentBill)
    : Math.max(50, Math.round(meterConsumption * 1.2 + 50));
  const displayAccountNo = customerSession?.accountNo ?? 'CW-2026-0488';

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return subscribeToMeterReadings(() => {
      setLatestApprovedReading(getLatestApprovedReading('CW-2026-0488'));
    });
  }, []);

  const loadCustomerBills = useCallback(async () => {
    try {
      const bills = await getCustomerBills();
      setCustomerBills(bills);
    } catch {
      // Keep showing the demo figures if the customer API is unreachable.
    }
  }, []);

  useEffect(() => {
    if (customerSession) {
      loadCustomerBills();
    }
  }, [customerSession, loadCustomerBills]);

  const showNotice = (message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(''), 4200);
  };

  const beginSignIn = () => {
    setIsGuest(false);
    setPhone('');
    setScreen('sign-in');
  };

  const enterGuestPortal = () => {
    setIsGuest(true);
    setGuestSection('home');
    setScreen('public-services');
  };

  const requestCode = async () => {
    if (!accountNumber.trim()) {
      showNotice('Enter your CWASA account number.');
      return;
    }
    if (!/^01\d{9}$/.test(phone.replace(/\D/g, ''))) {
      showNotice('Enter a valid 11-digit Bangladesh mobile number.');
      return;
    }
    setAuthBusy(true);
    try {
      const result = await requestCustomerOtp(accountNumber.trim(), phone.replace(/\D/g, ''));
      setScreen('verify');
      showNotice(
        result.devOtp
          ? `Dev mode: your code is ${result.devOtp} (no SMS gateway configured yet).`
          : 'A verification code has been sent.',
      );
    } catch (error) {
      if (error instanceof ApiConnectionError) {
        showNotice('Could not reach the CWASA server.');
      } else if (error instanceof ApiRequestError && error.status === 404) {
        showNotice('That account number and mobile number do not match.');
      } else {
        showNotice('Could not send a code. Please try again.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(otp)) {
      showNotice('Enter the 6-digit verification code.');
      return;
    }
    setAuthBusy(true);
    try {
      const session = await verifyCustomerOtp(accountNumber.trim(), otp);
      setCustomerSession(session);
      setIsGuest(false);
      setScreen('home');
      showNotice(t('welcomeBack'));
    } catch (error) {
      if (error instanceof ApiConnectionError) {
        showNotice('Could not reach the CWASA server.');
      } else if (error instanceof ApiRequestError && error.status === 401) {
        showNotice('That code is incorrect or has expired.');
      } else {
        showNotice('Could not verify the code. Please try again.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const completePayment = () => {
    if (paymentPhone.replace(/\D/g, '').length < 10) {
      showNotice(language === 'bn' ? 'পেমেন্টের জন্য সঠিক মোবাইল নম্বর লিখুন।' : 'Enter a valid mobile number for payment.');
      return;
    }
    const payment: Payment = {
      id: `CW-PAY-${Date.now().toString().slice(-8)}`,
      date: new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()),
      amount: currentBillAmount,
      method: paymentMethod,
    };
    setPayments((current) => [payment, ...current]);
    setCurrentBillPaid(true);
    setShowPaymentConfirmation(true);
  };

  const captureLocation = async () => {
    try {
      if (Platform.OS === 'web') {
        if (!globalThis.navigator?.geolocation) {
          showNotice(language === 'bn' ? 'এই ব্রাউজারে অবস্থান সুবিধা নেই।' : 'Location is not available in this browser.');
          return;
        }
        globalThis.navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            setCoordinates(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
            setSiteLocation(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
            showNotice(t('locationCaptured'));
          },
          (error) => showNotice(error.message || t('permissionNeeded')),
          { enableHighAccuracy: true, timeout: 12000 },
        );
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        showNotice(t('permissionNeeded'));
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const point = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
      setCoordinates(point);
      setSiteLocation(point);
      showNotice(t('locationCaptured'));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not get your location.');
    }
  };

  const openCamera = async () => {
    try {
      if (cameraPermission?.granted) {
        setCameraOpen(true);
        return;
      }
      const permission = await requestCameraPermission();
      if (permission.granted) setCameraOpen(true);
      else showNotice(t('permissionNeeded'));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not request camera permission.');
    }
  };

  const capturePhoto = async () => {
    try {
      const image = await cameraRef.current?.takePictureAsync({ quality: 0.65 });
      if (image?.uri) {
        setPhotoUri(image.uri);
        setCameraOpen(false);
        showNotice(language === 'bn' ? 'ছবির প্রমাণ যোগ করা হয়েছে।' : 'Photo evidence attached.');
      }
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not capture photo.');
    }
  };

  const submitNewApplication = () => {
    const nationalIdLength = nationalId.replace(/\D/g, '').length;
    if (!connectionName.trim() || !holdingNumber.trim() || ![10, 13, 17].includes(nationalIdLength) || (connectionEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(connectionEmail))) {
      showNotice(language === 'bn' ? 'নাম, হোল্ডিং নম্বর, সঠিক জাতীয় পরিচয়পত্র এবং প্রযোজ্য হলে ইমেইল ঠিকানা লিখুন।' : 'Enter your name, holding number, a valid National ID, and a valid email if provided.');
      return;
    }
    setApplicationId(`CWASA-NC-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    setApplicationSummary(`${t(connectionCategory)} · ${propertyType} · ${pipeDiameter} · ${siteLocation}`);
    setApplicationStage(1);
    setScreen('application');
    showNotice(t('applicationSubmitted'));
  };

  const submitComplaint = () => {
    if (complaintDescription.trim().length < 12) {
      showNotice(language === 'bn' ? 'সমস্যাটি সম্পর্কে আরও কিছু লিখুন।' : 'Please provide a little more detail about the issue.');
      return;
    }
    const newComplaintId = `CWASA-CMP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    setComplaintId(newComplaintId);
    setScreen('complaints');
    setNotifications((current) => [{
      id: Date.now(),
      title: 'Complaint submitted',
      detail: `Your request ${newComplaintId} has been received`,
      category: 'Service',
      read: false,
      icon: '✓',
      color: colors.green,
    }, ...current]);
    showNotice(t('complaintSubmitted'));
  };

  const markAllRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    showNotice(language === 'bn' ? 'সব বিজ্ঞপ্তি পড়া হয়েছে।' : 'All notifications marked as read.');
  };

  const openPublicServices = (section: GuestSection = 'home') => {
    setGuestSection(section);
    setScreen('public-services');
  };

  const registerGuestComplaint = (complaint: GuestComplaint) => {
    setNotifications((current) => [{
      id: Date.now(),
      title: translateGuest(language, 'complaintReceived'),
      detail: `${complaint.reference} · ${complaint.name} · ${complaint.location}`,
      category: 'Service',
      read: false,
      icon: '!',
      color: colors.blue,
    }, ...current]);
    showNotice(`${translateGuest(language, 'complaintReceived')}: ${complaint.reference}`);
  };

  const exportHistory = () => {
    if (Platform.OS !== 'web') {
      showNotice(language === 'bn' ? 'লেনদেনের ইতিহাস প্রস্তুত।' : 'Your transaction history is ready.');
      return;
    }
    const csv = ['Reference,Date,Amount (BDT),Method', ...payments.map((item) => `${item.id},${item.date},${item.amount},${item.method}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cwasa-payment-history.csv';
    anchor.click();
    URL.revokeObjectURL(url);
    showNotice(language === 'bn' ? 'পেমেন্টের ইতিহাস ডাউনলোড হয়েছে।' : 'Payment history downloaded.');
  };

  if (!fontsLoaded) {
    return <View style={styles.loading}><Text style={styles.loadingText}>CWASA</Text></View>;
  }

  const TextLabel = ({ children, style, bold = false }: { children: React.ReactNode; style?: object; bold?: boolean }) => (
    <Text style={[
      styles.text,
      { fontFamily: bold ? fontBold : font, fontSize: largeText ? 17 : 14 },
      style,
    ]}>
      {children}
    </Text>
  );

  const Field = ({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    multiline = false,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
    multiline?: boolean;
  }) => (
    <View style={styles.field}>
      <TextLabel style={styles.fieldLabel}>{label}</TextLabel>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[sharedStyles.input, multiline && styles.multilineInput, { fontFamily: font, fontSize: largeText ? 17 : 14 }]}
      />
    </View>
  );

  const Heading = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <View style={styles.heading}>
      <TextLabel bold style={styles.headingTitle}>{title}</TextLabel>
      {subtitle ? <TextLabel style={styles.headingSubtitle}>{subtitle}</TextLabel> : null}
    </View>
  );

  const SectionTitle = ({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) => (
    <View style={styles.sectionTitleRow}>
      <TextLabel bold style={styles.sectionTitle}>{title}</TextLabel>
      {action && onAction ? <Pressable onPress={onAction}><TextLabel style={styles.linkText}>{action}</TextLabel></Pressable> : null}
    </View>
  );

  const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => (
    <View style={[sharedStyles.card, style]}>{children}</View>
  );

  const LinkAction = ({ title, onPress }: { title: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={styles.inlineLink}><TextLabel style={styles.linkText}>{title}</TextLabel><TextLabel style={styles.linkText}>›</TextLabel></Pressable>
  );

  const OptionChips = ({ options, selected, onSelect }: { options: TranslationKey[]; selected: TranslationKey; onSelect: (key: TranslationKey) => void }) => (
    <View style={styles.chipWrap}>
      {options.map((option) => <Chip key={option} title={t(option)} selected={selected === option} onPress={() => onSelect(option)} fontFamily={font} />)}
    </View>
  );

  const header = (
    <View style={[styles.header, wide && styles.headerWide]}>
      <Pressable onPress={() => setScreen('home')} accessibilityLabel={t('home')}>
        <Image source={require('./assets/cwasa-logo.png')} style={styles.headerLogo} resizeMode="contain" />
      </Pressable>
      <View style={styles.brandText}>
        <TextLabel bold style={styles.brandName}>CHATTOGRAM WASA</TextLabel>
        <TextLabel style={styles.brandSub}>WaterAid Bangladesh</TextLabel>
      </View>
      <View style={styles.headerActions}>
        <Pressable onPress={() => openPublicServices()} style={styles.publicInfoButton} accessibilityLabel={translateGuest(language, 'publicServices')}>
          <TextLabel style={styles.publicInfoText}>ⓘ</TextLabel>
        </Pressable>
        <Pressable onPress={() => setLanguage((current) => current === 'en' ? 'bn' : 'en')} style={styles.languageButton} accessibilityLabel={t('language')}>
          <TextLabel style={styles.languageText}>{language === 'en' ? 'বাং' : 'EN'}</TextLabel>
        </Pressable>
        <Pressable onPress={() => setScreen('notifications')} style={styles.notificationButton} accessibilityLabel={t('notifications')}>
          <TextLabel style={styles.notificationIcon}>🕭</TextLabel>
          {unreadCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.badgeText}>{unreadCount}</Text></View> : null}
        </Pressable>
      </View>
    </View>
  );

  const bottomNav = (
    <View style={styles.bottomNav}>
      {([
        ['home', '⌂', t('home')],
        ['history', '◷', t('history')],
        ['support', '◎', t('support')],
        ['account', '♙', t('account')],
      ] as [Screen, string, string][]).map(([target, icon, label]) => (
        <Pressable key={target} onPress={() => setScreen(target)} style={styles.navItem} accessibilityRole="tab" accessibilityState={{ selected: screen === target }}>
          <TextLabel style={[styles.navIcon, (screen === target || (target === 'support' && ['complaint-form', 'complaints', 'new-connection', 'application'].includes(screen))) && styles.navSelected]}>{icon}</TextLabel>
          <TextLabel style={[styles.navLabel, (screen === target || (target === 'support' && ['complaint-form', 'complaints', 'new-connection', 'application'].includes(screen))) && styles.navSelected]}>{label}</TextLabel>
        </Pressable>
      ))}
    </View>
  );

  const serviceTiles: { title: TranslationKey; icon: string; color: string; screen: Screen }[] = [
    { title: 'payBills', icon: '৳', color: colors.blue, screen: 'bill' },
    { title: 'paymentHistory', icon: '◷', color: colors.amber, screen: 'history' },
    { title: 'newConnection', icon: '＋', color: colors.green, screen: 'new-connection' },
    { title: 'submitComplaint', icon: '☷', color: colors.red, screen: 'complaint-form' },
    { title: 'trackApplication', icon: '⌕', color: colors.purple, screen: 'application' },
    { title: 'trackApplication', icon: '▤', color: colors.blue, screen: 'notifications' },
  ];

  const screenContent = (() => {
    switch (screen) {
      case 'welcome':
        return (
          <View style={styles.welcomeScreen}>
            <View style={styles.welcomeBrand}>
              <Image source={require('./assets/cwasa-logo.png')} style={styles.welcomeLogo} resizeMode="contain" />
              <TextLabel style={styles.welcomeTo}>{t('welcome')}</TextLabel>
              <TextLabel bold style={styles.welcomeTitle}>Chattogram WASA</TextLabel>
              <TextLabel style={styles.welcomeSub}>{t('platform')}</TextLabel>
            </View>
            <View style={styles.welcomeActions}>
              <ActionButton title={t('continueWithMobile')} onPress={beginSignIn} fontFamily={font} />
              <ActionButton title={t('exploreGuest')} onPress={enterGuestPortal} secondary fontFamily={font} />
            </View>
          </View>
        );
      case 'sign-in':
        return (
          <View style={styles.formScreen}>
            <Heading title={t('continueWithMobile')} subtitle="Sign in to manage your CWASA services." />
            <Card>
              <Field label="Account number" value={accountNumber} onChangeText={setAccountNumber} placeholder="CW-2026-0488" />
              <Field label={t('phoneNumber')} value={phone} onChangeText={setPhone} placeholder="01XXXXXXXXX" keyboardType="phone-pad" />
              <ActionButton title={authBusy ? '...' : t('sendCode')} onPress={requestCode} fontFamily={font} />
            </Card>
            <LinkAction title={t('exploreGuest')} onPress={enterGuestPortal} />
            <ActionButton title={t('back')} onPress={() => setScreen('welcome')} secondary fontFamily={font} />
          </View>
        );
      case 'verify':
        return (
          <View style={styles.formScreen}>
            <Heading title={t('verification')} subtitle={`Code sent to ${phone}.`} />
            <Card>
              <Field label={t('verification')} value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" keyboardType="numeric" />
              <TextLabel style={styles.helperText}>Enter the 6-digit code to continue.</TextLabel>
              <ActionButton title={authBusy ? '...' : t('verify')} onPress={verifyCode} fontFamily={font} />
            </Card>
            <Pressable onPress={requestCode}><TextLabel style={styles.linkText}>Resend code</TextLabel></Pressable>
          </View>
        );
      case 'home':
        return (
          <View>
            <Heading title={`${t('welcomeBack')}, Anika`} subtitle="Water services, made simple." />
            <View style={[styles.dashboardRow, wide && styles.dashboardRowWide]}>
              <View style={[styles.billHero, wide && styles.billHeroWide]}>
                <View style={styles.heroTop}><TextLabel style={styles.heroEyebrow}>{t('currentBill')}</TextLabel><TextLabel style={styles.heroTag}>{t(currentBillPaid ? 'paid' : 'pending')}</TextLabel></View>
                <TextLabel bold style={styles.heroAmount}>{currentBillPaid ? '৳ 0' : `৳ ${currentBillAmount.toLocaleString()}`}</TextLabel>
                <TextLabel style={styles.heroDue}>{currentBillPaid ? 'Paid in full' : `Due 15 May 2026 · ${t('dueIn')}`}</TextLabel>
                <View style={styles.heroBottom}>
                  <TextLabel style={styles.heroAccount}>Account {displayAccountNo}</TextLabel>
                  <ActionButton title={currentBillPaid ? t('transactionHistory') : t('payNow')} onPress={() => { if (currentBillPaid) setScreen('history'); else setScreen('bill'); }} fontFamily={font} compact />
                </View>
              </View>
              <View style={[styles.serviceGrid, wide && styles.serviceGridWide]}>
                <SectionTitle title={t('services')} />
                <View style={styles.tileGrid}>
                  {serviceTiles.slice(0, 4).map((tile) => (
                    <Pressable key={tile.title} onPress={() => setScreen(tile.screen)} style={styles.serviceTile}>
                      <View style={[styles.tileIcon, { backgroundColor: `${tile.color}15` }]}><TextLabel bold style={{ color: tile.color, fontSize: 20 }}>{tile.icon}</TextLabel></View>
                      <TextLabel style={styles.tileLabel}>{t(tile.title)}</TextLabel>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            {latestApprovedReading ? (
              <Card style={styles.meterReadingCard}>
                <View style={styles.rowBetween}>
                  <TextLabel bold>{t('latestMeterReading')}</TextLabel>
                  <TextLabel style={styles.paidPill}>{t('approvedReading')}</TextLabel>
                </View>
                <TextLabel style={styles.helperText}>{latestApprovedReading.readingDate} · Meter {latestApprovedReading.meterNumber}</TextLabel>
                <View style={styles.meterReadingValues}>
                  <View><TextLabel style={styles.helperText}>{t('previousReading')}</TextLabel><TextLabel bold>{latestApprovedReading.previousReading.toLocaleString()} m³</TextLabel></View>
                  <TextLabel style={styles.readingArrow}>→</TextLabel>
                  <View><TextLabel style={styles.helperText}>{t('currentReading')}</TextLabel><TextLabel bold>{latestApprovedReading.currentReading.toLocaleString()} m³</TextLabel></View>
                  <View style={styles.consumptionValue}><TextLabel style={styles.helperText}>{t('consumption')}</TextLabel><TextLabel bold style={styles.totalValue}>{meterConsumption.toLocaleString()} m³</TextLabel></View>
                </View>
              </Card>
            ) : null}
            <Card style={styles.quickHelp}>
              <View style={styles.quickHelpText}>
                <TextLabel bold>{t('quickHelp')}</TextLabel>
                <TextLabel style={styles.helperText}>Call our customer service team any time.</TextLabel>
              </View>
              <ActionButton title={t('hotline')} onPress={() => Linking.openURL('tel:16129').catch((error) => showNotice(error.message))} secondary fontFamily={font} compact />
            </Card>
            <SectionTitle title={t('trackApplication')} action="See all" onAction={() => setScreen('application')} />
            <Card style={styles.applicationPreview}>
              <View style={styles.rowBetween}><TextLabel bold>{applicationId}</TextLabel><TextLabel style={styles.statusPill}>{t('inProgress')}</TextLabel></View>
              <TextLabel style={styles.helperText}>{applicationSummary} · Submitted 10 May 2026</TextLabel>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${applicationStage * 25}%` }]} /></View>
              <LinkAction title={t('trackApplication')} onPress={() => setScreen('application')} />
            </Card>
          </View>
        );
      case 'bill':
        return showPaymentConfirmation ? (
          <View style={styles.formScreen}>
            <View style={styles.successMark}><TextLabel bold style={styles.successCheck}>✓</TextLabel></View>
            <Heading title={t('paymentSuccess')} subtitle={language === 'bn' ? 'ডেমো — কোনো অর্থ নেওয়া হয়নি। পেমেন্ট সেবা সংযুক্ত হলে প্রকৃত লেনদেন হবে।' : 'Demo only — no money was charged. Connect a payment provider for real transactions.'} />
            <Card>
              <View style={styles.rowBetween}><TextLabel style={styles.helperText}>{t('paymentReference')}</TextLabel><TextLabel bold>{payments[0]?.id}</TextLabel></View>
              <View style={styles.separator} />
              <View style={styles.rowBetween}><TextLabel>{t('totalPayable')}</TextLabel><TextLabel bold style={styles.totalValue}>৳{payments[0]?.amount.toLocaleString() ?? currentBillAmount.toLocaleString()}</TextLabel></View>
              <View style={styles.rowBetween}><TextLabel style={styles.helperText}>{t('paymentMethod')}</TextLabel><TextLabel>{paymentMethod}</TextLabel></View>
            </Card>
            <ActionButton title={t('transactionHistory')} onPress={() => { setShowPaymentConfirmation(false); setScreen('history'); }} fontFamily={font} />
            <ActionButton title={t('home')} onPress={() => { setShowPaymentConfirmation(false); setScreen('home'); }} secondary fontFamily={font} />
          </View>
        ) : (
          <View>
            <Heading title={t('billDetails')} subtitle={`Chattogram WASA · Account ${displayAccountNo}`} />
            <View style={styles.billTabs}>
              <Pressable onPress={() => setBillFilter('due')} style={[styles.billTab, billFilter === 'due' && styles.billTabActive]}><TextLabel style={[styles.billTabText, billFilter === 'due' && styles.billTabTextActive]}>{t('dueBills')}</TextLabel></Pressable>
              <Pressable onPress={() => setBillFilter('paid')} style={[styles.billTab, billFilter === 'paid' && styles.billTabActive]}><TextLabel style={[styles.billTabText, billFilter === 'paid' && styles.billTabTextActive]}>{t('paidBills')}</TextLabel></Pressable>
            </View>
            {billFilter === 'paid' ? (
              <View>
                {payments.map((payment) => <Card key={payment.id}><View style={styles.rowBetween}><TextLabel bold>{payment.date} water bill</TextLabel><TextLabel style={styles.paidPill}>{t('paid')}</TextLabel></View><TextLabel style={styles.helperText}>{payment.id} · {payment.method}</TextLabel><View style={styles.rowBetween}><TextLabel>{t('totalPayable')}</TextLabel><TextLabel bold>৳{payment.amount.toLocaleString()}</TextLabel></View></Card>)}
                <ActionButton title={t('paymentHistory')} onPress={() => setScreen('history')} secondary fontFamily={font} />
              </View>
            ) : currentBillPaid ? (
              <View><Card><TextLabel bold>{language === 'bn' ? 'কোনো বকেয়া বিল নেই' : 'No bills due'}</TextLabel><TextLabel style={styles.helperText}>{language === 'bn' ? 'বর্তমান বিল সম্পূর্ণ পরিশোধিত।' : 'Your current bill is paid in full.'}</TextLabel><ActionButton title={t('paidBills')} onPress={() => setBillFilter('paid')} secondary fontFamily={font} /></Card></View>
            ) : (
              <>
                <Card>
                  <View style={styles.rowBetween}><TextLabel bold>MAY 2026</TextLabel><TextLabel style={styles.statusPill}>{t('pending')}</TextLabel></View>
                  <TextLabel style={styles.helperText}>Account {displayAccountNo} · Meter {latestApprovedReading?.meterNumber ?? '443920'}</TextLabel>
                  <View style={styles.amountLine}><TextLabel style={styles.billAmount}>৳{currentBillAmount.toLocaleString()}</TextLabel><TextLabel style={styles.helperText}>Due 15 May 2026</TextLabel></View>
                  {latestApprovedReading ? <TextLabel style={styles.helperText}>{t('latestMeterReading')}: {latestApprovedReading.previousReading.toLocaleString()} → {latestApprovedReading.currentReading.toLocaleString()} m³ ({meterConsumption.toLocaleString()} m³)</TextLabel> : null}
                  <View style={styles.separator} />
                  <View style={styles.rowBetween}><TextLabel>{t('previousBalance')}</TextLabel><TextLabel>৳0</TextLabel></View>
                  <View style={styles.rowBetween}><TextLabel>{t('currentCharges')}</TextLabel><TextLabel>৳{Math.max(0, currentBillAmount - 50).toLocaleString()}</TextLabel></View>
                  <View style={styles.rowBetween}><TextLabel>{t('adjustment')}</TextLabel><TextLabel>৳0</TextLabel></View>
                  <View style={styles.rowBetween}><TextLabel>{t('serviceCharge')}</TextLabel><TextLabel>৳50</TextLabel></View>
                  <View style={styles.separator} />
                  <View style={styles.rowBetween}><TextLabel bold>{t('totalPayable')}</TextLabel><TextLabel bold style={styles.totalValue}>৳{currentBillAmount.toLocaleString()}</TextLabel></View>
                </Card>
                <Card>
                  <SectionTitle title={t('paymentMethod')} />
                  <View style={styles.paymentMethodGrid}>
                    {paymentMethods.map((method) => (
                      <Pressable key={method} onPress={() => setPaymentMethod(method)} style={[styles.paymentOption, paymentMethod === method && styles.paymentOptionSelected]}>
                        <View style={[styles.radio, paymentMethod === method && styles.radioSelected]} />
                        <TextLabel>{method}</TextLabel>
                      </Pressable>
                    ))}
                  </View>
                  <Field label={t('paymentNumber')} value={paymentPhone} onChangeText={setPaymentPhone} keyboardType="phone-pad" />
                  <TextLabel style={styles.helperText}>{language === 'bn' ? 'ডেমো চেকআউট — কোনো প্রকৃত পেমেন্ট নেওয়া হবে না।' : 'Demo checkout — no real payment will be charged.'}</TextLabel>
                  <ActionButton title={`${t('confirmPayment')} · ৳${currentBillAmount.toLocaleString()}`} onPress={completePayment} fontFamily={font} />
                </Card>
                <Card style={styles.infoBox}><TextLabel style={styles.infoText}>Settle in instalments. CWASA supports up to 3 monthly instalments for overdue bills above ৳3,000.</TextLabel></Card>
              </>
            )}
          </View>
        );
      case 'history':
        return (
          <View>
            <Heading title={t('paymentHistory')} subtitle="Your recent water bill payments." />
            <Card style={styles.balanceCard}>
              <View style={styles.rowBetween}><View><TextLabel style={styles.heroEyebrow}>{t('currentBill')}</TextLabel><TextLabel bold style={styles.heroAmount}>৳14,210</TextLabel></View><ActionButton title={t('export')} onPress={exportHistory} secondary fontFamily={font} compact /></View>
              <TextLabel style={styles.helperText}>Account CW-2026-0488 · Updated today</TextLabel>
            </Card>
            {payments.map((payment) => (
              <Card key={payment.id} style={styles.historyCard}>
                <View style={styles.historyIcon}><TextLabel bold style={styles.historyCheck}>✓</TextLabel></View>
                <View style={styles.historyDetails}>
                  <View style={styles.rowBetween}><TextLabel bold>{payment.date} water bill</TextLabel><TextLabel style={styles.paidPill}>{t('paid')}</TextLabel></View>
                  <TextLabel style={styles.helperText}>Account CW-2026-0488 · {payment.id}</TextLabel>
                  <View style={styles.rowBetween}><TextLabel style={styles.helperText}>{payment.method}</TextLabel><TextLabel bold>৳{payment.amount.toLocaleString()}</TextLabel></View>
                  <LinkAction title="View receipt" onPress={() => showNotice(`${t('paymentReference')}: ${payment.id}`)} />
                </View>
              </Card>
            ))}
          </View>
        );
      case 'new-connection':
        return (
          <View>
            <Heading title={t('applyConnection')} subtitle="Submit your property details to get started." />
            <Card>
              <SectionTitle title={t('connectionCategory')} />
              <OptionChips options={['domestic', 'commercial', 'nonDomestic']} selected={connectionCategory} onSelect={setConnectionCategory} />
              <Field label={t('applicantName')} value={connectionName} onChangeText={setConnectionName} placeholder="Full name" />
              <Field label={t('nationalId')} value={nationalId} onChangeText={setNationalId} placeholder="10, 13 or 17 digits" keyboardType="numeric" />
              <Field label={t('holdingNumber')} value={holdingNumber} onChangeText={setHoldingNumber} />
              <Field label={t('propertyType')} value={propertyType} onChangeText={setPropertyType} placeholder={t('propertyResidential')} />
              <SectionTitle title={t('pipeDiameter')} />
              <View style={styles.chipWrap}>
                {['½″', '¾″', '1″', '1½″'].map((diameter) => <Chip key={diameter} title={diameter} selected={pipeDiameter === diameter} onPress={() => setPipeDiameter(diameter)} fontFamily={font} />)}
              </View>
              <View style={styles.locationHeader}><TextLabel bold>{t('siteLocation')}</TextLabel><Pressable onPress={captureLocation}><TextLabel style={styles.linkText}>{t('useMyLocation')}</TextLabel></Pressable></View>
              <View style={styles.locationBox}><TextLabel style={styles.locationPin}>⌖</TextLabel><TextLabel style={styles.locationAddress}>{siteLocation}</TextLabel><Pressable onPress={captureLocation}><TextLabel style={styles.linkText}>{t('change')}</TextLabel></Pressable></View>
              {coordinates ? <TextLabel style={styles.coordinateText}>{coordinates}</TextLabel> : null}
              <Field label={t('email')} value={connectionEmail} onChangeText={setConnectionEmail} placeholder="name@example.com" keyboardType="email-address" />
              <TextLabel style={styles.infoText}>{t('connectionFeeInfo')}</TextLabel>
              <ActionButton title={t('submitApplication')} onPress={submitNewApplication} fontFamily={font} />
            </Card>
          </View>
        );
      case 'application':
        return (
          <View>
            <Heading title={t('trackYourApplication')} subtitle="Stay up to date with your new connection request." />
            <Card style={styles.applicationHero}>
              <View style={styles.rowBetween}><TextLabel style={styles.heroEyebrow}>{t('application')}</TextLabel><TextLabel style={styles.heroTag}>{t('inProgress')}</TextLabel></View>
              <TextLabel bold style={styles.applicationNumber}>{applicationId}</TextLabel>
              <TextLabel style={styles.heroDue}>{applicationSummary} · Submitted 10 May 2026</TextLabel>
              <View style={styles.applicationStats}>
                <View><TextLabel style={styles.statValue}>{applicationStage}/4</TextLabel><TextLabel style={styles.heroDue}>Steps complete</TextLabel></View>
                <View><TextLabel style={styles.statValue}>On track</TextLabel><TextLabel style={styles.heroDue}>Estimated 22 May</TextLabel></View>
              </View>
            </Card>
            <Card>
              <SectionTitle title={t('statusTimeline')} />
              {[
                [t('applicationReceived'), '10 May 2026 · 10:14 AM', 'Application number assigned'],
                [t('documentsReview'), '10 May 2026 · 11:02 AM', 'Waiting for site record verification'],
                [t('inspection'), '12 May 2026 · 10:00 AM', 'Inspection team · Halishahar zone'],
                [t('connectionFee'), 'Pending', 'Invoice will be available after inspection'],
              ].map(([title, date, detail], index) => (
                <View key={title} style={styles.timelineItem}>
                  <View style={[styles.timelineDot, index < applicationStage && styles.timelineDotDone, index === applicationStage && styles.timelineDotCurrent]} />
                  <View style={styles.timelineContent}><TextLabel bold>{title}</TextLabel><TextLabel style={styles.helperText}>{date}</TextLabel><TextLabel style={styles.timelineDetail}>{detail}</TextLabel>
                    {index === 2 ? <View style={styles.actionRow}><ActionButton title={t('contactInspector')} onPress={() => Linking.openURL('tel:16129').catch((error) => showNotice(error.message))} secondary compact fontFamily={font} /><ActionButton title={t('scheduleVisit')} onPress={() => showNotice(language === 'bn' ? 'পরিদর্শনের সময় পরিবর্তনের অনুরোধ পাঠানো হয়েছে।' : 'A reschedule request has been sent to the inspection team.')} secondary compact fontFamily={font} /></View> : null}
                  </View>
                </View>
              ))}
            </Card>
          </View>
        );
      case 'complaint-form':
        return (
          <View>
            <Heading title={t('submitComplaint')} subtitle="Tell us what is happening and our team will help." />
            <Card>
              <SectionTitle title={t('complaintType')} />
              <OptionChips options={['lowPressure', 'noWater', 'leakage', 'qualityIssue', 'overbilling', 'other']} selected={complaintType} onSelect={setComplaintType} />
              <Field label={t('description')} value={complaintDescription} onChangeText={setComplaintDescription} multiline />
              <View style={styles.locationHeader}><TextLabel bold>{t('location')}</TextLabel><Pressable onPress={captureLocation}><TextLabel style={styles.linkText}>{t('change')}</TextLabel></Pressable></View>
              <View style={styles.locationBox}><TextLabel style={styles.locationPin}>⌖</TextLabel><TextLabel style={styles.locationAddress}>{siteLocation}</TextLabel><Pressable onPress={captureLocation}><TextLabel style={styles.linkText}>{t('useMyLocation')}</TextLabel></Pressable></View>
              {coordinates ? <TextLabel style={styles.coordinateText}>{coordinates}</TextLabel> : null}
              <TextLabel bold style={styles.fieldLabel}>{t('addPhoto')}</TextLabel>
              <View style={styles.photoRow}>
                {[0, 1, 2].map((index) => index === 0 && photoUri ? (
                  <Image key={index} source={{ uri: photoUri }} style={styles.photoThumbnail} />
                ) : (
                  <Pressable key={index} onPress={openCamera} style={styles.photoPlaceholder}><TextLabel style={styles.photoIcon}>▧</TextLabel><TextLabel style={styles.photoLabel}>{index === 0 ? 'Camera' : 'Add'}</TextLabel></Pressable>
                ))}
              </View>
              <SectionTitle title={t('contactPreference')} />
              <OptionChips options={['call', 'sms', 'inApp']} selected={complaintContact} onSelect={setComplaintContact} />
              <ActionButton title={t('sendComplaint')} onPress={submitComplaint} fontFamily={font} />
            </Card>
          </View>
        );
      case 'complaints':
        return (
          <View>
            <Heading title={t('myComplaints')} subtitle="Follow updates from your service team." />
            <Card style={styles.complaintHero}>
              <TextLabel style={styles.heroEyebrow}>{t('activeComplaint')}</TextLabel>
              <TextLabel bold style={styles.complaintTitle}>{t(complaintType)}</TextLabel>
              <TextLabel style={styles.heroDue}>{complaintId} · filed today 09:42</TextLabel>
              <View style={styles.complaintAssignee}><TextLabel style={styles.heroDue}>Field team assigned · ETA 13:30</TextLabel><TextLabel style={styles.heroTag}>{t('inProgress')}</TextLabel></View>
            </Card>
            <Card>
              <SectionTitle title={t('activity')} />
              {[
                [t('complaintReceived'), 'Today · 09:42', colors.green],
                ['Auto-routed to Halishahar zone', 'Today · 09:43', colors.green],
                ['Field team Md. Karim assigned', 'Today · 10:05', colors.blue],
                [t('onTheWay'), 'Today · ETA 13:30', colors.blue],
                [t('resolution'), 'Pending', colors.border],
              ].map(([title, detail, color]) => (
                <View key={title} style={styles.activityRow}>
                  <View style={[styles.activityDot, { backgroundColor: color as string }]} />
                  <View><TextLabel bold>{title}</TextLabel><TextLabel style={styles.helperText}>{detail}</TextLabel></View>
                </View>
              ))}
            </Card>
            <SectionTitle title={t('pastComplaints')} />
            <Card><View style={styles.rowBetween}><View><TextLabel bold>Leakage on main line</TextLabel><TextLabel style={styles.helperText}>Resolved · 12 Apr · Leakage</TextLabel></View><TextLabel style={styles.paidPill}>{t('resolved')}</TextLabel></View></Card>
            <ActionButton title={t('submitComplaint')} onPress={() => setScreen('complaint-form')} secondary fontFamily={font} />
          </View>
        );
      case 'notifications':
        return (
          <View>
            <View style={styles.notificationsHeading}>
              <Heading title={t('notifications')} subtitle="Your service and account updates." />
              <Pressable onPress={markAllRead}><TextLabel style={styles.linkText}>{t('markAllRead')}</TextLabel></Pressable>
            </View>
            <OptionChips options={['all', 'bills', 'services', 'alerts'] as TranslationKey[]} selected={notificationFilter === 'All' ? 'all' : notificationFilter === 'Bills' ? 'bills' : notificationFilter === 'Service' ? 'services' : 'alerts'} onSelect={(key) => setNotificationFilter(key === 'all' ? 'All' : key === 'bills' ? 'Bills' : key === 'services' ? 'Service' : 'Alerts')} />
            {notifications.filter((item) => notificationFilter === 'All' || item.category === notificationFilter).map((item) => (
              <Pressable key={item.id} onPress={() => { setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry)); if (item.category === 'Bills') setScreen('bill'); else if (item.category === 'Service') setScreen('complaints'); else showNotice(item.detail); }}>
                <Card style={[styles.notificationCard, !item.read && styles.notificationUnread]}>
                  <View style={[styles.notificationItemIcon, { backgroundColor: `${item.color}17` }]}><TextLabel bold style={{ color: item.color }}>{item.icon}</TextLabel></View>
                  <View style={styles.notificationItemContent}><View style={styles.rowBetween}><TextLabel bold>{item.title}</TextLabel><TextLabel style={styles.helperText}>09:42</TextLabel></View><TextLabel style={styles.helperText}>{item.detail}</TextLabel></View>
                  {!item.read ? <View style={styles.unreadDot} /> : null}
                </Card>
              </Pressable>
            ))}
            {notifications.filter((item) => notificationFilter === 'All' || item.category === notificationFilter).length === 0 ? <Card><TextLabel style={styles.helperText}>{t('noNotifications')}</TextLabel></Card> : null}
          </View>
        );
      case 'support':
        return (
          <View>
            <Heading title={t('servicesAndSupport')} subtitle="Find a service or get in touch with our team." />
            <Card style={styles.hotlineCard}>
              <View style={styles.hotlineIcon}><TextLabel style={styles.hotlineGlyph}>◉</TextLabel></View>
              <View style={styles.hotlineDetails}><TextLabel bold>{t('customerHelpline')}</TextLabel><TextLabel style={styles.helperText}>16129 · Toll-free · Available anytime</TextLabel></View>
              <ActionButton title={t('call')} onPress={() => Linking.openURL('tel:16129').catch((error) => showNotice(error.message))} fontFamily={font} compact />
            </Card>
            <SectionTitle title={t('serviceCatalog')} />
            <View style={styles.serviceCatalog}>
              {([
                ['serviceNewConnection', '＋', 'new-connection'],
                ['billQuery', '৳', 'bill'],
              ] as [TranslationKey, string, Screen][]).map(([title, icon, destination], index) => (
                <Pressable key={title} onPress={() => destination === 'support' ? showNotice(`${t(title)} · ${t('hotline')}: 16129`) : setScreen(destination)} style={styles.catalogTile}>
                  <View style={[styles.catalogIcon, { backgroundColor: [colors.paleBlue, colors.paleAmber, colors.paleGreen, '#F2EDFF', colors.paleBlue, colors.paleRed][index % 6] }]}><TextLabel bold style={{ color: [colors.blue, colors.amber, colors.green, colors.purple][index % 4], fontSize: 21 }}>{icon}</TextLabel></View>
                  <TextLabel style={styles.catalogLabel}>{t(title)}</TextLabel>
                </Pressable>
              ))}
            </View>
            <Card style={styles.infoBox}><TextLabel bold>No smartphone? No internet?</TextLabel><TextLabel style={styles.helperText}>Reach CWASA through your nearest service channel.</TextLabel><LinkAction title="View offline service options" onPress={() => showNotice('Visit your local CWASA zonal office or call 16129.')} /></Card>
            <Card><SectionTitle title={t('submitComplaint')} /><TextLabel style={styles.helperText}>Report a water supply or billing issue to our team.</TextLabel><ActionButton title={t('submitComplaint')} onPress={() => setScreen('complaint-form')} secondary fontFamily={font} /></Card>
            <Card><SectionTitle title={translateGuest(language, 'publicServices')} /><TextLabel style={styles.helperText}>{translateGuest(language, 'guestDescription')}</TextLabel><ActionButton title={translateGuest(language, 'publicServices')} onPress={() => openPublicServices()} secondary fontFamily={font} /></Card>
          </View>
        );
      case 'account':
        return (
          <View>
            <Heading title={t('accountProfile')} subtitle="Manage your customer profile and preferences." />
            <Card>
              <View style={styles.profileHeader}>
                <View style={styles.avatar}><TextLabel bold style={styles.avatarText}>AR</TextLabel></View>
                <View style={styles.profileDetails}>
                  {profileEditing ? <TextInput value={connectionName} onChangeText={setConnectionName} style={[sharedStyles.input, styles.nameInput, { fontFamily: fontBold }]} /> : <TextLabel bold style={styles.profileName}>{connectionName}</TextLabel>}
                  <TextLabel style={styles.helperText}>+880 {phone || '1712 345 678'}</TextLabel>
                  <TextLabel style={styles.helperText}>Account {displayAccountNo}</TextLabel>
                </View>
                <Pressable onPress={() => { setProfileEditing((value) => !value); showNotice(profileEditing ? t('save') : t('edit')); }}><TextLabel style={styles.linkText}>{profileEditing ? t('save') : t('edit')}</TextLabel></Pressable>
              </View>
              <View style={styles.profileStats}>
                {[['11', 'Bills paid'], ['3', 'Complaints'], ['2', 'Connections']].map(([value, label]) => <View key={label} style={styles.profileStat}><TextLabel bold style={styles.profileStatNumber}>{value}</TextLabel><TextLabel style={styles.helperText}>{label}</TextLabel></View>)}
              </View>
            </Card>
            <SectionTitle title={t('myConnections')} />
            <Card style={styles.connectionCard}>
              <View style={styles.connectionIndicator} />
              <View style={styles.connectionInfo}><TextLabel bold>Halishahar — primary</TextLabel><TextLabel style={styles.helperText}>Domestic · CWASA-2026-0488</TextLabel></View>
              <TextLabel style={styles.paidPill}>{t('inProgress')}</TextLabel>
            </Card>
            <Card style={styles.connectionCard}>
              <View style={[styles.connectionIndicator, styles.connectionPending]} />
              <View style={styles.connectionInfo}><TextLabel bold>Agrabad — shop</TextLabel><TextLabel style={styles.helperText}>Commercial · CWASA-2026-7724</TextLabel></View>
              <TextLabel style={styles.pendingPill}>{t('pending')}</TextLabel>
            </Card>
            <Card>
              <SectionTitle title={t('preferences')} />
              <View style={styles.preferenceRow}><View><TextLabel bold>{t('language')}</TextLabel><TextLabel style={styles.helperText}>{language === 'en' ? 'বাংলা, English available' : 'বাংলা, English পাওয়া যায়'}</TextLabel></View><View style={styles.preferenceActions}><Pressable onPress={() => setLanguage('bn')}><TextLabel style={[styles.languageChoice, language === 'bn' && styles.languageChoiceSelected]}>বাং</TextLabel></Pressable><Pressable onPress={() => setLanguage('en')}><TextLabel style={[styles.languageChoice, language === 'en' && styles.languageChoiceSelected]}>EN</TextLabel></Pressable></View></View>
              <View style={styles.separator} />
              <PreferenceToggle title={t('largeText')} value={largeText} onChange={setLargeText} />
              <PreferenceToggle title={t('smsFallback')} value={smsFallback} onChange={setSmsFallback} />
              <View style={styles.separator} />
              <ActionButton title={translateGuest(language, 'publicServices')} onPress={() => openPublicServices()} secondary fontFamily={font} />
              <ActionButton title={language === 'bn' ? 'লগ আউট' : 'Sign out'} onPress={() => { signOutCustomer(); setCustomerSession(null); setCustomerBills([]); setIsGuest(false); setScreen('welcome'); }} secondary fontFamily={font} />
            </Card>
          </View>
        );
      case 'public-services':
        return (
          <GuestServices
            section={guestSection}
            language={language}
            fontFamily={font}
            boldFontFamily={fontBold}
            onNavigate={setGuestSection}
            onSignIn={beginSignIn}
            onSubmit={registerGuestComplaint}
          />
        );
      default:
        return null;
    }
  })();

  function PreferenceSwitch({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
    return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[styles.switchTrack, value && styles.switchTrackOn]}><View style={[styles.switchThumb, value && styles.switchThumbOn]} /></Pressable>;
  }

  function PreferenceToggle({ title, value, onChange }: { title: string; value: boolean; onChange: (value: boolean) => void }) {
    return <View style={styles.preferenceRow}><TextLabel bold>{title}</TextLabel><PreferenceSwitch value={value} onChange={onChange} /></View>;
  }

  if (
    Platform.OS === 'web'
    && typeof window !== 'undefined'
    && window.location.pathname.replace(/\/+$/, '') === '/meteradmin'
  ) {
    return <MeterAdmin />;
  }

  if (screen === 'welcome') {
    return (
      <View style={styles.welcomeRoot}>
        <StatusBar style="light" />
        {screenContent}
        {notice ? <TextLabel style={styles.notice}>{notice}</TextLabel> : null}
      </View>
    );
  }

  if (screen === 'public-services' && isGuest) {
    return (
      <View style={styles.guestRoot}>
        <StatusBar style="dark" />
        <View style={[styles.guestShell, wide && styles.appShellWide]}>
          <View style={[styles.header, styles.guestHeader, wide && styles.headerWide]}>
            <Pressable onPress={() => setGuestSection('home')} accessibilityLabel={translateGuest(language, 'guestWelcome')}>
              <Image source={require('./assets/cwasa-logo.png')} style={styles.headerLogo} resizeMode="contain" />
            </Pressable>
            <View style={styles.brandText}>
              <TextLabel bold style={styles.brandName}>CHATTOGRAM WASA</TextLabel>
              <TextLabel style={styles.brandSub}>{translateGuest(language, 'publicServices')}</TextLabel>
            </View>
            <View style={styles.headerActions}>
              <Pressable onPress={() => setLanguage((current) => current === 'en' ? 'bn' : 'en')} style={styles.languageButton} accessibilityLabel={t('language')}>
                <TextLabel style={styles.languageText}>{language === 'en' ? 'বাং' : 'EN'}</TextLabel>
              </Pressable>
              <Pressable onPress={beginSignIn} style={styles.guestSignInButton}>
                <TextLabel style={styles.guestSignInText}>{language === 'bn' ? 'সাইন ইন' : 'Sign in'}</TextLabel>
              </Pressable>
            </View>
          </View>
          <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]} keyboardShouldPersistTaps="handled">
            {notice ? <Pressable onPress={() => setNotice('')}><TextLabel style={styles.notice}>{notice}　×</TextLabel></Pressable> : null}
            {screenContent}
            <View style={styles.footer}>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.appRoot}>
      <StatusBar style="dark" />
      <View style={[styles.appShell, wide && styles.appShellWide]}>
        {header}
        <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]} keyboardShouldPersistTaps="handled">
          {notice ? <Pressable onPress={() => setNotice('')}><TextLabel style={styles.notice}>{notice}　×</TextLabel></Pressable> : null}
          {screenContent}
          <View style={styles.footer}>
          </View>
        </ScrollView>
        {bottomNav}
      </View>
      {cameraOpen ? (
        <View style={styles.cameraOverlay}>
          <CameraView ref={cameraRef} style={styles.cameraView} facing="back" />
          <View style={styles.cameraControls}>
            <ActionButton title={t('cancel')} onPress={() => setCameraOpen(false)} secondary fontFamily={font} />
            <Pressable onPress={capturePhoto} style={styles.captureButton}><View style={styles.captureInner} /></Pressable>
            <View style={styles.cameraSpacer} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue },
  loadingText: { color: colors.white, fontFamily: 'RBNylo-Bold', fontSize: 26 },
  appRoot: { flex: 1, backgroundColor: colors.background, alignItems: 'center' },
  appShell: { flex: 1, width: '100%', maxWidth: 560, backgroundColor: colors.background },
  appShellWide: { maxWidth: 1120, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  guestRoot: { flex: 1, backgroundColor: colors.background, alignItems: 'center' },
  guestShell: { flex: 1, width: '100%', maxWidth: 560, backgroundColor: colors.background },
  guestHeader: { justifyContent: 'space-between' },
  header: { minHeight: 69, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, backgroundColor: colors.white, borderBottomColor: colors.border, borderBottomWidth: 1, gap: 9 },
  headerWide: { paddingHorizontal: 28 },
  headerLogo: { width: 39, height: 39 },
  brandText: { flex: 1 },
  brandName: { color: colors.blue, fontSize: 12, letterSpacing: 0.35 },
  brandSub: { fontSize: 10, color: colors.muted },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  publicInfoButton: { width: 31, height: 31, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  publicInfoText: { color: colors.blue, fontSize: 17 },
  guestSignInButton: { borderRadius: 18, backgroundColor: colors.blue, paddingVertical: 7, paddingHorizontal: 12 },
  guestSignInText: { color: colors.white, fontSize: 11 },
  languageButton: { borderColor: colors.border, borderWidth: 1, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 20 },
  languageText: { fontSize: 12, color: colors.blue },
  notificationButton: { width: 34, height: 34, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paleBlue, position: 'relative' },
  notificationIcon: { fontSize: 19, color: colors.blue },
  notificationBadge: { position: 'absolute', right: -2, top: -2, borderRadius: 8, minWidth: 15, height: 15, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontSize: 9, fontFamily: 'RBNylo-Bold', color: colors.white },
  content: { padding: 16, paddingBottom: 30 },
  contentWide: { paddingHorizontal: 30, paddingTop: 24 },
  bottomNav: { minHeight: 69, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Platform.OS === 'ios' ? 8 : 0 },
  navItem: { alignItems: 'center', justifyContent: 'center', gap: 2, flex: 1 },
  navIcon: { color: colors.muted, fontSize: 21, lineHeight: 25 },
  navLabel: { color: colors.muted, fontSize: 10 },
  navSelected: { color: colors.blue },
  text: { color: colors.ink, fontSize: 14 },
  heading: { marginBottom: 16 },
  headingTitle: { fontSize: 21, color: colors.ink },
  headingSubtitle: { color: colors.muted, marginTop: 3, fontSize: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, marginBottom: 11 },
  sectionTitle: { fontSize: 15 },
  linkText: { color: colors.blue, fontSize: 12 },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: colors.white, fontSize: 14 },
  buttonSecondaryText: { color: colors.blue },
  buttonCompact: { minHeight: 36, paddingHorizontal: 12, marginTop: 0 },
  buttonCompactText: { fontSize: 12 },
  pressed: { opacity: 0.75 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 7 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 22 },
  chipSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.ink, fontSize: 12 },
  chipTextSelected: { color: colors.white },
  field: { marginBottom: 13 },
  fieldLabel: { color: colors.ink, fontSize: 12, marginBottom: 6 },
  multilineInput: { minHeight: 94, paddingTop: 12 },
  helperText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  formScreen: { paddingTop: 5 },
  inlineLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  welcomeRoot: { flex: 1, backgroundColor: colors.blue },
  welcomeScreen: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 26, paddingTop: Platform.OS === 'web' ? 50 : 75, paddingBottom: 33, width: '100%', maxWidth: 530, alignSelf: 'center' },
  welcomeBrand: { alignItems: 'center', marginTop: 20 },
  welcomeLogo: { width: 122, height: 92, backgroundColor: colors.white, borderRadius: 17, marginBottom: 26 },
  welcomeTo: { color: '#D6E8FF', letterSpacing: 2, fontSize: 11, textTransform: 'uppercase' },
  welcomeTitle: { color: colors.white, fontSize: 26, marginTop: 8 },
  welcomeSub: { color: '#D6E8FF', marginTop: 3, fontSize: 14 },
  partnerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.27)', borderRadius: 13, padding: 10, width: '100%', maxWidth: 355 },
  partnerCaption: { color: '#D6E8FF', fontSize: 11 },
  partnerLogo: { width: 112, height: 30, backgroundColor: colors.white, borderRadius: 4 },
  welcomeActions: { width: '100%', maxWidth: 380 },
  legalText: { color: '#D6E8FF', textAlign: 'center', fontSize: 10, marginTop: 14 },
  notice: { backgroundColor: '#EAF3FF', color: colors.deepBlue, padding: 12, borderRadius: 11, marginBottom: 12, overflow: 'hidden' },
  dashboardRow: { gap: 8 },
  dashboardRowWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 8 },
  billHero: { backgroundColor: colors.blue, borderRadius: 20, padding: 19, marginBottom: 16 },
  billHeroWide: { flex: 1, minHeight: 212, justifyContent: 'space-between', marginBottom: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroEyebrow: { color: '#E6F1FF', fontSize: 12 },
  heroTag: { color: colors.blue, backgroundColor: colors.white, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 14, fontSize: 10 },
  heroAmount: { fontSize: 31, color: colors.white, marginTop: 11 },
  heroDue: { color: '#E6F1FF', fontSize: 11, marginTop: 2 },
  heroBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17 },
  heroAccount: { color: '#DCEBFF', fontSize: 10 },
  statusPill: { color: colors.amber, backgroundColor: colors.paleAmber, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 13, fontSize: 10 },
  serviceGrid: { marginBottom: 9 },
  serviceGridWide: { flex: 1, paddingTop: 7 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  serviceTile: { width: '23%', minHeight: 89, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 4, marginBottom: 8 },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  tileLabel: { textAlign: 'center', fontSize: 10, lineHeight: 14 },
  quickHelp: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: '#FFFAE9' },
  quickHelpText: { flex: 1 },
  applicationPreview: { marginTop: 0 },
  meterReadingCard: { borderColor: '#D4E6FB', backgroundColor: '#FCFDFF' },
  meterReadingValues: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  readingArrow: { color: colors.muted, fontSize: 16 },
  consumptionValue: { marginLeft: 'auto', alignItems: 'flex-end' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginVertical: 3 },
  progressTrack: { height: 5, borderRadius: 5, backgroundColor: colors.border, marginTop: 14, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.blue, borderRadius: 5 },
  billTabs: { flexDirection: 'row', gap: 8, marginBottom: 13 },
  billTab: { flex: 1, alignItems: 'center', paddingVertical: 9, backgroundColor: colors.white, borderRadius: 10, overflow: 'hidden' },
  billTabText: { color: colors.muted },
  billTabTextActive: { color: colors.white },
  billTabActive: { backgroundColor: colors.blue },
  amountLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, marginBottom: 4 },
  billAmount: { fontSize: 27, color: colors.blue, fontFamily: 'RBNylo-Bold' },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 11 },
  totalValue: { fontSize: 16, color: colors.blue },
  paymentMethodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  paymentOption: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 10 },
  paymentOptionSelected: { borderColor: colors.blue, backgroundColor: colors.paleBlue },
  radio: { height: 15, width: 15, borderRadius: 8, borderWidth: 1, borderColor: colors.muted },
  radioSelected: { borderWidth: 5, borderColor: colors.blue },
  infoBox: { backgroundColor: colors.paleAmber, borderColor: '#F1E0A4' },
  infoText: { color: '#735713', fontSize: 12, lineHeight: 18 },
  successMark: { width: 64, height: 64, borderRadius: 32, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paleGreen, marginBottom: 18 },
  successCheck: { fontSize: 33, color: colors.green },
  balanceCard: { backgroundColor: colors.blue, borderColor: colors.blue },
  historyCard: { flexDirection: 'row', gap: 11 },
  historyIcon: { width: 32, height: 32, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paleGreen },
  historyCheck: { color: colors.green },
  historyDetails: { flex: 1 },
  paidPill: { color: colors.green, backgroundColor: colors.paleGreen, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, fontSize: 10 },
  pendingPill: { color: colors.amber, backgroundColor: colors.paleAmber, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, fontSize: 10 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 8 },
  locationBox: { minHeight: 56, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.background, borderRadius: 11, padding: 10, marginBottom: 8 },
  locationPin: { color: colors.red, fontSize: 18 },
  locationAddress: { flex: 1, fontSize: 11 },
  coordinateText: { color: colors.green, fontSize: 11, marginBottom: 10 },
  applicationHero: { backgroundColor: colors.blue, borderColor: colors.blue },
  applicationNumber: { fontSize: 18, color: colors.white, marginTop: 8 },
  applicationStats: { flexDirection: 'row', gap: 25, marginTop: 17 },
  statValue: { fontFamily: 'RBNylo-Bold', color: colors.white, fontSize: 18 },
  timelineItem: { flexDirection: 'row', gap: 12, minHeight: 90 },
  timelineDot: { width: 11, height: 11, borderRadius: 7, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white, marginTop: 4 },
  timelineDotDone: { backgroundColor: colors.green, borderColor: colors.green },
  timelineDotCurrent: { backgroundColor: colors.blue, borderColor: colors.blue },
  timelineContent: { flex: 1, paddingBottom: 15, borderLeftWidth: 1, borderColor: colors.border, marginLeft: -18, paddingLeft: 23 },
  timelineDetail: { color: colors.muted, fontSize: 10, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 7, marginTop: 8, flexWrap: 'wrap' },
  photoRow: { flexDirection: 'row', gap: 10, marginBottom: 14, marginTop: 7 },
  photoPlaceholder: { width: 76, height: 65, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  photoThumbnail: { width: 76, height: 65, borderRadius: 11 },
  photoIcon: { color: colors.muted, fontSize: 19 },
  photoLabel: { color: colors.muted, fontSize: 9 },
  complaintHero: { backgroundColor: colors.purple, borderColor: colors.purple },
  complaintTitle: { color: colors.white, fontSize: 20, marginTop: 7 },
  complaintAssignee: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 15, backgroundColor: 'rgba(255,255,255,.14)', padding: 9, borderRadius: 11 },
  activityRow: { flexDirection: 'row', gap: 12, marginVertical: 7 },
  activityDot: { width: 10, height: 10, borderRadius: 6, marginTop: 5 },
  notificationsHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  notificationCard: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, marginBottom: 9 },
  notificationUnread: { borderColor: '#D8E8FF', backgroundColor: '#FBFDFF' },
  notificationItemIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  notificationItemContent: { flex: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.blue },
  hotlineCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hotlineIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.paleBlue, alignItems: 'center', justifyContent: 'center' },
  hotlineGlyph: { fontSize: 19, color: colors.blue },
  hotlineDetails: { flex: 1 },
  serviceCatalog: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 },
  catalogTile: { width: '31.5%', minHeight: 103, padding: 10, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  catalogIcon: { width: 41, height: 41, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  catalogLabel: { textAlign: 'center', fontSize: 10, lineHeight: 14 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 43, height: 43, borderRadius: 24, backgroundColor: colors.paleBlue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.blue, fontSize: 16 },
  profileDetails: { flex: 1 },
  profileName: { fontSize: 16 },
  nameInput: { minHeight: 37, paddingVertical: 3 },
  profileStats: { flexDirection: 'row', gap: 9, marginTop: 17 },
  profileStat: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingVertical: 9, alignItems: 'center' },
  profileStatNumber: { fontSize: 17 },
  connectionCard: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, marginBottom: 8 },
  connectionIndicator: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green },
  connectionPending: { backgroundColor: colors.amber },
  connectionInfo: { flex: 1 },
  preferenceRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8 },
  preferenceActions: { flexDirection: 'row', gap: 5 },
  languageChoice: { color: colors.muted, borderRadius: 7, overflow: 'hidden', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: colors.background, fontSize: 11 },
  languageChoiceSelected: { color: colors.white, backgroundColor: colors.blue },
  switchTrack: { width: 42, height: 24, borderRadius: 15, justifyContent: 'center', backgroundColor: '#D6DCE5', paddingHorizontal: 3 },
  switchTrackOn: { backgroundColor: colors.blue },
  switchThumb: { width: 18, height: 18, borderRadius: 10, backgroundColor: colors.white, alignSelf: 'flex-start' },
  switchThumbOn: { alignSelf: 'flex-end' },
  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
  footerLogo: { width: 93, height: 29, marginBottom: 5 },
  footerText: { textAlign: 'center', color: colors.muted, fontSize: 9 },
  cameraOverlay: { ...StyleSheet.absoluteFill, zIndex: 10, backgroundColor: '#000' },
  cameraView: { flex: 1 },
  cameraControls: { minHeight: 94, paddingHorizontal: 24, paddingBottom: 17, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  captureButton: { width: 62, height: 62, borderRadius: 32, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  captureInner: { width: 48, height: 48, borderRadius: 25, backgroundColor: colors.white },
  cameraSpacer: { width: 66 },
});
