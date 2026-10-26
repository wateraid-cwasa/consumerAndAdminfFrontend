import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { colors, fontFamilyForText, openSansRegular, sharedStyles } from './theme';
import styles from './styles';
import { Language, TranslationKey, translate } from './translation';
import GuestServices, { GuestComplaint } from './GuestServices';
import { GuestSection, translateGuest } from './guestTranslations';
import {
  loginCustomer,
  registerCustomer,
  getStoredCustomerSession,
  getCustomerBills,
  getCustomerProfile,
  getLastBillsNote,
  signOutCustomer,
  ApiRequestError,
  ApiConnectionError,
  type CustomerSession,
  type BillDetail,
  type CustomerProfile,
} from './consumerApi';

type Screen =
  | 'welcome'
  | 'sign-in'
  | 'sign-up'
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

const initialNotifications: NotificationItem[] = [];

const paymentMethods = ['bKash', 'Nagad', 'Debit / credit', 'Internet banking'];
// Components declared inside App() would get a new identity on every render, which remounts
// their children and makes text inputs lose focus on each keystroke. This keeps one stable
// component type while still rendering with the latest closure.
function useStableComponent<P>(impl: (props: P) => React.ReactElement): (props: P) => React.ReactElement {
  const ref = useRef(impl);
  ref.current = impl;
  return useMemo(() => (props: P) => ref.current(props), []);
}

function formatBillDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatTaka(value: number): string {
  return `৳${Math.round(value).toLocaleString('en-US')}`;
}

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function isPastDue(bill: BillDetail, now = new Date()): boolean {
  if (!bill.dueDate || bill.status === 'PAID') return false;
  const due = new Date(bill.dueDate);
  return !Number.isNaN(due.getTime()) && startOfDay(now) > startOfDay(due);
}

// The amount to pay today: net payable up to the due date, then the matching late-payment step.
function amountPayableToday(bill: BillDetail, now = new Date()): number {
  if (!isPastDue(bill, now) || bill.surcharges.length === 0) return bill.netPayable;
  const today = startOfDay(now);
  const step = bill.surcharges.find((item) => startOfDay(new Date(item.deadline)) >= today)
    ?? bill.surcharges[bill.surcharges.length - 1];
  return step.totalPayable;
}

function ActionButton({
  title,
  onPress,
  secondary = false,
  disabled = false,
  fontFamily = 'OpenSans',
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
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText, compact && styles.buttonCompactText, { fontFamily: fontFamilyForText(title, false, fontFamily === 'Shurjo' ? 'bn' : 'en') }]}>
        {title}
      </Text>
    </Pressable>
  );
}

