import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, SafeAreaView, FlatList, TouchableOpacity, Modal, TextInput, Alert, Button, ScrollView, Platform, StatusBar } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Calendar, DateData } from 'react-native-calendars';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';

import { Shift, ScraperData, parseTutorShifts, calculateMonthlyTotal, calculateMyBasketWage, calculateHourlyWage, calculateRangeTotal, calculateAnnualTotal, extractLocationName, LocationStats } from './utils/shiftCalculator';
import { loadManualShifts, saveManualShifts, loadExcludedDates, saveExcludedDates, loadExcludedTutorShifts, saveExcludedTutorShifts, loadDiscoveredLocations, saveDiscoveredLocations, resetAllExclusions, loadSalaryOverrides, saveSalaryOverrides } from './utils/storage';
import { fetchShiftsFromSupabase, addShiftToSupabase, updateShiftInSupabase, deleteShiftFromSupabase } from './utils/supabaseService';
// @ts-ignore
import tutorDataRaw from './assets/shifts.json';

// --- Modern iOS Constants ---
const PRIMARY_COLOR = '#007AFF'; // iOS Blue
const BG_COLOR = '#F2F2F7'; // iOS System Grouped Background
const CARD_BG = '#FFFFFF';
const TEXT_COLOR = '#1C1C1E';
const SUBTEXT_COLOR = '#8E8E93';
const DESTRUCTIVE_COLOR = '#FF3B30'; // iOS Red
const SUCCESS_COLOR = '#34C759'; // iOS Green

// Shadow Style for Cards
const SHADOW_STYLE = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  android: {
    elevation: 3,
  },
  web: {
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
  }
});

