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

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      const shifts = await loadManualShifts();
      const exclusions = await loadExcludedDates();
      const tutorExclusions = await loadExcludedTutorShifts();
      const locations = await loadDiscoveredLocations();
      const overrides = await loadSalaryOverrides();
      setManualShifts(shifts);
      setExcludedDates(exclusions);
      setExcludedTutorShifts(tutorExclusions);
      setDiscoveredLocations(locations);
      setSalaryOverrides(overrides);
    };
    loadData();
  }, []);

  const getShiftId = (s: Shift) => `${s.date}_${s.startTime}_${s.endTime}_${s.title}`;

  // Combine shifts
  useEffect(() => {
    const scraperShifts = parseTutorShifts(tutorDataRaw as ScraperData[])
      .filter(s => !excludedTutorShifts.includes(getShiftId(s)))
      .filter(s => !(s.type === 'MyBasket' && excludedDates.includes(s.date)));

    const combined = [...scraperShifts, ...manualShifts].map(s => {
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
        if (shift.type === 'MyBasket') locName = 'まいばすけっと';
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
          if (loc.name === 'まいばすけっと') return s.type === 'MyBasket';
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
      if (!marks[shift.date]) marks[shift.date] = { dots: [] };
      const color = shift.type === 'Tutor' ? '#FF5252' : '#448AFF';
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
    };

    const updated = [...manualShifts, newShift];
    setManualShifts(updated);
    await saveManualShifts(updated);
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
  const [editAmount, setEditAmount] = useState('');
  const [shiftToEdit, setShiftToEdit] = useState<Shift | null>(null);

  const confirmDeleteShift = (shift: Shift) => { setShiftToDelete(shift); setDeleteModalVisible(true); };
  const performDelete = async () => {
    if (!shiftToDelete) return;
    if (shiftToDelete.description === '手動追加') {
      const updated = manualShifts.filter(s => !(s.date === shiftToDelete.date && s.startTime === shiftToDelete.startTime && s.endTime === shiftToDelete.endTime && s.title === shiftToDelete.title));
      setManualShifts(updated); await saveManualShifts(updated);
    } else {
      const id = getShiftId(shiftToDelete);
      if (shiftToDelete.type === 'MyBasket') { setExcludedDates([...excludedDates, shiftToDelete.date]); await saveExcludedDates([...excludedDates, shiftToDelete.date]); }
      else { setExcludedTutorShifts([...excludedTutorShifts, id]); await saveExcludedTutorShifts([...excludedTutorShifts, id]); }
    }
    setDeleteModalVisible(false); setShiftToDelete(null);
  };

  const openEditModal = (shift: Shift) => { setShiftToEdit(shift); setEditAmount(shift.salary.toString()); setEditModalVisible(true); };
  const saveEdit = async () => {
    if (!shiftToEdit || !editAmount) return;
    const newSalary = parseInt(editAmount, 10);
    if (shiftToEdit.description === '手動追加') {
      const updated = manualShifts.map(s => getShiftId(s) === getShiftId(shiftToEdit) ? { ...s, salary: newSalary } : s);
      setManualShifts(updated); await saveManualShifts(updated);
    } else {
      const updatedOverrides = { ...salaryOverrides, [getShiftId(shiftToEdit)]: newSalary };
      setSalaryOverrides(updatedOverrides); await saveSalaryOverrides(updatedOverrides);
    }
    setEditModalVisible(false); setShiftToEdit(null);
  };

  const handleResetExclusions = async () => {
    Alert.alert('復元', '削除した予定を復元しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '復元する', style: 'destructive', onPress: async () => { await resetAllExclusions(); setExcludedDates([]); setExcludedTutorShifts([]); alert('復元しました'); } }
    ]);
  };

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

          {/* Menu Grid */}
          <View style={styles.menuGrid}>
            <TouchableOpacity style={styles.menuButton} onPress={() => setModalVisible(true)}>
              <View style={[styles.menuIconContainer, { backgroundColor: '#E1F5FE' }]}>
                <Ionicons name="add" size={24} color={PRIMARY_COLOR} />
              </View>
              <Text style={styles.menuText}>追加</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={() => { setRangeStart(format(new Date(), 'yyyy-MM-01')); setRangeEnd(format(new Date(), 'yyyy-MM-dd')); setRangeTotal(null); setRangeModalVisible(true); }}>
              <View style={[styles.menuIconContainer, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="calculator-outline" size={24} color={SUCCESS_COLOR} />
              </View>
              <Text style={styles.menuText}>期間集計</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={() => setZukanModalVisible(true)}>
              <View style={[styles.menuIconContainer, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="book-outline" size={24} color="#FF9800" />
              </View>
              <Text style={styles.menuText}>図鑑</Text>
            </TouchableOpacity>
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

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* --- Modals (Simplified for Clean UI) --- */}

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

              <Button title="追加" onPress={handleAddShift} />
              <Button title="キャンセル" color={DESTRUCTIVE_COLOR} onPress={() => setModalVisible(false)} />

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
              <Button title="計算" onPress={handleRangeCalculation} />
              {rangeTotal !== null && <Text style={styles.heroAmount}>¥{rangeTotal.toLocaleString()}</Text>}
              <Button title="閉じる" color={SUBTEXT_COLOR} onPress={() => setRangeModalVisible(false)} />
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
              <Button title="閉じる" onPress={() => setZukanModalVisible(false)} />
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
            <Button title="データ復元" color={DESTRUCTIVE_COLOR} onPress={handleResetExclusions} />
          </SafeAreaView>
        </Modal>

        {/* Delete Modal */}
        <Modal animationType="fade" transparent={true} visible={deleteModalVisible} onRequestClose={() => setDeleteModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalHeader}>削除しますか？</Text>
              <Button title="削除" color={DESTRUCTIVE_COLOR} onPress={performDelete} />
              <Button title="キャンセル" onPress={() => setDeleteModalVisible(false)} />
            </View>
          </View>
        </Modal>

        {/* Edit Modal */}
        <Modal animationType="fade" transparent={true} visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalHeader}>金額修正</Text>
              <TextInput style={styles.input} value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" />
              <Button title="保存" onPress={saveEdit} />
              <Button title="キャンセル" onPress={() => setEditModalVisible(false)} />
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  scrollContent: { padding: 16 },

  heroSection: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  heroMonth: { fontSize: 16, color: SUBTEXT_COLOR, fontWeight: '600', marginBottom: 4 },
  heroAmount: { fontSize: 40, fontWeight: '700', color: TEXT_COLOR, letterSpacing: -1 },

  card: { backgroundColor: CARD_BG, borderRadius: 16, padding: 16, marginBottom: 16, ...SHADOW_STYLE },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: TEXT_COLOR },

  progressBarBg: { height: 8, backgroundColor: '#E5E5EA', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  wallStats: { fontSize: 12, color: SUBTEXT_COLOR, marginTop: 8, textAlign: 'right' },

  menuGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  menuButton: { width: '31%', backgroundColor: CARD_BG, borderRadius: 16, padding: 12, alignItems: 'center', ...SHADOW_STYLE },
  menuIconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  menuText: { fontSize: 12, fontWeight: '500', color: TEXT_COLOR },

  sectionHeader: { fontSize: 13, color: SUBTEXT_COLOR, fontWeight: '600', marginBottom: 8, marginLeft: 16, textTransform: 'uppercase' },

  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  listItemSeparator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8', marginLeft: 16 },
  itemTitle: { fontSize: 16, fontWeight: '500', color: TEXT_COLOR, marginBottom: 4 },
  itemTime: { fontSize: 13, color: SUBTEXT_COLOR },
  itemPrice: { fontSize: 16, fontWeight: '600', color: TEXT_COLOR },

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
  zukanLevel: { fontSize: 12, color: SUBTEXT_COLOR }
});