function Chip({
  title,
  selected,
  onPress,
  fontFamily = 'OpenSans',
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
  fontFamily?: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected, { fontFamily: fontFamilyForText(title, false, fontFamily === 'Shurjo' ? 'bn' : 'en') }]}>{title}</Text>
    </Pressable>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    OpenSans: openSansRegular,
    Shurjo: require('./fonts/Shurjo-Regular.ttf'),
    'Shurjo-Bold': require('./fonts/Shurjo-bold.ttf'),
    'RBNylo-Bold': require('./fonts/RBNylo-Bold.otf'),
  });
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const tablet = width >= 600;
  const compact = width < 380;
  const veryCompact = width < 340;
  const billCardHeight = compact ? 312 : 272;
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(
    () => (Platform.OS === 'web' ? getStoredCustomerSession() : null),
  );
  const [screen, setScreen] = useState<Screen>(() => customerSession ? 'home' : 'welcome');
  const [isGuest, setIsGuest] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [guestSection, setGuestSection] = useState<GuestSection>('home');
  const [notice, setNotice] = useState('');
  const [registrationContact, setRegistrationContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [customerBills, setCustomerBills] = useState<BillDetail[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
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
  const [siteLocation, setSiteLocation] = useState('');
  const [coordinates, setCoordinates] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [largeText, setLargeText] = useState(false);
  const [smsFallback, setSmsFallback] = useState(true);
  const [billFilter, setBillFilter] = useState<'due' | 'paid'>('due');
  const [billCardShowingDetails, setBillCardShowingDetails] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [applicationStage, setApplicationStage] = useState(2);
  const [applicationSummary, setApplicationSummary] = useState('New domestic connection');
  const [showPaymentConfirmation, setShowPaymentConfirmation] = useState(false);
  const [currentBillPaid, setCurrentBillPaid] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const billCardShine = useRef(new Animated.Value(0)).current;
  const billCardFlipScale = useRef(new Animated.Value(1)).current;
  const billCardTurning = useRef(false);

  const t = useCallback((key: TranslationKey) => translate(language, key), [language]);
  const font = language === 'bn' ? 'Shurjo' : 'OpenSans';
  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);
  const currentBill = customerBills.find((bill) => bill.status !== 'PAID' && bill.status !== 'CANCELLED') ?? null;
  const latestBill = currentBill ?? customerBills[0] ?? null;
  const billIsPaid = currentBillPaid || latestBill?.status === 'PAID';
  const billIsOverdue = latestBill ? !billIsPaid && isPastDue(latestBill) : false;
  const currentBillAmount = latestBill ? amountPayableToday(latestBill) : 0;
  const displayAccountNo = profile?.accountNo ?? customerSession?.accountNo ?? '-';
  const displayName = profile?.customerName ?? latestBill?.holderName ?? customerSession?.name ?? '';
  const displayMeter = profile?.meterNo ?? latestBill?.meterNo ?? null;

  useEffect(() => {
    if (screen !== 'home') {
      setBillCardShowingDetails(false);
      billCardFlipScale.stopAnimation();
      billCardFlipScale.setValue(1);
      billCardTurning.current = false;
    }
  }, [billCardFlipScale, screen]);

  useEffect(() => {
    if (screen !== 'home' || isGuest) return;
    const animation = Animated.loop(Animated.timing(billCardShine, {
      toValue: 1,
      duration: 2600,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [billCardShine, isGuest, screen]);


  const showNotice = (message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(''), 4200);
  };

  const loadAccountData = useCallback(async () => {
    const [bills, me] = await Promise.allSettled([getCustomerBills(), getCustomerProfile()]);
    if (bills.status === 'fulfilled') {
      setCustomerBills(bills.value);
      if (bills.value.length === 0 && getLastBillsNote()) showNotice(getLastBillsNote());
    }
    if (me.status === 'fulfilled') {
      setProfile(me.value);
      if (me.value.address) setSiteLocation(me.value.address);
      if (me.value.mobileNo) setPaymentPhone(me.value.mobileNo);
    }
    const failure = bills.status === 'rejected' ? bills.reason : me.status === 'rejected' ? me.reason : null;
    if (failure instanceof ApiRequestError && failure.status === 401) {
      signOutCustomer();
      setCustomerSession(null);
      setScreen('sign-in');
      showNotice('Your session has expired. Please sign in again.');
    } else if (failure) {
      showNotice('Could not load your account details. Please try again.');
    }
  }, []);

  useEffect(() => {
    if (customerSession && !isGuest) loadAccountData();
  }, [customerSession, isGuest, loadAccountData]);

  useEffect(() => {
    if (!latestBill) return;
    setNotifications((current) => current.some((item) => item.id === 1) ? current : [{
      id: 1,
      title: 'Your water bill is ready',
      detail: `${formatTaka(amountPayableToday(latestBill))} · due ${formatBillDate(latestBill.dueDate)}`,
      category: 'Bills',
      read: false,
      icon: '৳',
      color: colors.purple,
    }, ...current]);
  }, [latestBill?.id]);

  const flipBillCard = () => {
    if (billCardTurning.current) return;
    billCardTurning.current = true;

    const showingDetails = billCardShowingDetails;
    const animateScale = (toValue: number, onComplete: (finished: boolean) => void) => {
      Animated.timing(billCardFlipScale, {
        toValue,
        duration: 230,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => onComplete(finished));
    };

    animateScale(0.03, (reachedEdge) => {
      if (!reachedEdge) {
        billCardTurning.current = false;
        return;
      }
      setBillCardShowingDetails(!showingDetails);
      animateScale(1, () => {
        billCardTurning.current = false;
      });
    });
  };

  const beginSignIn = () => {
    setIsGuest(false);
    setScreen('sign-in');
  };

  const enterGuestPortal = () => {
    setIsGuest(true);
    setGuestSection('home');
    setScreen('public-services');
  };

  const signIn = async () => {
    if (!accountNumber.trim()) {
      showNotice('Enter your CWASA account number.');
      return;
    }
    if (!password) {
      showNotice('Enter your password.');
      return;
    }
    setAuthBusy(true);
    try {
      const session = await loginCustomer(accountNumber.trim(), password);
      setCustomerSession(session);
      setPassword('');
      setIsGuest(false);
      setScreen('home');
      showNotice(t('welcomeBack'));
    } catch (error) {
      if (error instanceof ApiConnectionError) {
        showNotice('Could not reach the CWASA server.');
      } else if (error instanceof ApiRequestError && (error.status === 401 || error.status === 404)) {
        showNotice('The account number or password is incorrect.');
      } else {
        showNotice('Could not sign in. Please try again.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const signUp = async () => {
    const account = accountNumber.trim();
    const contact = registrationContact.trim();
    if (!account) {
      showNotice('Enter your CWASA account number.');
      return;
    }
    if (!contact) {
      showNotice('Enter your email address or phone number.');
      return;
    }
    let verificationContact: { email: string } | { phone: string };
    if (contact.includes('@')) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
        showNotice('Enter a valid email address or phone number.');
        return;
      }
      verificationContact = { email: contact };
    } else {
      let digits = contact.replace(/\D/g, '');
      if (digits.startsWith('880')) digits = digits.slice(3);
      if (digits.startsWith('0')) digits = digits.slice(1);
      if (!/^1\d{9}$/.test(digits)) {
        showNotice('Enter a valid Bangladesh mobile number beginning with 01, or use your registered email.');
        return;
      }
      verificationContact = { phone: `0${digits}` };
    }
    if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      showNotice('Use a password of 8 to 72 characters with at least one letter and one number.');
      return;
    }
    if (password !== confirmPassword) {
      showNotice('The two passwords do not match.');
      return;
    }
    setAuthBusy(true);
    try {
      await registerCustomer(account, verificationContact, password);
      setPassword('');
      setConfirmPassword('');
      setRegistrationContact('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setScreen('sign-in');
      showNotice('Your password has been created. Please sign in.');
    } catch (error) {
      if (error instanceof ApiConnectionError) {
        showNotice('Could not reach the CWASA server.');
      } else if (error instanceof ApiRequestError && error.status === 404) {
        showNotice('We could not verify that account with the supplied email or phone number.');
      } else if (error instanceof ApiRequestError && (error.status === 400 || error.status === 409)) {
        showNotice(error.message);
      } else {
        showNotice('Could not create your account. Please try again.');
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

  const TextLabel = ({ children, style, bold = false }: { children: React.ReactNode; style?: object; bold?: boolean }) => (
    <Text style={[
      styles.text,
      {
        fontFamily: fontFamilyForText(
          typeof children === 'string' || typeof children === 'number' ? String(children) : '',
          bold,
          language,
        ),
        fontSize: largeText ? 17 : 14,
      },
      style,
    ]}>
      {children}
    </Text>
  );

  const FieldImpl = ({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    multiline = false,
    secure = false,
    revealed = false,
    onToggleReveal,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
    multiline?: boolean;
    secure?: boolean;
    revealed?: boolean;
    onToggleReveal?: () => void;
  }) => (
    <View style={styles.field}>
      <TextLabel style={styles.fieldLabel}>{label}</TextLabel>
      <View>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType ?? 'default'}
          multiline={multiline}
          secureTextEntry={secure && !revealed}
          autoCapitalize={secure ? 'none' : undefined}
          autoCorrect={secure ? false : undefined}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[
            sharedStyles.input,
            multiline && styles.multilineInput,
            secure && onToggleReveal ? { paddingRight: 46 } : null,
            { fontFamily: fontFamilyForText(value || placeholder || label, false, language), fontSize: largeText ? 17 : 14 },
          ]}
        />
        {secure && onToggleReveal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={onToggleReveal}
            hitSlop={8}
            style={{ position: 'absolute', right: 4, top: 0, bottom: 0, width: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 18 }}>{revealed ? '🔒' : '👁'}</Text>
          </Pressable>
        ) : null}
      </View>
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

  const CardImpl = ({ children, style }: { children: React.ReactNode; style?: object }) => (
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

  const Field = useStableComponent(FieldImpl);
  const Card = useStableComponent(CardImpl);

  if (!fontsLoaded) {
    return <View style={styles.loading}><Text style={styles.loadingText}>CWASA</Text></View>;
  }

  const breakdownRow = (label: string, value: string, bold = false) => (
    <View key={label} style={styles.rowBetween}>
      <TextLabel bold={bold}>{label}</TextLabel>
      <TextLabel bold={bold}>{value}</TextLabel>
    </View>
  );

  const renderBreakdown = (bill: BillDetail) => {
    const overdue = isPastDue(bill);
    const payableToday = amountPayableToday(bill);
    return (
      <Card>
        <View style={styles.rowBetween}>
          <TextLabel bold>{bill.billNumber || 'Water bill'}</TextLabel>
          <TextLabel style={bill.status === 'PAID' ? styles.paidPill : styles.statusPill}>
            {bill.status === 'PAID' ? t('paid') : overdue ? 'Overdue' : t('pending')}
          </TextLabel>
        </View>
        {displayName ? <TextLabel bold>{displayName}</TextLabel> : null}
        <TextLabel style={styles.helperText}>
          Account {displayAccountNo} · Meter {bill.meterNo ?? displayMeter ?? '-'}
        </TextLabel>
        {(profile?.address ?? bill.address) ? <TextLabel style={styles.helperText}>{profile?.address ?? bill.address}</TextLabel> : null}
        <TextLabel style={styles.helperText}>
          Billing period {formatBillDate(bill.periodStart)} to {formatBillDate(bill.periodEnd)}
        </TextLabel>
        <View style={styles.amountLine}>
          <TextLabel style={styles.billAmount}>{formatTaka(payableToday)}</TextLabel>
          <TextLabel style={styles.helperText}>Due {formatBillDate(bill.dueDate)}</TextLabel>
        </View>
        <TextLabel style={styles.helperText}>Issued {formatBillDate(bill.issueDate)}</TextLabel>
        <View style={styles.separator} />
        {breakdownRow('Previous reading', `${bill.previousReading ?? '-'} m³`)}
        {breakdownRow('Present reading', `${bill.currentReading ?? '-'} m³`)}
        {breakdownRow(bill.isMinimumBilled ? 'Consumption (minimum billed)' : 'Consumption', `${bill.consumption ?? '-'} m³`)}
        <View style={styles.separator} />
        {breakdownRow(`Water charge${bill.ratePerM3 !== null ? ` @ ${formatTaka(bill.ratePerM3)}/m³` : ''}`, formatTaka(bill.waterCharge))}
        {breakdownRow(`VAT${bill.vatPercentage !== null ? ` @ ${bill.vatPercentage}%` : ''}`, formatTaka(bill.vatAmount))}
        {bill.additionalCharge !== 0 ? breakdownRow('Additional water charge', formatTaka(bill.additionalCharge)) : null}
        {bill.arrears !== 0 ? breakdownRow('Arrears and adjustments', formatTaka(bill.arrears)) : null}
        <View style={styles.separator} />
        {breakdownRow(`Net payable by ${formatBillDate(bill.dueDate)}`, formatTaka(bill.netPayable), true)}
        {bill.surcharges.length > 0 ? (
          <View>
            <View style={styles.separator} />
            <TextLabel bold>If paid late</TextLabel>
            <TextLabel style={styles.helperText}>A late payment charge is added to the water charge, before VAT.</TextLabel>
            {bill.surcharges.map((step) => {
              const current = overdue && formatBillDate(step.deadline) === formatBillDate(
                bill.surcharges.find((item) => startOfDay(new Date(item.deadline)) >= startOfDay(new Date()))?.deadline
                  ?? bill.surcharges[bill.surcharges.length - 1].deadline,
              );
              return breakdownRow(
                `By ${formatBillDate(step.deadline)} · +${step.percentage}% (${formatTaka(step.surchargeAmount)})`,
                formatTaka(step.totalPayable),
                current,
              );
            })}
          </View>
        ) : null}
      </Card>
    );
  };

  const contentFrame = wide && screen !== 'home' ? { width: '100%' as const, maxWidth: 720, alignSelf: 'center' as const } : undefined;
  const authScreen = screen === 'sign-in' || screen === 'sign-up';

  const header = (
    <View style={[styles.header, wide && styles.headerWide, compact && { paddingHorizontal: 12, gap: 6 }]}>
      <Pressable onPress={() => setScreen('home')} accessibilityLabel={t('home')}>
        <Image source={require('./assets/cwasa-logo.png')} style={styles.headerLogo} resizeMode="contain" />
      </Pressable>
      <View style={[styles.brandText, { minWidth: 0 }]}>
        <TextLabel bold style={styles.brandName}>CHATTOGRAM WASA</TextLabel>
        {compact ? null : <TextLabel style={styles.headingSubtitle}>Digital Water Services</TextLabel>}
      </View>
      <View style={[styles.headerActions, compact && { gap: 6 }]}>
        {authScreen ? null : (
          <Pressable onPress={() => openPublicServices()} style={styles.publicInfoButton} accessibilityLabel={translateGuest(language, 'publicServices')}>
          <TextLabel style={styles.publicInfoText}>ⓘ</TextLabel>
        </Pressable>
        )}
        <Pressable onPress={() => setLanguage((current) => current === 'en' ? 'bn' : 'en')} style={styles.languageButton} accessibilityLabel={t('language')}>
          <TextLabel style={styles.languageText}>{language === 'en' ? 'বাং' : 'EN'}</TextLabel>
        </Pressable>
        {authScreen ? null : (
          <Pressable onPress={() => setScreen('notifications')} style={styles.notificationButton} accessibilityLabel={t('notifications')}>
          <Text style={styles.notificationIcon}>🔔</Text>
          {unreadCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.badgeText}>{unreadCount}</Text></View> : null}
        </Pressable>
        )}
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
          <TextLabel bold style={[styles.navIcon, (screen === target || (target === 'support' && ['complaint-form', 'complaints', 'new-connection', 'application'].includes(screen))) && styles.navSelected]}>{icon}</TextLabel>
          <TextLabel bold style={[styles.navLabel, (screen === target || (target === 'support' && ['complaint-form', 'complaints', 'new-connection', 'application'].includes(screen))) && styles.navSelected]}>{label}</TextLabel>
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
            <Heading title="Sign in" subtitle="Sign in to manage your CWASA services." />
            <Card>
              <Field label="Account number" value={accountNumber} onChangeText={setAccountNumber} placeholder="070046SD" />
              <Field label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" secure revealed={showPassword} onToggleReveal={() => setShowPassword((v) => !v)} />
              <ActionButton title={authBusy ? '...' : 'Sign in'} onPress={signIn} fontFamily={font} />
            </Card>
            <LinkAction title="New here? Create an account" onPress={() => { setPassword(''); setShowPassword(false); setScreen('sign-up'); }} />
            <LinkAction title={t('exploreGuest')} onPress={enterGuestPortal} />
            <ActionButton title={t('back')} onPress={() => setScreen('welcome')} secondary fontFamily={font} />
          </View>
        );
      case 'sign-up':
        return (
          <View style={styles.formScreen}>
            <Heading title="Create account" subtitle="Register with you CWASA account number." />
            <Card>
              <Field label="Account number" value={accountNumber} onChangeText={setAccountNumber} placeholder="070046SD" />
              <View style={styles.field}>
                <TextLabel style={styles.fieldLabel}>Email or phone</TextLabel>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 11, backgroundColor: colors.white, minHeight: 46 }}>
                  {!registrationContact.includes('@') && !/^\+?880/.test(registrationContact) ? (
                    <TextLabel style={{ color: colors.ink, paddingLeft: 13, paddingRight: 8 }}>BD +880</TextLabel>
                  ) : null}
                  <TextInput
                    accessibilityLabel="Email or phone"
                    value={registrationContact}
                    onChangeText={setRegistrationContact}
                    placeholder="Email address or mobile number"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      sharedStyles.input,
                      { flex: 1, minHeight: 44, borderWidth: 0, paddingLeft: 5, fontFamily: fontFamilyForText(registrationContact || 'Email or phone', false, language), fontSize: largeText ? 17 : 14 },
                    ]}
                  />
                </View>
                <TextLabel style={styles.helperText}>Enter a Bangladesh mobile number beginning with 01, or enter the 10 digits after BD +880. You can also enter an email address.</TextLabel>
              </View>
              <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secure revealed={showPassword} onToggleReveal={() => setShowPassword((v) => !v)} />
              <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter your password" secure revealed={showConfirmPassword} onToggleReveal={() => setShowConfirmPassword((v) => !v)} />
              <TextLabel style={styles.helperText}>Use 8 to 72 characters with at least one letter and one number.</TextLabel>
              <ActionButton title={authBusy ? '...' : 'Create account'} onPress={signUp} fontFamily={font} />
            </Card>
            <LinkAction title="Already have an account? Sign in" onPress={() => { setPassword(''); setConfirmPassword(''); setShowPassword(false); setShowConfirmPassword(false); setScreen('sign-in'); }} />
            <ActionButton title={t('back')} onPress={() => setScreen('welcome')} secondary fontFamily={font} />
          </View>
        );
      case 'home':
        return (
          <View>
            <Heading title={`${t('welcomeBack')}, ${displayName || displayAccountNo}`} />
            <View style={[styles.dashboardRow, wide && styles.dashboardRowWide]}>
              <View style={[styles.billCardViewport, wide && styles.billCardViewportWide, !wide && { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }, { height: billCardHeight }]}>
                <Animated.View
                  style={[
                    styles.billCardFlipContainer,
                    { transform: [{ scaleX: billCardFlipScale }] },
                  ]}
                >
                {billCardShowingDetails ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={language === 'bn' ? 'বিলে ফিরে যান' : 'Return to bill card'}
                    onPress={flipBillCard}
                    style={[styles.billReceiptFace, styles.billCardDetailsPressable]}
                  >
                    <View pointerEvents="none" style={styles.billReceiptContent}>
                      {latestBill ? (
                        <>
                          <View style={styles.billReceiptHeader}>
                            <View>
                              <TextLabel bold style={styles.billReceiptTitle}>{language === 'bn' ? 'পানির বিল' : 'WATER BILL'}</TextLabel>
                              <TextLabel style={styles.billReceiptMeta}>Bill No. {latestBill.billNumber || '-'}</TextLabel>
                            </View>
                            <TextLabel style={styles.billReceiptPeriod}>{latestBill.periodEnd ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(latestBill.periodEnd)).toUpperCase() : ''}</TextLabel>
                          </View>
                          <View style={styles.billReceiptDivider} />
                          <View style={styles.billReceiptRow}>
                            <TextLabel style={styles.billReceiptLabel}>Previous reading</TextLabel>
                            <TextLabel bold style={styles.billReceiptValue}>{latestBill.previousReading ?? '-'} m³</TextLabel>
                          </View>
                          <View style={styles.billReceiptRow}>
                            <TextLabel style={styles.billReceiptLabel}>Present reading</TextLabel>
                            <TextLabel bold style={styles.billReceiptValue}>{latestBill.currentReading ?? '-'} m³</TextLabel>
                          </View>
                          <View style={styles.billReceiptRow}>
                            <TextLabel style={styles.billReceiptLabel}>Consumption</TextLabel>
                            <TextLabel bold style={styles.billReceiptValue}>{latestBill.consumption ?? '-'} m³</TextLabel>
                          </View>
                          <View style={styles.billReceiptDivider} />
                          <View style={styles.billReceiptRow}>
                            <TextLabel style={styles.billReceiptLabel}>Water charge{latestBill.ratePerM3 !== null ? ` @ ${formatTaka(latestBill.ratePerM3)}/m³` : ''}</TextLabel>
                            <TextLabel style={styles.billReceiptValue}>{formatTaka(latestBill.waterCharge)}</TextLabel>
                          </View>
                          <View style={styles.billReceiptRow}>
                            <TextLabel style={styles.billReceiptLabel}>VAT{latestBill.vatPercentage !== null ? ` @ ${latestBill.vatPercentage}%` : ''}</TextLabel>
                            <TextLabel style={styles.billReceiptValue}>{formatTaka(latestBill.vatAmount)}</TextLabel>
                          </View>
                          {latestBill.arrears + latestBill.adjustments !== 0 ? (
                            <View style={styles.billReceiptRow}>
                              <TextLabel style={styles.billReceiptLabel}>Arrears and adjustments</TextLabel>
                              <TextLabel style={styles.billReceiptValue}>{formatTaka(latestBill.arrears + latestBill.adjustments)}</TextLabel>
                            </View>
                          ) : null}
                          <View style={styles.billReceiptTotal}>
                            <TextLabel bold style={styles.billReceiptTotalLabel}>NET PAYABLE</TextLabel>
                            <TextLabel bold style={styles.billReceiptTotalAmount}>{formatTaka(latestBill.netPayable)}</TextLabel>
                          </View>
                        </>
                      ) : (
                        <TextLabel style={styles.billReceiptLabel}>Your bill will appear here once it is issued.</TextLabel>
                      )}
                    </View>
                  </Pressable>
                ) : (
                  <View style={[styles.billHero, styles.billCardFace, wide && styles.billHeroWide]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={language === 'bn' ? 'বিলের বিবরণ দেখুন' : 'Show bill details'}
                      accessibilityState={{ expanded: false }}
                      onPress={flipBillCard}
                      style={styles.billCardFlipHitArea}
                    />
                    <View pointerEvents="none" style={styles.billFrontContent}>
                      <Animated.View style={[styles.billShine, { transform: [{ translateX: billCardShine.interpolate({ inputRange: [0, 1], outputRange: [-320, 620] }) }, { rotate: '22deg' }] }]} />
                      <View style={styles.heroTop}>
                        <TextLabel style={styles.heroEyebrow}>{t('currentBill')}</TextLabel>
                        <TextLabel style={styles.heroTag}>{billIsPaid ? t('paid') : billIsOverdue ? 'Overdue' : t('pending')}</TextLabel>
                      </View>
                      <View style={styles.billFrontMiddle}>
                        <View>
                          <TextLabel bold style={styles.heroAmount}>{!latestBill ? '৳ -' : billIsPaid ? '৳ 0' : `৳ ${Math.round(currentBillAmount).toLocaleString()}`}</TextLabel>
                          <TextLabel style={styles.heroDue}>{!latestBill ? 'No bill available yet' : billIsPaid ? 'Paid in full' : `Due ${formatBillDate(latestBill.dueDate)}`}</TextLabel>
                          <TextLabel style={styles.billFlipHint}>{language === 'bn' ? 'বিলের বিস্তারিত দেখতে ট্যাপ করুন' : 'Tap card to view breakdown'}　↻</TextLabel>
                        </View>
                        <View style={styles.billCurrencySymbol}><TextLabel bold style={styles.billCurrencyText}>৳</TextLabel></View>
                      </View>
                      <View style={styles.heroBottom}>
                        <TextLabel style={styles.heroAccount}>Account {displayAccountNo}{latestBill?.billNumber ? ` · Bill ${latestBill.billNumber}` : ''}</TextLabel>
                      </View>
                    </View>
                    <View style={styles.billPayButton}>
                      <ActionButton
                        title={billIsPaid ? t('transactionHistory') : t('payNow')}
                        onPress={() => { if (billIsPaid) setScreen('history'); else setScreen('bill'); }}
                        disabled={!latestBill}
                        fontFamily={font}
                        compact
                      />
                    </View>
                  </View>
                )}
                </Animated.View>
              </View>
              <View style={[styles.serviceGrid, wide && styles.serviceGridWide]}>
                <SectionTitle title={t('services')} />
                <View style={styles.tileGrid}>
                  {serviceTiles.slice(0, 4).map((tile) => (
                    <Pressable key={tile.title} onPress={() => setScreen(tile.screen)} style={[styles.serviceTile, veryCompact && { width: '48%' }]}>
                      <View style={[styles.tileIcon, { backgroundColor: `${tile.color}15` }]}><TextLabel bold style={{ color: tile.color, fontSize: 20 }}>{tile.icon}</TextLabel></View>
                      <TextLabel style={styles.tileLabel}>{t(tile.title)}</TextLabel>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <Card style={styles.quickHelp}>
              <View style={styles.quickHelpText}>
                <TextLabel bold>{t('quickHelp')}</TextLabel>
                <TextLabel style={styles.helperText}>Call our customer service team any time.</TextLabel>
              </View>
              <ActionButton title={t('hotline')} onPress={() => Linking.openURL('tel:16129').catch((error) => showNotice(error.message))} secondary fontFamily={font} compact />
            </Card>
            {/* <SectionTitle title={t('trackApplication')} action="See all" onAction={() => setScreen('application')} />
            <Card style={styles.applicationPreview}>
              <View style={styles.rowBetween}><TextLabel bold>{applicationId}</TextLabel><TextLabel style={styles.statusPill}>{t('inProgress')}</TextLabel></View>
              <TextLabel style={styles.helperText}>{applicationSummary} · Submitted 10 May 2026</TextLabel>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${applicationStage * 25}%` }]} /></View>
              <LinkAction title={t('trackApplication')} onPress={() => setScreen('application')} />
            </Card> */}
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
            <Heading title={t('billDetails')}/>
            <View style={styles.billTabs}>
              <Pressable onPress={() => setBillFilter('due')} style={[styles.billTab, billFilter === 'due' && styles.billTabActive]}><TextLabel style={[styles.billTabText, billFilter === 'due' && styles.billTabTextActive]}>{t('dueBills')}</TextLabel></Pressable>
              <Pressable onPress={() => setBillFilter('paid')} style={[styles.billTab, billFilter === 'paid' && styles.billTabActive]}><TextLabel style={[styles.billTabText, billFilter === 'paid' && styles.billTabTextActive]}>{t('paidBills')}</TextLabel></Pressable>
            </View>
            {billFilter === 'paid' ? (
              <View>
                {customerBills.filter((bill) => bill.status === 'PAID').map((bill) => renderBreakdown(bill))}
                {customerBills.every((bill) => bill.status !== 'PAID') && payments.length === 0 ? <Card><TextLabel style={styles.helperText}>No paid bills yet.</TextLabel></Card> : null}
                {payments.map((payment) => <Card key={payment.id}><View style={styles.rowBetween}><TextLabel bold>{payment.date} water bill</TextLabel><TextLabel style={styles.paidPill}>{t('paid')}</TextLabel></View><TextLabel style={styles.helperText}>{payment.id} · {payment.method}</TextLabel><View style={styles.rowBetween}><TextLabel>{t('totalPayable')}</TextLabel><TextLabel bold>৳{payment.amount.toLocaleString()}</TextLabel></View></Card>)}
                <ActionButton title={t('paymentHistory')} onPress={() => setScreen('history')} secondary fontFamily={font} />
              </View>
            ) : billIsPaid || !latestBill ? (
              <View><Card><TextLabel bold>{!latestBill ? 'No bill available yet' : (language === 'bn' ? 'কোনো বকেয়া বিল নেই' : 'No bills due')}</TextLabel><TextLabel style={styles.helperText}>{!latestBill ? 'Your bill will appear here once it has been issued.' : (language === 'bn' ? 'বর্তমান বিল সম্পূর্ণ পরিশোধিত।' : 'Your current bill is paid in full.')}</TextLabel><ActionButton title={t('paidBills')} onPress={() => setBillFilter('paid')} secondary fontFamily={font} /></Card></View>
            ) : (
              <>
                {renderBreakdown(latestBill)}
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
              </>
            )}
          </View>
        );
      case 'history':
        return (
          <View>
            <Heading title={t('paymentHistory')} subtitle="Your recent water bill payments." />
            <Card style={styles.balanceCard}>
              <View style={styles.rowBetween}><View><TextLabel style={styles.heroEyebrow}>{t('currentBill')}</TextLabel><TextLabel bold style={styles.heroAmount}>{latestBill ? formatTaka(billIsPaid ? 0 : currentBillAmount) : '৳ -'}</TextLabel></View><ActionButton title={t('export')} onPress={exportHistory} secondary fontFamily={font} compact /></View>
              <TextLabel style={styles.heroEyebrow}>{displayAccountNo}</TextLabel>
            </Card>
            {payments.length === 0 ? <Card><TextLabel style={styles.helperText}>No payments yet.</TextLabel></Card> : null}
            {payments.map((payment) => (
              <Card key={payment.id} style={styles.historyCard}>
                <View style={styles.historyIcon}><TextLabel bold style={styles.historyCheck}>✓</TextLabel></View>
                <View style={styles.historyDetails}>
                  <View style={styles.rowBetween}><TextLabel bold>{payment.date} water bill</TextLabel><TextLabel style={styles.paidPill}>{t('paid')}</TextLabel></View>
                  <TextLabel style={styles.helperText}>{displayAccountNo} · {payment.id}</TextLabel>
                  <View style={styles.rowBetween}><TextLabel style={styles.helperText}>{payment.method}</TextLabel><TextLabel bold>৳{payment.amount.toLocaleString()}</TextLabel></View>
                  <LinkAction title="View receipt" onPress={() => showNotice(`${t('paymentReference')}: ${payment.id}`)} />
                </View>
              </Card>
            ))}
          </View>
        );
      // case 'new-connection':
      //   return (
      //     <View>
      //       <Heading title={t('applyConnection')} subtitle="Submit your property details to get started." />
      //       <Card>
      //         <SectionTitle title={t('connectionCategory')} />
      //         <OptionChips options={['domestic', 'commercial', 'nonDomestic']} selected={connectionCategory} onSelect={setConnectionCategory} />
      //         <Field label={t('applicantName')} value={connectionName} onChangeText={setConnectionName} placeholder="Full name" />
      //         <Field label={t('nationalId')} value={nationalId} onChangeText={setNationalId} placeholder="10, 13 or 17 digits" keyboardType="numeric" />
      //         <Field label={t('holdingNumber')} value={holdingNumber} onChangeText={setHoldingNumber} />
      //         <Field label={t('propertyType')} value={propertyType} onChangeText={setPropertyType} placeholder={t('propertyResidential')} />
      //         <SectionTitle title={t('pipeDiameter')} />
      //         <View style={styles.chipWrap}>
      //           {['½″', '¾″', '1″', '1½″'].map((diameter) => <Chip key={diameter} title={diameter} selected={pipeDiameter === diameter} onPress={() => setPipeDiameter(diameter)} fontFamily={font} />)}
      //         </View>
      //         <View style={styles.locationHeader}><TextLabel bold>{t('siteLocation')}</TextLabel><Pressable onPress={captureLocation}><TextLabel style={styles.linkText}>{t('useMyLocation')}</TextLabel></Pressable></View>
      //         <View style={styles.locationBox}><TextLabel style={styles.locationPin}>⌖</TextLabel><TextLabel style={styles.locationAddress}>{siteLocation}</TextLabel><Pressable onPress={captureLocation}><TextLabel style={styles.linkText}>{t('change')}</TextLabel></Pressable></View>
      //         {coordinates ? <TextLabel style={styles.coordinateText}>{coordinates}</TextLabel> : null}
      //         <Field label={t('email')} value={connectionEmail} onChangeText={setConnectionEmail} placeholder="name@example.com" keyboardType="email-address" />
      //         <TextLabel style={styles.infoText}>{t('connectionFeeInfo')}</TextLabel>
      //         <ActionButton title={t('submitApplication')} onPress={submitNewApplication} fontFamily={font} />
      //       </Card>
      //     </View>
      //   );
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
                  <View style={styles.notificationItemContent}><View style={styles.rowBetween}><TextLabel bold>{item.title}</TextLabel></View><TextLabel style={styles.helperText}>{item.detail}</TextLabel></View>
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
                <View style={styles.avatar}><TextLabel bold style={styles.avatarText}>{(displayName || displayAccountNo).split(/\s+/).map((word) => word.charAt(0)).slice(0, 2).join('').toUpperCase()}</TextLabel></View>
                <View style={styles.profileDetails}>
                  <TextLabel bold style={styles.profileName}>{displayName || displayAccountNo}</TextLabel>
                  <TextLabel style={styles.helperText}>{profile?.mobileNo ?? 'Mobile number not on file'}</TextLabel>
                  <TextLabel style={styles.helperText}>Account {displayAccountNo}</TextLabel>
                  <TextLabel style={styles.helperText}>Meter {displayMeter ?? '-'}</TextLabel>
                </View>
              </View>
              <View style={styles.profileStats}>
                {[
                  [String(customerBills.length), 'Bills'],
                  [String(customerBills.filter((bill) => bill.status === 'PAID').length), 'Paid'],
                  [String(customerBills.filter((bill) => bill.status !== 'PAID' && bill.status !== 'CANCELLED').length), 'Due'],
                ].map(([value, label]) => <View key={label} style={styles.profileStat}><TextLabel bold style={styles.profileStatNumber}>{value}</TextLabel><TextLabel style={styles.helperText}>{label}</TextLabel></View>)}
              </View>
            </Card>
            <SectionTitle title={t('myConnections')} />
            <Card style={styles.connectionCard}>
              <View style={styles.connectionIndicator} />
              <View style={styles.connectionInfo}>
                <TextLabel bold>{profile?.address ?? 'Service address not on file'}</TextLabel>
                <TextLabel style={styles.helperText}>
                  {[profile?.propertyType, profile?.wardNo ? `Ward ${profile.wardNo}` : null, profile?.connectionSize ? `${profile.connectionSize} connection` : null].filter(Boolean).join(' · ') || `Account ${displayAccountNo}`}
                </TextLabel>
              </View>
            </Card>
            <Card>
              <SectionTitle title={t('preferences')} />
              <View style={styles.preferenceRow}><View><TextLabel bold>{t('language')}</TextLabel><TextLabel style={styles.helperText}>{language === 'en' ? 'বাংলা, English' : 'বাংলা, English'}</TextLabel></View><View style={styles.preferenceActions}><Pressable onPress={() => setLanguage('bn')}><TextLabel style={[styles.languageChoice, language === 'bn' && styles.languageChoiceSelected]}>বাং</TextLabel></Pressable><Pressable onPress={() => setLanguage('en')}><TextLabel style={[styles.languageChoice, language === 'en' && styles.languageChoiceSelected]}>EN</TextLabel></Pressable></View></View>
              <View style={styles.separator} />
              <PreferenceToggle title={t('largeText')} value={largeText} onChange={setLargeText} />
              <PreferenceToggle title={t('smsFallback')} value={smsFallback} onChange={setSmsFallback} />
              <View style={styles.separator} />
              <ActionButton title={translateGuest(language, 'publicServices')} onPress={() => openPublicServices()} secondary fontFamily={font} />
              <ActionButton title={language === 'bn' ? 'লগ আউট' : 'Sign out'} onPress={() => { signOutCustomer(); setPassword(''); setCustomerSession(null); setCustomerBills([]); setProfile(null); setNotifications([]); setSiteLocation(''); setPaymentPhone(''); setIsGuest(false); setScreen('welcome'); }} secondary fontFamily={font} />
            </Card>
          </View>
        );
      case 'public-services':
        return (
          <GuestServices
            section={guestSection}
            language={language}
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

  if (screen === 'welcome') {
    return (
      <View style={styles.welcomeRoot}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {screenContent}
        </ScrollView>
        {notice ? <TextLabel style={styles.notice}>{notice}</TextLabel> : null}
      </View>
    );
  }

  if (screen === 'public-services' && isGuest) {
    return (
      <View style={styles.guestRoot}>
        <StatusBar style="dark" />
        <View style={[styles.guestShell, tablet && !wide && { maxWidth: 720 }, wide && styles.appShellWide]}>
          <View style={[styles.header, styles.guestHeader, wide && styles.headerWide]}>
            <Pressable onPress={() => setGuestSection('home')} accessibilityLabel={translateGuest(language, 'guestWelcome')}>
              <Image source={require('./assets/cwasa-logo.png')} style={styles.headerLogo} resizeMode="contain" />
            </Pressable>
            <View style={styles.brandText}>
              <TextLabel bold style={styles.brandName}>CHATTOGRAM WASA</TextLabel>
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
            <View style={contentFrame}>{screenContent}</View>
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
      <View style={[styles.appShell, tablet && !wide && { maxWidth: 720 }, wide && styles.appShellWide]}>
        {header}
        <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]} keyboardShouldPersistTaps="handled">
          {notice ? <Pressable onPress={() => setNotice('')}><TextLabel style={styles.notice}>{notice}　×</TextLabel></Pressable> : null}
          <View style={contentFrame}>{screenContent}</View>
          <View style={styles.footer}>
          </View>
        </ScrollView>
        {authScreen ? null : bottomNav}
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