export default function App() {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [currentMonth, setCurrentMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  const [manualShifts, setManualShifts] = useState<Shift[]>([]);
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [excludedTutorShifts, setExcludedTutorShifts] = useState<string[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [salaryOverrides, setSalaryOverrides] = useState<{ [key: string]: number }>({});

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newShiftTitle, setNewShiftTitle] = useState('');
  const [newShiftSalary, setNewShiftSalary] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('09:00');
  const [newShiftEnd, setNewShiftEnd] = useState('12:00');
  const [newShiftType, setNewShiftType] = useState<'Tutor' | 'MyBasket' | 'Other'>('Tutor');
  const [newHourlyWage, setNewHourlyWage] = useState('');
  const [newShiftLocation, setNewShiftLocation] = useState('');

  // Range Calculation State
  const [rangeModalVisible, setRangeModalVisible] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeTotal, setRangeTotal] = useState<number | null>(null);

  // Picker Visibility
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showRangeStartDatePicker, setShowRangeStartDatePicker] = useState(false);
  const [showRangeEndDatePicker, setShowRangeEndDatePicker] = useState(false);

  // 1.03M Wall State
  const [annualTotal, setAnnualTotal] = useState(0);
  const WALL_LIMIT = 1030000;

  // Baito Zukan State
  const [zukanModalVisible, setZukanModalVisible] = useState(false);
  const [discoveredLocations, setDiscoveredLocations] = useState<LocationStats[]>([]);

  // Auto-calculate salary
  useEffect(() => {
    if (newShiftType === 'MyBasket') {
      const wage = calculateMyBasketWage(selectedDate, newShiftStart, newShiftEnd);
      setNewShiftSalary(wage.toString());
      setNewShiftTitle('まいばす');
    } else if (newShiftType === 'Other') {
      const rate = parseInt(newHourlyWage, 10);
      if (!isNaN(rate) && rate > 0) {
        const wage = calculateHourlyWage(rate, newShiftStart, newShiftEnd);
        setNewShiftSalary(wage.toString());
      }
    } else {
      setNewShiftLocation('');
    }
  }, [newShiftType, newShiftStart, newShiftEnd, newHourlyWage, selectedDate]);

  // Load Data Function
  const loadData = async () => {
    // Supabaseからデータを取得
    const supabaseShifts = await fetchShiftsFromSupabase();
    // ローカルも一応読み込むが、基本はSupabase優先（あるいはマージ）
    const localShifts = await loadManualShifts();

    // SupabaseとLocalをマージする (IDがないLocalデータも表示するため)
    if (supabaseShifts.length > 0) {
      // Supabaseにデータがある場合、ローカル（AsyncStorage）のデータは「古いキャッシュ」とみなして無視する方針に変更
      // ユーザー要望「重複する」への対策。
      // もしローカルにしかないデータ（オフライン作成など）がある場合は別途考慮が必要だが、
      // 基本的に「追加」時は即Supabaseに送るようにしたので、ここはSupabase正で良いはず。
      setManualShifts(supabaseShifts);

      // 念のためログには出す
      if (localShifts.length > 0) {
        console.log('Local shifts ignored in favor of Supabase data:', localShifts.length);
      }
    } else {
      // Supabaseが空、または取得失敗時はローカルを表示
      setManualShifts(localShifts);
    }

    const exclusions = await loadExcludedDates();
    const tutorExclusions = await loadExcludedTutorShifts();
    const locations = await loadDiscoveredLocations();
    const overrides = await loadSalaryOverrides();

    setExcludedDates(exclusions);
    setExcludedTutorShifts(tutorExclusions);
    setDiscoveredLocations(locations);
    setSalaryOverrides(overrides);
  };

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const getShiftId = (s: Shift) => `${s.date}_${s.startTime}_${s.endTime}_${s.title}`;

  // Combine shifts
  useEffect(() => {
    // 以前はローカルのJSON (tutorDataRaw) と Supabase (manualShifts) をマージしていましたが、
    // 全データSupabaseに移行済みのため、ローカルJSONは無視します。
    // ダブルカウント防止のため、manualShiftsのみ正とします。
    const combined = [...manualShifts].map(s => {
      const id = getShiftId(s);
      if (salaryOverrides[id] !== undefined) {
        return { ...s, salary: salaryOverrides[id] };
      }
      return s;
    });
    setAllShifts(combined);

    const currentYear = new Date().getFullYear();
    setAnnualTotal(calculateAnnualTotal(combined, currentYear));

    // Zukan Logic (simplified update)
    const updateLocations = async () => {
      let stats = [...discoveredLocations];
      let changed = false;
      combined.forEach(shift => {
        let locName = 'その他';
        if (shift.type === 'MyBasket') locName = 'まいばす';
        else if (shift.type === 'Tutor') locName = extractLocationName(shift.description || shift.title);
        else locName = shift.title;

        if (!locName || locName === '不明') return;
        if (!stats.find(l => l.name === locName)) {
          stats.push({ name: locName, count: 0, lastVisited: shift.date });
          changed = true;
        }
      });

      stats = stats.map(loc => {
        const count = combined.filter(s => {
          if (loc.name === 'まいばす') return s.type === 'MyBasket';
          const sName = s.type === 'Tutor' ? extractLocationName(s.description || s.title) : s.title;
          return sName === loc.name;
        }).length;
        return { ...loc, count };
      });

      if (changed || JSON.stringify(stats) !== JSON.stringify(discoveredLocations)) {
        setDiscoveredLocations(stats);
        saveDiscoveredLocations(stats);
      }
    };
    updateLocations();
  }, [currentMonth, manualShifts, excludedDates, excludedTutorShifts, salaryOverrides]);

  const monthlyTotal = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    return calculateMonthlyTotal(allShifts, y, m);
  }, [allShifts, currentMonth]);

  const markedDates = useMemo(() => {
    const marks: any = {};
    allShifts.forEach(shift => {
      let color = '#9C27B0'; // Default (Purple) for "Other" / Unknown

      const type = shift.type || '';
      const title = shift.title || '';

      // MyBasket ("まいばす") -> Blue
      if (type === 'MyBasket' || title.includes('まいばす') || title.includes('MyBasket')) {
        color = '#448AFF';
      }
      // Admin Support ("行政支援") -> Red
      else if (type === 'Tutor' || title.includes('行政支援') || title.includes('家庭教師')) {
        color = '#FF5252';
      }

      // Manual override ONLY if it's explicitly set (and not just a default string)
      if (shift.color && shift.color !== '#FF9500' && shift.color !== '#FF5252' && shift.color !== '#448AFF') {
        color = shift.color;
      }

      if (!marks[shift.date].dots.find((d: any) => d.color === color)) {
        marks[shift.date].dots.push({ color });
      }
    });
    if (marks[selectedDate]) {
      marks[selectedDate].selected = true;
      marks[selectedDate].selectedColor = PRIMARY_COLOR;
    } else {
      marks[selectedDate] = { selected: true, selectedColor: PRIMARY_COLOR, dots: [] };
    }
    return marks;
  }, [allShifts, selectedDate]);

  const selectedShifts = allShifts.filter(s => s.date === selectedDate);

  // Upcoming Shifts (Next 7 days)
  const upcomingShifts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    return allShifts
      .filter(s => {
        if (!s.date) return false;
        const d = parseISO(s.date);

        // Safety: ensure d is valid
        if (isNaN(d.getTime())) return false;

        // Future dates in range
        if (d > today && d <= nextWeek) return true;

        // Today: only if end time is in the future
        // Use string comparison for "Today" to avoid timezone headaches (YYYY-MM-DD)
        const sDateStr = format(d, 'yyyy-MM-dd');
        const todayStr = format(today, 'yyyy-MM-dd');

        if (sDateStr === todayStr) {
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();

          const endTimeStr = s.endTime || '00:00';
          if (!endTimeStr.includes(':')) return false; // Invalid format check

          const [endH, endM] = endTimeStr.split(':').map(Number);
          return endH > currentHour || (endH === currentHour && endM > currentMinute);
        }
        return false;
      })
      .sort((a, b) => {
        const dateDiff = parseISO(a.date).getTime() - parseISO(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (a.startTime || '').localeCompare(b.startTime || '');
      })
      .slice(0, 5);
  }, [allShifts]);

  // Handlers
  const handleAddShift = async () => {
    if (!newShiftTitle || !newShiftSalary) { Alert.alert('エラー', 'タイトルと金額を入力してください'); return; }
    const salaryNum = parseInt(newShiftSalary, 10);
    if (isNaN(salaryNum)) { Alert.alert('エラー', '有効な数字を入力してください'); return; }

    const newShift: Shift = {
      date: selectedDate,
      title: newShiftTitle,
      salary: salaryNum,
      type: newShiftType === 'Other' ? 'Tutor' : newShiftType,
      startTime: newShiftStart,
      endTime: newShiftEnd,
      description: '手動追加',
      hourlyRate: newShiftType === 'Other' ? parseInt(newHourlyWage) : undefined,
      location: newShiftLocation,
      color: newShiftType === 'Tutor' ? '#FF5252' : newShiftType === 'MyBasket' ? '#448AFF' : '#FF9500',
    };

    // Supabase save
    const { data: addedShift, error } = await addShiftToSupabase(newShift);
    if (addedShift) {
      setManualShifts(prev => [...prev, addedShift]); // Immediate update only
      Alert.alert('成功', 'Supabaseに保存しました');
    } else {
      Alert.alert('エラー', `保存失敗: ${error}`);
    }
    setModalVisible(false);
    setNewShiftTitle('');
    setNewShiftSalary('');
  };

  const handleRangeCalculation = () => {
    if (!rangeStart || !rangeEnd) { setRangeTotal(null); return; }
    const total = calculateRangeTotal(allShifts, rangeStart, rangeEnd);
    setRangeTotal(total);
  };

  // Delete/Edit Logic
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [shiftToEdit, setShiftToEdit] = useState<Shift | null>(null);

  // Edit Form State
  const [editTitle, setEditTitle] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editType, setEditType] = useState<'Tutor' | 'MyBasket' | 'Other'>('Tutor');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editHourlyRate, setEditHourlyRate] = useState('');

  // Edit Pickers
  const [showEditStartTimePicker, setShowEditStartTimePicker] = useState(false);
  const [showEditEndTimePicker, setShowEditEndTimePicker] = useState(false);

  const confirmDeleteShift = (shift: Shift) => { setShiftToDelete(shift); setDeleteModalVisible(true); };

  const performDelete = async () => {
    if (!shiftToDelete) return;

    // Supabase Delete
    if (shiftToDelete.id) {
      const { success, error } = await deleteShiftFromSupabase(shiftToDelete.id);
      if (success) {
        setManualShifts(prev => prev.filter(s => s.id !== shiftToDelete.id)); // Immediate update only
        Alert.alert('成功', '削除しました');
      } else {
        Alert.alert('エラー', `削除失敗: ${error}`);
        return; // Don't close modal on error
      }
    } else {
      // Legacy Local Delete (by matching fields)
      if (shiftToDelete.description === '手動追加') {
        const updated = manualShifts.filter(s => !(s.date === shiftToDelete.date && s.startTime === shiftToDelete.startTime && s.endTime === shiftToDelete.endTime && s.title === shiftToDelete.title));
        setManualShifts(updated); await saveManualShifts(updated);
      } else {
        // Scraped Data Exclusion
        const id = getShiftId(shiftToDelete);
        if (shiftToDelete.type === 'MyBasket') { setExcludedDates([...excludedDates, shiftToDelete.date]); await saveExcludedDates([...excludedDates, shiftToDelete.date]); }
        else { setExcludedTutorShifts([...excludedTutorShifts, id]); await saveExcludedTutorShifts([...excludedTutorShifts, id]); }
      }
    }
    setDeleteModalVisible(false); setShiftToDelete(null);
  };

  const openEditModal = (shift: Shift) => {
    setShiftToEdit(shift);
    setEditTitle(shift.title);
    setEditSalary(shift.salary.toString());
    setEditLocation(shift.location || '');
    setEditType(shift.type);
    setEditStart(shift.startTime || '');
    setEditEnd(shift.endTime || '');
    setEditHourlyRate(shift.hourlyRate ? shift.hourlyRate.toString() : '');
    setEditModalVisible(true);
  };

  const saveEdit = async () => {
    console.log('saveEdit called');
    if (!shiftToEdit) { Alert.alert('Error', 'No shift selected'); return; }
    if (!editTitle) { Alert.alert('Error', 'Title is missing'); return; }
    if (!editSalary) { Alert.alert('Error', 'Salary is missing'); return; }

    const newSalaryNum = parseInt(editSalary, 10);
    if (isNaN(newSalaryNum)) { Alert.alert('Error', 'Invalid salary'); return; }

    // Supabase Update
    console.log('Update shift ID:', shiftToEdit.id);

    if (shiftToEdit.id) {
      const updatedShift: Shift = {
        ...shiftToEdit,
        title: editTitle,
        salary: newSalaryNum,
        location: editLocation,
        type: editType,
        startTime: editStart,
        endTime: editEnd,
        hourlyRate: editHourlyRate ? parseInt(editHourlyRate, 10) : undefined,
        color: editType === 'Tutor' ? '#FF5252' : editType === 'MyBasket' ? '#448AFF' : '#FF9500',
      };

      const { success, error } = await updateShiftInSupabase(updatedShift);
      if (success) {
        setManualShifts(prev => prev.map(s => s.id === updatedShift.id ? updatedShift : s)); // Immediate update only
        Alert.alert('成功', '更新しました');
      } else {
        Alert.alert('エラー', `更新失敗: ${error}`);
      }
    } else {
      // Legacy Update
      console.log('Legacy update attempted (no ID). Shift:', shiftToEdit);
      Alert.alert('エラー', 'このデータは編集できません（IDがありません）。削除して作り直してください。');
    }
    setEditModalVisible(false); setShiftToEdit(null);
  };

  // Edit Date Handlers
  const onEditStartTimeChange = (event: any, date?: Date) => { setShowEditStartTimePicker(false); if (date) setEditStart(format(date, 'HH:mm')); };
  const onEditEndTimeChange = (event: any, date?: Date) => { setShowEditEndTimePicker(false); if (date) setEditEnd(format(date, 'HH:mm')); };

  const handleResetExclusions = async () => {
    Alert.alert('復元', '削除した予定を復元しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '復元する', style: 'destructive', onPress: async () => { await resetAllExclusions(); setExcludedDates([]); setExcludedTutorShifts([]); alert('復元しました'); } }
    ]);
  };

  // Settings Modal
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // Date/Time Helpers
  const onStartTimeChange = (event: any, date?: Date) => { setShowStartTimePicker(false); if (date) setNewShiftStart(format(date, 'HH:mm')); };
  const onEndTimeChange = (event: any, date?: Date) => { setShowEndTimePicker(false); if (date) setNewShiftEnd(format(date, 'HH:mm')); };
  const onRangeStartDateChange = (event: any, date?: Date) => { setShowRangeStartDatePicker(false); if (date) setRangeStart(format(date, 'yyyy-MM-dd')); };
  const onRangeEndDateChange = (event: any, date?: Date) => { setShowRangeEndDatePicker(false); if (date) setRangeEnd(format(date, 'yyyy-MM-dd')); };
  const getDateObj = (str: string) => str ? parseISO(str) : new Date();
  const getTimeDate = (timeStr: string) => { const d = new Date(); const [h, m] = timeStr.split(':').map(Number); d.setHours(h); d.setMinutes(m); return d; };

  // --- Render Components ---
  const renderRightActions = (progress: any, dragX: any, index: number, item: Shift) => (
    <TouchableOpacity onPress={() => confirmDeleteShift(item)} style={styles.deleteAction}>
      <Ionicons name="trash-outline" size={24} color="#fff" />
    </TouchableOpacity>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Salary Manager</Text>
          <TouchableOpacity onPress={() => setSettingsModalVisible(true)} style={styles.headerButton}>
            <Ionicons name="settings-outline" size={24} color={PRIMARY_COLOR} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.heroMonth}>{format(parseISO(currentMonth + '-01'), 'yyyy年M月', { locale: ja })}</Text>
            <Text style={styles.heroAmount}>¥{monthlyTotal.toLocaleString()}</Text>
          </View>

          {/* Wall Meter Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>103万の壁</Text>
              <Text style={[styles.cardTitle, { color: SUBTEXT_COLOR, fontSize: 14 }]}>
                残り ¥{(WALL_LIMIT - annualTotal).toLocaleString()}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.min((annualTotal / WALL_LIMIT) * 100, 100)}%`, backgroundColor: (annualTotal / WALL_LIMIT) > 0.9 ? DESTRUCTIVE_COLOR : SUCCESS_COLOR }]} />
            </View>
            <Text style={styles.wallStats}>{((annualTotal / WALL_LIMIT) * 100).toFixed(1)}% 消化 (¥{annualTotal.toLocaleString()})</Text>
          </View>


          {/* Calendar Card */}
          <View style={styles.card}>
            <Calendar
              current={selectedDate}
              onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
              onMonthChange={(month: DateData) => setCurrentMonth(month.dateString.substring(0, 7))}
              markedDates={markedDates}
              markingType={'multi-dot'}
              theme={{
                backgroundColor: '#ffffff',
                calendarBackground: '#ffffff',
                textSectionTitleColor: '#b6c1cd',
                selectedDayBackgroundColor: PRIMARY_COLOR,
                selectedDayTextColor: '#ffffff',
                todayTextColor: PRIMARY_COLOR,
                dayTextColor: '#2d4150',
                textDisabledColor: '#d9e1e8',
                dotColor: PRIMARY_COLOR,
                selectedDotColor: '#ffffff',
                arrowColor: PRIMARY_COLOR,
                monthTextColor: TEXT_COLOR,
                textDayFontWeight: '300',
                textMonthFontWeight: 'bold',
                textDayHeaderFontWeight: '300',
                textDayFontSize: 16,
                textMonthFontSize: 16,
                textDayHeaderFontSize: 14
              }}
            />
          </View>

          {/* Schedule List */}
          <Text style={styles.sectionHeader}>{format(parseISO(selectedDate), 'M月d日 (E)', { locale: ja })} の予定</Text>
          <View style={[styles.card, { padding: 0 }]}>
            {selectedShifts.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: SUBTEXT_COLOR }}>予定はありません</Text>
              </View>
            ) : (
              selectedShifts.map((item, index) => (
                <Swipeable key={index} renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, index, item)}>
                  <View style={[styles.listItem, index !== selectedShifts.length - 1 && styles.listItemSeparator]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.itemTime}>{item.startTime} - {item.endTime} {item.location ? `• ${item.location}` : ''}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openEditModal(item)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.itemPrice}>¥{item.salary.toLocaleString()}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#C7C7CC" style={{ marginLeft: 5 }} />
                    </TouchableOpacity>
                  </View>
                </Swipeable>
              ))
            )}
          </View>

          <View style={{ height: 20 }} />

          {/* Upcoming Shifts (Moved here) */}
          <Text style={styles.sectionHeader}>直近の予定</Text>
          <View style={[styles.card, { padding: 0 }]}>
            {upcomingShifts.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: SUBTEXT_COLOR }}>直近の予定はありません</Text>
              </View>
            ) : (
              upcomingShifts.map((item, index) => (
                <View key={index} style={[styles.listItem, index !== upcomingShifts.length - 1 && styles.listItemSeparator]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', width: 50 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#FF3B30', fontWeight: '600' }}>{format(parseISO(item.date), 'MMM', { locale: ja })}</Text>
                      <Text style={{ fontSize: 18, color: TEXT_COLOR, fontWeight: '500' }}>{format(parseISO(item.date), 'd')}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.itemTime}>{item.startTime} - {item.endTime} <Text style={{ color: SUBTEXT_COLOR }}>{item.location ? `• ${item.location}` : ''}</Text></Text>
                  </View>
                  <Text style={styles.itemPrice}>¥{item.salary.toLocaleString()}</Text>
                </View>
              ))
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* --- Modals (Simplified for Clean UI) --- */}

        {/* Settings Modal */}
        <Modal animationType="slide" visible={settingsModalVisible} onRequestClose={() => setSettingsModalVisible(false)} presentationStyle="pageSheet">
          <SafeAreaView style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
            <View style={styles.modalHeaderPage}>
              <Text style={styles.modalHeader}>メニュー</Text>
              <TouchableOpacity onPress={() => setSettingsModalVisible(false)} style={{ padding: 8 }}>
                <Text style={{ color: PRIMARY_COLOR, fontSize: 17, fontWeight: '600' }}>閉じる</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <View style={styles.card}>
                <TouchableOpacity onPress={() => { setSettingsModalVisible(false); setTimeout(() => setModalVisible(true), 500); }} style={styles.listItem}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.menuIconContainerList, { backgroundColor: PRIMARY_COLOR }]}>
                      <Ionicons name="add" size={20} color="#fff" />
                    </View>
                    <Text style={[styles.itemTitle, { marginLeft: 12 }]}>シフト追加</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </TouchableOpacity>
                <View style={styles.listItemSeparator} />
                <TouchableOpacity onPress={() => { setSettingsModalVisible(false); setTimeout(() => setRangeModalVisible(true), 500); }} style={styles.listItem}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.menuIconContainerList, { backgroundColor: '#34C759' }]}>
                      <Ionicons name="calculator-outline" size={20} color="#fff" />
                    </View>
                    <Text style={[styles.itemTitle, { marginLeft: 12 }]}>期間集計</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </TouchableOpacity>
                <View style={styles.listItemSeparator} />
                <TouchableOpacity onPress={() => { setSettingsModalVisible(false); setTimeout(() => setZukanModalVisible(true), 500); }} style={styles.listItem}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.menuIconContainerList, { backgroundColor: '#FF9500' }]}>
                      <Ionicons name="book-outline" size={20} color="#fff" />
                    </View>
                    <Text style={[styles.itemTitle, { marginLeft: 12 }]}>バイト図鑑</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </TouchableOpacity>
                <View style={styles.listItemSeparator} />
                <TouchableOpacity onPress={() => {
                  setSettingsModalVisible(false);
                  loadData().then(() => Alert.alert('完了', 'データを最新の状態に更新しました'));
                }} style={styles.listItem}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.menuIconContainerList, { backgroundColor: '#8E8E93' }]}>
                      <Ionicons name="refresh-outline" size={20} color="#fff" />
                    </View>
                    <Text style={[styles.itemTitle, { marginLeft: 12 }]}>データ再読み込み</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </Modal>

        {/* Add Modal */}
        <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalHeader}>予定を追加</Text>
              <View style={styles.segmentedControl}>
                {(['Tutor', 'MyBasket', 'Other'] as const).map(type => (
                  <TouchableOpacity key={type} style={[styles.segment, newShiftType === type && styles.segmentActive]} onPress={() => setNewShiftType(type)}>
                    <Text style={[styles.segmentText, newShiftType === type && styles.segmentTextActive]}>
                      {type === 'Tutor' ? '入力' : type === 'MyBasket' ? 'まいばす' : '時給'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {newShiftType !== 'MyBasket' && (
                <TextInput style={styles.input} placeholder="タイトル" value={newShiftTitle} onChangeText={setNewShiftTitle} placeholderTextColor={SUBTEXT_COLOR} />
              )}
              <TextInput style={styles.input} placeholder="場所 (任意)" value={newShiftLocation} onChangeText={setNewShiftLocation} placeholderTextColor={SUBTEXT_COLOR} />
              {newShiftType === 'Other' && (
                <TextInput style={styles.input} placeholder="時給" value={newHourlyWage} onChangeText={setNewHourlyWage} keyboardType="numeric" placeholderTextColor={SUBTEXT_COLOR} />
              )}
              {newShiftType !== 'Other' && (
                <TextInput style={styles.input} placeholder="金額" value={newShiftSalary} onChangeText={setNewShiftSalary} keyboardType="numeric" editable={newShiftType === 'Tutor'} placeholderTextColor={SUBTEXT_COLOR} />
              )}

              <View style={styles.row}>
                {Platform.OS === 'web' ? (
                  <input type="time" value={newShiftStart} onChange={(e) => setNewShiftStart(e.target.value)} style={styles.webInput} />
                ) : (
                  <TouchableOpacity onPress={() => setShowStartTimePicker(true)} style={styles.dateButton}><Text>{newShiftStart}</Text></TouchableOpacity>
                )}
                <Text style={{ marginHorizontal: 10 }}>→</Text>
                {Platform.OS === 'web' ? (
                  <input type="time" value={newShiftEnd} onChange={(e) => setNewShiftEnd(e.target.value)} style={styles.webInput} />
                ) : (
                  <TouchableOpacity onPress={() => setShowEndTimePicker(true)} style={styles.dateButton}><Text>{newShiftEnd}</Text></TouchableOpacity>
                )}
              </View>

              <View style={styles.modalButtonRow}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.modalBtnTextSecondary}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleAddShift}>
                  <Text style={styles.modalBtnText}>追加</Text>
                </TouchableOpacity>
              </View>

              {/* Datetime pickers logic... reused */}
              {showStartTimePicker && <DateTimePicker value={getTimeDate(newShiftStart)} mode="time" onChange={onStartTimeChange} />}
              {showEndTimePicker && <DateTimePicker value={getTimeDate(newShiftEnd)} mode="time" onChange={onEndTimeChange} />}
            </View>
          </View>
        </Modal>

        {/* Range Modal */}
        <Modal animationType="slide" transparent={true} visible={rangeModalVisible} onRequestClose={() => setRangeModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalHeader}>期間集計</Text>
              <View style={styles.row}>
                {Platform.OS === 'web' ? (<input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} style={styles.webInput} />) :
                  <TouchableOpacity onPress={() => setShowRangeStartDatePicker(true)} style={styles.dateButton}><Text>{rangeStart || "開始"}</Text></TouchableOpacity>}
                <Text> ~ </Text>
                {Platform.OS === 'web' ? (<input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} style={styles.webInput} />) :
                  <TouchableOpacity onPress={() => setShowRangeEndDatePicker(true)} style={styles.dateButton}><Text>{rangeEnd || "終了"}</Text></TouchableOpacity>}
              </View>
              {rangeTotal !== null && <Text style={[styles.heroAmount, { fontSize: 32, marginBottom: 20 }]}>¥{rangeTotal.toLocaleString()}</Text>}
              <View style={styles.modalButtonRow}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setRangeModalVisible(false)}>
                  <Text style={styles.modalBtnTextSecondary}>閉じる</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleRangeCalculation}>
                  <Text style={styles.modalBtnText}>計算</Text>
                </TouchableOpacity>
              </View>
              {showRangeStartDatePicker && <DateTimePicker value={getDateObj(rangeStart)} mode="date" onChange={onRangeStartDateChange} />}
              {showRangeEndDatePicker && <DateTimePicker value={getDateObj(rangeEnd)} mode="date" onChange={onRangeEndDateChange} />}
            </View>
          </View>
        </Modal>

        {/* Zukan Modal */}
        <Modal animationType="slide" visible={zukanModalVisible} onRequestClose={() => setZukanModalVisible(false)}>
          <SafeAreaView style={styles.container}>
            <View style={styles.modalHeaderPage}>
              <Text style={styles.modalHeader}>バイト図鑑</Text>
              <TouchableOpacity onPress={() => setZukanModalVisible(false)} style={{ padding: 8 }}>
                <Text style={{ color: PRIMARY_COLOR, fontSize: 17, fontWeight: '600' }}>閉じる</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={discoveredLocations}
              keyExtractor={item => item.name}
              numColumns={2}
              contentContainerStyle={{ padding: 15 }}
              renderItem={({ item }) => (
                <View style={styles.zukanItem}>
                  <View style={styles.zukanIcon}>
                    <Text style={{ fontSize: 24, color: '#fff' }}>{item.name[0]}</Text>
                  </View>
                  <Text style={styles.zukanText}>{item.name}</Text>
                  <Text style={styles.zukanLevel}>Lv.{item.count}</Text>
                </View>
              )}
            />
            <View style={{ padding: 16 }}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnDestructive, { height: 44 }]} onPress={handleResetExclusions}>
                <Text style={styles.modalBtnText}>データ復元（除外解除）</Text>
              </TouchableOpacity>
            </View>
            <View style={{ alignItems: 'center', paddingBottom: 20 }}>
              <Text style={{ color: SUBTEXT_COLOR, fontSize: 12, marginTop: 10 }}>v1.0.6</Text>
            </View>
          </SafeAreaView>
        </Modal>

        {/* Delete Modal */}
        <Modal animationType="fade" transparent={true} visible={deleteModalVisible} onRequestClose={() => setDeleteModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalHeader}>削除しますか？</Text>
              <Text style={{ marginBottom: 20, color: SUBTEXT_COLOR }}>この操作は取り消せません。</Text>
              <View style={styles.modalButtonRow}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setDeleteModalVisible(false)}>
                  <Text style={styles.modalBtnTextSecondary}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnDestructive]} onPress={performDelete}>
                  <Text style={styles.modalBtnText}>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Edit Modal */}
        {/* Edit Modal (Redesigned) */}
        <Modal animationType="slide" transparent={true} visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalHeader}>予定を編集</Text>

              <View style={styles.segmentedControl}>
                {(['Tutor', 'MyBasket', 'Other'] as const).map(type => (
                  <TouchableOpacity key={type} style={[styles.segment, editType === type && styles.segmentActive]} onPress={() => setEditType(type)}>
                    <Text style={[styles.segmentText, editType === type && styles.segmentTextActive]}>
                      {type === 'Tutor' ? '入力' : type === 'MyBasket' ? 'まいばす' : '時給'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput style={styles.input} placeholder="タイトル" value={editTitle} onChangeText={setEditTitle} placeholderTextColor={SUBTEXT_COLOR} />
              <TextInput style={styles.input} placeholder="場所 (任意)" value={editLocation} onChangeText={setEditLocation} placeholderTextColor={SUBTEXT_COLOR} />

              {editType === 'Other' && (
                <TextInput style={styles.input} placeholder="時給" value={editHourlyRate} onChangeText={setEditHourlyRate} keyboardType="numeric" placeholderTextColor={SUBTEXT_COLOR} />
              )}

              <TextInput style={styles.input} placeholder="金額" value={editSalary} onChangeText={setEditSalary} keyboardType="numeric" placeholderTextColor={SUBTEXT_COLOR} />

              <View style={styles.row}>
                {Platform.OS === 'web' ? (
                  <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} style={styles.webInput} />
                ) : (
                  <TouchableOpacity onPress={() => setShowEditStartTimePicker(true)} style={styles.dateButton}><Text>{editStart}</Text></TouchableOpacity>
                )}
                <Text style={{ marginHorizontal: 10 }}>→</Text>
                {Platform.OS === 'web' ? (
                  <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} style={styles.webInput} />
                ) : (
                  <TouchableOpacity onPress={() => setShowEditEndTimePicker(true)} style={styles.dateButton}><Text>{editEnd}</Text></TouchableOpacity>
                )}
              </View>

              <View style={styles.modalButtonRow}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.modalBtnTextSecondary}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={saveEdit}>
                  <Text style={styles.modalBtnText}>更新</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnDestructive]} onPress={() => { setEditModalVisible(false); setTimeout(() => confirmDeleteShift(shiftToEdit!), 300); }}>
                  <Text style={styles.modalBtnText}>削除</Text>
                </TouchableOpacity>
              </View>

              {showEditStartTimePicker && <DateTimePicker value={getTimeDate(editStart)} mode="time" onChange={onEditStartTimeChange} />}
              {showEditEndTimePicker && <DateTimePicker value={getTimeDate(editEnd)} mode="time" onChange={onEditEndTimeChange} />}
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </GestureHandlerRootView >
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(242,242,247,0.9)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: TEXT_COLOR },
  headerButton: { padding: 8 },
  scrollContent: { padding: 16 },

  heroSection: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  heroMonth: { fontSize: 14, color: SUBTEXT_COLOR, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmount: { fontSize: 44, fontWeight: '700', color: TEXT_COLOR, letterSpacing: -1.5 },

  card: { backgroundColor: CARD_BG, borderRadius: 16, padding: 16, marginBottom: 16, ...SHADOW_STYLE },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: TEXT_COLOR },

  progressBarBg: { height: 6, backgroundColor: '#E5E5EA', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  wallStats: { fontSize: 13, color: SUBTEXT_COLOR, marginTop: 8, textAlign: 'right', fontVariant: ['tabular-nums'] },

  menuIconContainerList: { width: 30, height: 30, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },

  sectionHeader: { fontSize: 13, color: SUBTEXT_COLOR, fontWeight: '600', marginBottom: 8, marginLeft: 16, textTransform: 'uppercase' },

  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  listItemSeparator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8' },
  itemTitle: { fontSize: 17, fontWeight: '400', color: TEXT_COLOR, marginBottom: 4 },
  itemTime: { fontSize: 14, color: SUBTEXT_COLOR },
  itemPrice: { fontSize: 17, fontWeight: '400', color: TEXT_COLOR, fontVariant: ['tabular-nums'] },

  deleteAction: { backgroundColor: DESTRUCTIVE_COLOR, justifyContent: 'center', alignItems: 'center', width: 80, height: '100%' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#F2F2F2', borderRadius: 14, padding: 20, width: '100%', maxWidth: 400, alignItems: 'center', ...SHADOW_STYLE },
  modalHeader: { fontSize: 18, fontWeight: '600', marginBottom: 20 },
  modalHeaderPage: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' },

  input: { width: '100%', height: 44, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, marginBottom: 16, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#C6C6C8' },
  // @ts-ignore
  webInput: { width: '100%', height: 40, border: '1px solid #C6C6C8', borderRadius: 8, padding: 8, marginBottom: 16, fontSize: 16 },

  dateButton: { backgroundColor: '#fff', padding: 10, borderRadius: 8, width: 100, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },

  segmentedControl: { flexDirection: 'row', backgroundColor: '#E5E5EA', borderRadius: 8, padding: 2, marginBottom: 20, width: '100%' },
  segment: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  segmentActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: '500' },
  segmentTextActive: { fontWeight: '600' },

  // Zukan
  zukanItem: { flex: 1, backgroundColor: '#fff', margin: 8, borderRadius: 12, padding: 16, alignItems: 'center', ...SHADOW_STYLE },
  zukanIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: PRIMARY_COLOR, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  zukanText: { fontWeight: '600', fontSize: 14, marginBottom: 4 },
  zukanLevel: { fontSize: 12, color: SUBTEXT_COLOR },

  // New Modal Styles
  modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 20, gap: 10 },
  modalBtn: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: PRIMARY_COLOR },
  modalBtnDestructive: { backgroundColor: DESTRUCTIVE_COLOR },
  modalBtnSecondary: { backgroundColor: '#E5E5EA' },
  modalBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  modalBtnTextSecondary: { fontSize: 16, fontWeight: '600', color: TEXT_COLOR },
});
