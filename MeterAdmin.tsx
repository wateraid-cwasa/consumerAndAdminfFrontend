import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { colors, fontFamilyForText, openSansRegular, sharedStyles } from './theme';
import styles from './meterAdminStyles';
import {
  getMeterReadings,
  MeterReading,
  MeterReadingStatus,
  updateMeterReading,
} from './meterReadings';

type AdminLanguage = 'en' | 'bn';
type QueueFilter = 'pending' | 'approved' | 'rejected' | 'all';

const copy = {
  en: {
    admin: 'Meter Reading Administration',
    subtitle: 'Review, correct, and approve meter-reader submissions.',
    queue: 'Reading review queue',
    pending: 'Pending review',
    approved: 'Approved',
    rejected: 'Rejected',
    total: 'Total readings',
    search: 'Search customer, account, meter, or location',
    noRecords: 'No readings in this queue.',
    details: 'Reading submission',
    customer: 'Customer',
    account: 'Account number',
    location: 'Service location',
    meter: 'Meter number',
    previous: 'Previous reading',
    current: 'Current reading',
    consumption: 'Consumption',
    unit: 'm³',
    date: 'Reading date',
    submitted: 'Submitted',
    reader: 'Meter reader',
    notes: 'Reader notes / verification notes',
    save: 'Save edits',
    approve: 'Approve reading',
    reject: 'Reject reading',
    choose: 'Choose a reading to review',
    emptySelection: 'Select a submission from the queue to review its meter and customer information.',
    saved: 'Changes saved.',
    approvedNotice: 'Reading approved. The customer platform has been updated in this browser.',
    rejectedNotice: 'Reading rejected and returned for correction.',
    approveConfirmation: 'Approve this reading and publish it to the customer account?',
    rejectConfirmation: 'Reject this reading and return it for correction?',
    meterWarning: 'The current reading is below the previous reading. Correct the values before approval.',
    localOnly: 'Prototype data only · Changes are shared across this browser with local storage. Production requires an authenticated admin account and backend.',
    status: 'Status',
    noSearchResults: 'No readings match your search.',
    editHint: 'Check the submitted values, correct them if needed, then approve or reject.',
    signOut: 'Customer platform',
    logOut: 'Sign out',
    signIn: 'Admin sign in',
    email: 'Email',
    password: 'Password',
    invalidCredentials: 'The email or password is incorrect.',
    signInHelp: 'Sign in with your meter administration credentials.',
    demoSecurity: 'Prototype sign-in only. Credentials are checked in this browser and do not provide production security.',
  },
  bn: {
    admin: 'মিটার রিডিং প্রশাসন',
    subtitle: 'মিটার রিডারের জমা দেওয়া তথ্য যাচাই, সংশোধন ও অনুমোদন করুন।',
    queue: 'রিডিং যাচাইয়ের তালিকা',
    pending: 'অনুমোদনের অপেক্ষায়',
    approved: 'অনুমোদিত',
    rejected: 'বাতিল',
    total: 'মোট রিডিং',
    search: 'গ্রাহক, অ্যাকাউন্ট, মিটার বা অবস্থান খুঁজুন',
    noRecords: 'এই তালিকায় কোনো রিডিং নেই।',
    details: 'রিডিং জমার তথ্য',
    customer: 'গ্রাহক',
    account: 'অ্যাকাউন্ট নম্বর',
    location: 'সেবার অবস্থান',
    meter: 'মিটার নম্বর',
    previous: 'পূর্বের রিডিং',
    current: 'বর্তমান রিডিং',
    consumption: 'ব্যবহার',
    unit: 'ঘনমিটার',
    date: 'রিডিংয়ের তারিখ',
    submitted: 'জমা দেওয়া হয়েছে',
    reader: 'মিটার রিডার',
    notes: 'রিডারের নোট / যাচাইয়ের নোট',
    save: 'সংশোধন সংরক্ষণ',
    approve: 'রিডিং অনুমোদন',
    reject: 'রিডিং বাতিল',
    choose: 'যাচাই করার জন্য একটি রিডিং বাছাই করুন',
    emptySelection: 'তথ্য যাচাই করতে তালিকা থেকে একটি জমা নির্বাচন করুন।',
    saved: 'সংশোধন সংরক্ষিত হয়েছে।',
    approvedNotice: 'রিডিং অনুমোদিত। এই ব্রাউজারে গ্রাহক প্ল্যাটফর্মও আপডেট হয়েছে।',
    rejectedNotice: 'রিডিং বাতিল করে সংশোধনের জন্য ফেরত পাঠানো হয়েছে।',
    approveConfirmation: 'রিডিং অনুমোদন করে গ্রাহকের অ্যাকাউন্টে প্রকাশ করবেন?',
    rejectConfirmation: 'রিডিং বাতিল করে সংশোধনের জন্য ফেরত দেবেন?',
    meterWarning: 'বর্তমান রিডিং পূর্বের চেয়ে কম। অনুমোদনের আগে মান সংশোধন করুন।',
    localOnly: 'শুধু প্রোটোটাইপ ডেটা · এই ব্রাউজারে local storage-এর মাধ্যমে তথ্য ভাগ হয়। প্রকৃত ব্যবহারে অনুমোদিত অ্যাডমিন অ্যাকাউন্ট ও ব্যাকএন্ড প্রয়োজন।',
    status: 'অবস্থা',
    noSearchResults: 'আপনার খোঁজার সাথে কোনো রিডিং মেলেনি।',
    editHint: 'জমা দেওয়া তথ্য যাচাই করুন, প্রয়োজন হলে সংশোধন করুন, তারপর অনুমোদন বা বাতিল করুন।',
    signOut: 'গ্রাহক প্ল্যাটফর্ম',
    logOut: 'সাইন আউট',
    signIn: 'অ্যাডমিন লগইন',
    email: 'ইমেইল',
    password: 'পাসওয়ার্ড',
    invalidCredentials: 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।',
    signInHelp: 'মিটার প্রশাসনের লগইন তথ্য দিয়ে প্রবেশ করুন।',
    demoSecurity: 'শুধু প্রোটোটাইপ লগইন। তথ্য এই ব্রাউজারেই যাচাই হয়; এটি প্রকৃত নিরাপত্তা নয়।',
  },
} as const;

export default function MeterAdmin() {
  const [fontsLoaded] = useFonts({
    OpenSans: openSansRegular,
    Shurjo: require('./fonts/Shurjo-Regular.ttf'),
    'Shurjo-Bold': require('./fonts/Shurjo-bold.ttf'),
    'RBNylo-Bold': require('./fonts/RBNylo-Bold.otf'),
  });
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const [language, setLanguage] = useState<AdminLanguage>('en');
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [readings, setReadings] = useState(getMeterReadings);
  const [filter, setFilter] = useState<QueueFilter>('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previousDraft, setPreviousDraft] = useState('');
  const [currentDraft, setCurrentDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [notice, setNotice] = useState('');
  const passwordInput = useRef<TextInput | null>(null);
  const t = (key: keyof typeof copy.en) => copy[language][key];

  useEffect(() => {
    const refresh = () => setReadings(getMeterReadings());
    window.addEventListener('storage', refresh);
    window.addEventListener('cwasa-meter-readings-change', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('cwasa-meter-readings-change', refresh);
    };
  }, []);

  const selected = readings.find((reading) => reading.id === selectedId);
  const counts = useMemo(() => ({
    pending: readings.filter((reading) => reading.status === 'pending').length,
    approved: readings.filter((reading) => reading.status === 'approved').length,
    rejected: readings.filter((reading) => reading.status === 'rejected').length,
  }), [readings]);
  const visibleReadings = useMemo(() => readings
    .filter((reading) => filter === 'all' || reading.status === filter)
    .filter((reading) => {
      const query = search.trim().toLocaleLowerCase();
      return !query || [reading.customerName, reading.accountNumber, reading.meterNumber, reading.location, reading.readerName]
        .some((value) => value.toLocaleLowerCase().includes(query));
    })
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)), [filter, readings, search]);

  const signIn = () => {
    if (email.trim() === 'meteradmin' && password === 'meteradmin') {
      setLoginError('');
      setAuthenticated(true);
    } else {
      setLoginError(t('invalidCredentials'));
    }
  };

  const selectReading = (reading: MeterReading) => {
    setSelectedId(reading.id);
    setPreviousDraft(String(reading.previousReading));
    setCurrentDraft(String(reading.currentReading));
    setNotesDraft(reading.notes);
    setNotice('');
  };

  const saveReading = (status?: MeterReadingStatus) => {
    if (!selected) return;
    const previousReading = Number(previousDraft);
    const currentReading = Number(currentDraft);
    if (!Number.isFinite(previousReading) || !Number.isFinite(currentReading) || previousReading < 0 || currentReading < 0) {
      setNotice(language === 'bn' ? 'সঠিক অঋণাত্মক রিডিং লিখুন।' : 'Enter valid non-negative meter readings.');
      return;
    }
    if (status === 'approved' && currentReading < previousReading) {
      setNotice(t('meterWarning'));
      return;
    }
    try {
      const updated = updateMeterReading(selected.id, {
        previousReading,
        currentReading,
        notes: notesDraft.trim(),
        ...(status ? { status } : {}),
      });
      setReadings(getMeterReadings());
      setPreviousDraft(String(updated.previousReading));
      setCurrentDraft(String(updated.currentReading));
      if (status) setFilter(status);
      setNotice(status === 'approved' ? t('approvedNotice') : status === 'rejected' ? t('rejectedNotice') : t('saved'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update the meter reading.');
    }
  };

  const label = (content: string, style?: object, bold = false) => (
    <Text style={[styles.text, { fontFamily: fontFamilyForText(content, bold, language) }, style]}>{content}</Text>
  );

  if (!fontsLoaded) {
    return <View style={styles.loading}><Text style={styles.loadingText}>CWASA</Text></View>;
  }

  if (!authenticated) {
    return (
      <View style={styles.loginRoot}>
        <StatusBar style="dark" />
        <View style={styles.loginTopBar}>
          <View style={styles.brand}>
            <Image source={require('./assets/cwasa-logo.png')} style={styles.logo} resizeMode="contain" />
            <View>{label('CWASA', styles.brandTitle, true)}{label('Meter operations', styles.brandSubtitle)}</View>
          </View>
          <Pressable onPress={() => setLanguage((value) => value === 'en' ? 'bn' : 'en')} style={styles.languageButton}>
            {label(language === 'en' ? 'বাংলা' : 'EN', styles.languageText)}
          </Pressable>
        </View>
        <View style={styles.loginContent}>
          <View style={styles.loginCard}>
            <View style={styles.loginIcon}>{label('⌁', styles.loginIconText, true)}</View>
            {label(t('signIn'), styles.loginTitle, true)}
            {label(t('signInHelp'), styles.loginSubtitle)}
            <View style={styles.loginField}>
              {label(t('email'), styles.fieldLabel, true)}
              <TextInput
                accessibilityLabel={t('email')}
                value={email}
                onChangeText={(value) => { setEmail(value); setLoginError(''); }}
                placeholder={t('email')}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoComplete="username"
                keyboardType="email-address"
                onSubmitEditing={() => passwordInput.current?.focus()}
                style={[sharedStyles.input, { fontFamily: fontFamilyForText(email || t('email'), false, language) }]}
              />
            </View>
            <View style={styles.loginField}>
              {label(t('password'), styles.fieldLabel, true)}
              <TextInput
                ref={passwordInput}
                accessibilityLabel={t('password')}
                value={password}
                onChangeText={(value) => { setPassword(value); setLoginError(''); }}
                placeholder={t('password')}
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoComplete="current-password"
                onSubmitEditing={signIn}
                style={[sharedStyles.input, { fontFamily: fontFamilyForText(password || t('password'), false, language) }]}
              />
            </View>
            {loginError ? label(loginError, styles.loginError) : null}
            <Pressable
              accessibilityRole="button"
              onPress={signIn}
              style={styles.loginButton}
            >
              {label(t('signIn'), styles.loginButtonText, true)}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.shell}>
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Image source={require('./assets/cwasa-logo.png')} style={styles.logo} resizeMode="contain" />
            <View>{label('CWASA', styles.brandTitle, true)}{label(t('admin'), styles.brandSubtitle)}</View>
          </View>
          <View style={styles.topActions}>
            {label('ADMIN · METER OPERATIONS', styles.roleBadge, true)}
            <Pressable onPress={() => setLanguage((value) => value === 'en' ? 'bn' : 'en')} style={styles.languageButton}>
              {label(language === 'en' ? 'বাংলা' : 'EN', styles.languageText)}
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.pageHeading}>
            <View>{label(t('admin'), styles.pageTitle, true)}{label(t('subtitle'), styles.pageSubtitle)}</View>
            <View style={styles.headingActions}>
              <Pressable onPress={() => { window.location.href = '/'; }} style={styles.customerLink}>
                {label(`‹  ${t('signOut')}`, styles.customerLinkText)}
              </Pressable>
              <Pressable onPress={() => { setAuthenticated(false); setPassword(''); setLoginError(''); setSelectedId(null); }} style={styles.logoutButton}>
                {label(t('logOut'), styles.logoutText)}
              </Pressable>
            </View>
          </View>

          <View style={[styles.statRow, wide && styles.statRowWide]}>
            {([
              ['pending', counts.pending, colors.amber],
              ['approved', counts.approved, colors.green],
              ['rejected', counts.rejected, colors.red],
              ['total', readings.length, colors.blue],
            ] as [keyof typeof copy.en, number, string][]).map(([title, count, accent]) => (
              <View key={title} style={styles.statCard}>
                <View style={[styles.statAccent, { backgroundColor: accent }]} />
                <View>{label(t(title), styles.statLabel)}{label(String(count), styles.statValue, true)}</View>
              </View>
            ))}
          </View>

          {notice ? <View style={styles.notice}>{label(notice, styles.noticeText)}</View> : null}
          <View style={[styles.workspace, wide && styles.workspaceWide]}>
            <View style={[styles.queuePanel, wide && styles.queuePanelWide]}>
              <View style={styles.panelHeading}>{label(t('queue'), styles.panelTitle, true)}</View>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('search')}
                placeholderTextColor={colors.muted}
                style={[sharedStyles.input, styles.searchInput, { fontFamily: fontFamilyForText(search || t('search'), false, language) }]}
              />
              <View style={styles.filters}>
                {(['pending', 'approved', 'rejected', 'all'] as QueueFilter[]).map((item) => (
                  <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterButton, filter === item && styles.filterSelected]}>
                    {label(item === 'all' ? t('total') : t(item), [styles.filterText, filter === item && styles.filterTextSelected])}
                  </Pressable>
                ))}
              </View>
              {visibleReadings.map((reading) => (
                <Pressable key={reading.id} onPress={() => selectReading(reading)} style={[styles.queueCard, selectedId === reading.id && styles.queueCardSelected]}>
                  <View style={styles.queueTitleRow}>
                    {label(reading.customerName, styles.queueCustomer, true)}
                    <View style={[styles.statusDot, { backgroundColor: statusColor(reading.status) }]} />
                  </View>
                  {label(`${reading.accountNumber} · ${reading.meterNumber}`, styles.queueMeta)}
                  {label(reading.location, styles.queueLocation)}
                  <View style={styles.queueBottom}>
                    {label(reading.id, styles.readingId)}
                    {label(statusCopy(language, reading.status), { color: statusColor(reading.status) })}
                  </View>
                </Pressable>
              ))}
              {visibleReadings.length === 0 ? label(search ? t('noSearchResults') : t('noRecords'), styles.emptyText) : null}
            </View>

            <View style={[styles.detailsPanel, wide && styles.detailsPanelWide]}>
              {selected ? (
                <>
                  <View style={styles.panelHeadingRow}>{label(t('details'), styles.panelTitle, true)}<View style={[styles.statusPill, { backgroundColor: statusPale(selected.status) }]}>{label(statusCopy(language, selected.status), { color: statusColor(selected.status) })}</View></View>
                  {label(t('editHint'), styles.hint)}
                  <View style={styles.infoGrid}>
                    <Info labelText={t('customer')} value={selected.customerName} label={label} />
                    <Info labelText={t('account')} value={selected.accountNumber} label={label} />
                    <Info labelText={t('location')} value={selected.location} label={label} />
                    <Info labelText={t('meter')} value={selected.meterNumber} label={label} />
                    <Info labelText={t('date')} value={selected.readingDate} label={label} />
                    <Info labelText={t('reader')} value={selected.readerName} label={label} />
                    <Info labelText={t('submitted')} value={new Date(selected.submittedAt).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB')} label={label} />
                  </View>
                  <View style={styles.readingInputs}>
                    <View style={styles.readingField}>
                      {label(t('previous'), styles.fieldLabel, true)}
                      <TextInput value={previousDraft} onChangeText={setPreviousDraft} keyboardType="numeric" style={[sharedStyles.input, { fontFamily: fontFamilyForText(previousDraft, false, language) }]} />
                    </View>
                    <View style={styles.readingField}>
                      {label(t('current'), styles.fieldLabel, true)}
                      <TextInput value={currentDraft} onChangeText={setCurrentDraft} keyboardType="numeric" style={[sharedStyles.input, { fontFamily: fontFamilyForText(currentDraft, false, language) }]} />
                    </View>
                  </View>
                  <View style={styles.consumptionCard}>
                    {label(t('consumption'), styles.consumptionLabel)}
                    {label(`${Math.max(0, (Number(currentDraft) || 0) - (Number(previousDraft) || 0)).toLocaleString()} ${t('unit')}`, styles.consumptionValue, true)}
                  </View>
                  <View style={styles.notesField}>
                    {label(t('notes'), styles.fieldLabel, true)}
                    <TextInput
                      value={notesDraft}
                      onChangeText={setNotesDraft}
                      multiline
                      textAlignVertical="top"
                      style={[sharedStyles.input, styles.notesInput, { fontFamily: fontFamilyForText(notesDraft || t('notes'), false, language) }]}
                    />
                  </View>
                  <View style={styles.actions}>
                    <Pressable onPress={() => saveReading()} style={styles.saveButton}>
                      {label(t('save'), styles.saveText, true)}
                    </Pressable>
                    <View style={styles.reviewActions}>
                      <Pressable onPress={() => saveReading('rejected')} style={styles.rejectButton}>
                        {label(t('reject'), styles.rejectText, true)}
                      </Pressable>
                      <Pressable onPress={() => saveReading('approved')} disabled={Number(currentDraft) < Number(previousDraft)} style={[styles.approveButton, Number(currentDraft) < Number(previousDraft) && styles.disabledButton]}>
                        {label(t('approve'), styles.approveText, true)}
                      </Pressable>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.emptyDetails}>
                  <View style={styles.emptyIcon}>{label('✓', styles.emptyIconText, true)}</View>
                  {label(t('choose'), styles.emptyTitle, true)}
                  {label(t('emptySelection'), styles.emptyDescription)}
                </View>
              )}
            </View>
          </View>
          <View style={styles.prototypeNote}>{label(t('localOnly'), styles.prototypeText)}</View>
        </ScrollView>
      </View>
    </View>
  );
}

function Info({ labelText, value, label }: { labelText: string; value: string; label: (content: string, style?: object, bold?: boolean) => React.ReactNode }) {
  return <View style={styles.infoItem}>{label(labelText, styles.infoLabel)}{label(value, styles.infoValue, true)}</View>;
}

function statusColor(status: MeterReadingStatus): string {
  if (status === 'approved') return colors.green;
  if (status === 'rejected') return colors.red;
  return colors.amber;
}

function statusPale(status: MeterReadingStatus): string {
  if (status === 'approved') return colors.paleGreen;
  if (status === 'rejected') return colors.paleRed;
  return colors.paleAmber;
}

function statusCopy(language: AdminLanguage, status: MeterReadingStatus): string {
  return copy[language][status];
}
