import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, SafeAreaView, FlatList, TouchableOpacity, Modal, TextInput, Alert, Button, Animated, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Calendar, DateData } from 'react-native-calendars';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

import { Shift, ScraperData, parseTutorShifts, generateMyBasketShifts, calculateMonthlyTotal, calculateMyBasketWage, calculateHourlyWage, calculateRangeTotal, calculateAnnualTotal, extractLocationName, LocationStats } from './utils/shiftCalculator';
import { loadManualShifts, saveManualShifts, loadExcludedDates, saveExcludedDates, loadExcludedTutorShifts, saveExcludedTutorShifts, loadDiscoveredLocations, saveDiscoveredLocations } from './utils/storage';
// @ts-ignore
import tutorDataRaw from './assets/shifts.json';

export default function App() {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [currentMonth, setCurrentMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  const [manualShifts, setManualShifts] = useState<Shift[]>([]);
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [excludedTutorShifts, setExcludedTutorShifts] = useState<string[]>([]); // New state for Tutor exclusions
  const [allShifts, setAllShifts] = useState<Shift[]>([]);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newShiftTitle, setNewShiftTitle] = useState('');
  const [newShiftSalary, setNewShiftSalary] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('09:00');
  const [newShiftEnd, setNewShiftEnd] = useState('12:00');
  const [newShiftType, setNewShiftType] = useState<'Tutor' | 'MyBasket' | 'Other'>('Tutor');
  const [newHourlyWage, setNewHourlyWage] = useState('');
  const [selectedColor, setSelectedColor] = useState('#ff0000');
  // Range Calculation State
  const [rangeModalVisible, setRangeModalVisible] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeTotal, setRangeTotal] = useState<number | null>(null);

  // Picker Visibility State
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

  const COLORS = ['#ff0000', '#0000ff', '#008000', '#ffa500', '#800080'];

  // Auto-calculate salary when inputs change
  useEffect(() => {
    if (newShiftType === 'MyBasket') {
      const wage = calculateMyBasketWage(selectedDate, newShiftStart, newShiftEnd);
      setNewShiftSalary(wage.toString());
      setNewShiftTitle('まいばす');
      setSelectedColor('#0000ff');
    } else if (newShiftType === 'Other') {
      const rate = parseInt(newHourlyWage, 10);
      if (!isNaN(rate) && rate > 0) {
        const wage = calculateHourlyWage(rate, newShiftStart, newShiftEnd);
        setNewShiftSalary(wage.toString());
      }
      setSelectedColor('#008000'); // Default green for hourly
    } else {
      setSelectedColor('#ff0000'); // Default red for manual
    }
  }, [newShiftType, newShiftStart, newShiftEnd, newHourlyWage, selectedDate]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      const shifts = await loadManualShifts();
      const exclusions = await loadExcludedDates();
      const tutorExclusions = await loadExcludedTutorShifts();
      const locations = await loadDiscoveredLocations();
      setManualShifts(shifts);
      setExcludedDates(exclusions);
      setExcludedTutorShifts(tutorExclusions);
      setDiscoveredLocations(locations);
    };
    loadData();
  }, []);

  // Helper to generate unique ID for exclusion
  const getShiftId = (s: Shift) => `${s.date}_${s.startTime}_${s.endTime}_${s.title}`;

  // Combine shifts
  useEffect(() => {
    // 1. Scraper Shifts (Always fresh from JSON)
    const scraperShifts = parseTutorShifts(tutorDataRaw as ScraperData[])
      .filter(s => !excludedTutorShifts.includes(getShiftId(s)));

    // Combine all
    const combined = [...scraperShifts, ...manualShifts];
    setAllShifts(combined);


    // Calculate Annual Total
    const currentYear = new Date().getFullYear();
    setAnnualTotal(calculateAnnualTotal(combined, currentYear));

    // Update Baito Zukan Logic
    const updateLocations = async () => {
      let stats = [...discoveredLocations];
      let changed = false;

      combined.forEach(shift => {
        // Determine location name
        let locName = 'その他';
        if (shift.type === 'MyBasket') {
          locName = 'まいばすけっと';
        } else if (shift.type === 'Tutor') {
          locName = extractLocationName(shift.description || shift.title);
        } else {
          locName = shift.title; // For 'Other' types
        }

        if (!locName || locName === '不明') return;

        const existingIndex = stats.findIndex(l => l.name === locName);
        if (existingIndex >= 0) {
          // Already discovered, maybe update count logic could go here if we want to track *all* history from scratch every time
          // For now, we just ensure it exists. 
          // Simple Count Logic: Recalculate counts from *current* allShifts to be accurate?
          // Or just add new ones? 
          // Let's recalculate all counts based on current loaded shifts to be safe and simple.
        } else {
          stats.push({ name: locName, count: 0, lastVisited: shift.date });
          changed = true;
        }
      });

      // Recalculate counts
      stats = stats.map(loc => {
        const count = combined.filter(s => {
          if (loc.name === 'まいばすけっと') return s.type === 'MyBasket';
          const sName = s.type === 'Tutor' ? extractLocationName(s.description || s.title) : s.title;
          return sName === loc.name;
        }).length;
        return { ...loc, count, lastVisited: loc.lastVisited }; // Update count
      });

      // Save if meaningful change or if we just want to keep sync
      // To avoid infinite loops or heavy path, maybe only save if deep diff?
      // For this size, saving is fine.
      if (JSON.stringify(stats) !== JSON.stringify(discoveredLocations)) {
        setDiscoveredLocations(stats);
        saveDiscoveredLocations(stats);
      }
    };
    updateLocations();

  }, [currentMonth, manualShifts, excludedDates, excludedTutorShifts]); // Only re-run when source data changes

  // Calculate Monthly Total
  const monthlyTotal = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    return calculateMonthlyTotal(allShifts, y, m);
  }, [allShifts, currentMonth]);

  // Calendar Marked Dates
  const markedDates = useMemo(() => {
    const marks: any = {};
    allShifts.forEach(shift => {
      if (!marks[shift.date]) marks[shift.date] = { dots: [] };
      const color = shift.color || (shift.type === 'Tutor' ? 'red' : 'blue');
      if (!marks[shift.date].dots.find((d: any) => d.color === color)) {
        marks[shift.date].dots.push({ color });
      }
    });
    if (marks[selectedDate]) {
      marks[selectedDate].selected = true;
      marks[selectedDate].selectedColor = '#00adf5';
    } else {
      marks[selectedDate] = { selected: true, selectedColor: '#00adf5', dots: [] };
    }
    return marks;
  }, [allShifts, selectedDate]);

  const selectedShifts = allShifts.filter(s => s.date === selectedDate);

  // Handlers
  const handleAddShift = async () => {
    if (!newShiftTitle || !newShiftSalary) {
      Alert.alert('エラー', 'タイトルと金額を入力してください');
      return;
    }
    const salaryNum = parseInt(newShiftSalary, 10);
    if (isNaN(salaryNum)) {
      Alert.alert('エラー', '金額は半角数字で入力してください');
      return;
    }

    const newShift: Shift = {
      date: selectedDate,
      title: newShiftTitle,
      salary: salaryNum,
      type: newShiftType === 'Other' ? 'Tutor' : newShiftType, // "Other" treated as Tutor type for color/editing in this simple version, or map correctly if we update types
      startTime: newShiftStart,
      endTime: newShiftEnd,
      description: '手動追加',
      hourlyRate: newShiftType === 'Other' ? parseInt(newHourlyWage) : undefined,
      color: selectedColor
    };

    const updated = [...manualShifts, newShift];
    setManualShifts(updated);
    await saveManualShifts(updated);

    setModalVisible(false);
    setNewShiftTitle('');
    setNewShiftSalary('');
  };

  const handleRangeCalculation = () => {
    if (!rangeStart || !rangeEnd) {
      setRangeTotal(null);
      return;
    }
    const total = calculateRangeTotal(allShifts, rangeStart, rangeEnd);
    setRangeTotal(total);
  };

  // Helper: Get color based on level
  const getLevelColor = (count: number) => {
    if (count >= 50) return '#FFD700'; // Gold
    if (count >= 20) return '#C0C0C0'; // Silver
    if (count >= 10) return '#cd7f32'; // Bronze
    if (count >= 5) return '#00adf5'; // Blue
    return '#888'; // Gray
  };

  // Helper: Get unique color for location name
  const getStringColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  };

  const getRankTitle = (count: number) => {
    if (count >= 50) return '達人';
    if (count >= 20) return '熟練';
    if (count >= 10) return '常連';
    if (count >= 5) return '見習い';
    return '新人';
  };

  // Date/Time Picker Handlers
  const onStartTimeChange = (event: any, selectedDate?: Date) => {
    setShowStartTimePicker(false);
    if (selectedDate) {
      setNewShiftStart(format(selectedDate, 'HH:mm'));
    }
  };

  const onEndTimeChange = (event: any, selectedDate?: Date) => {
    setShowEndTimePicker(false);
    if (selectedDate) {
      setNewShiftEnd(format(selectedDate, 'HH:mm'));
    }
  };

  const onRangeStartDateChange = (event: any, selectedDate?: Date) => {
    setShowRangeStartDatePicker(false);
    if (selectedDate) {
      setRangeStart(format(selectedDate, 'yyyy-MM-dd'));
    }
  };

  const onRangeEndDateChange = (event: any, selectedDate?: Date) => {
    setShowRangeEndDatePicker(false);
    if (selectedDate) {
      setRangeEnd(format(selectedDate, 'yyyy-MM-dd'));
    }
  };

  // Helper to create Date object from time string (HH:mm)
  const getTimeDate = (timeStr: string) => {
    const d = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    d.setHours(h || 0);
    d.setMinutes(m || 0);
    return d;
  };

  // Helper to create Date object from date string (YYYY-MM-DD)
  const getDateObj = (dateStr: string) => {
    return dateStr ? parseISO(dateStr) : new Date();
  };


  // Delete Modal State
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);

  const confirmDeleteShift = (shift: Shift) => {
    setShiftToDelete(shift);
    setDeleteModalVisible(true);
  };

  const performDelete = async () => {
    if (!shiftToDelete) return;

    if (shiftToDelete.type === 'MyBasket') {
      // MyBasket: Exclude by Date
      const updatedExclusions = [...excludedDates, shiftToDelete.date];
      setExcludedDates(updatedExclusions);
      await saveExcludedDates(updatedExclusions);
    } else if (shiftToDelete.description === '手動追加') {
      // Manual: Remove from manualShifts
      const updated = manualShifts.filter(s => s !== shiftToDelete);
      setManualShifts(updated);
      await saveManualShifts(updated);
    } else {
      // Scraper: Exclude by ID
      const id = getShiftId(shiftToDelete);
      const updated = [...excludedTutorShifts, id];
      setExcludedTutorShifts(updated);
      await saveExcludedTutorShifts(updated);
    }
    setDeleteModalVisible(false);
    setShiftToDelete(null);
  };

  const renderRightActions = (progress: any, dragX: any, index: number, item: Shift) => {
    return (
      <TouchableOpacity onPress={() => confirmDeleteShift(item)} style={styles.deleteAction}>
        <Text style={styles.deleteActionText}>削除</Text>
      </TouchableOpacity>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <Text style={styles.monthText}>
              {format(parseISO(currentMonth + '-01'), 'yyyy年M月', { locale: ja })} の給与予測
            </Text>
            <TouchableOpacity onPress={() => {
              setRangeStart(format(new Date(), 'yyyy-MM-01'));
              setRangeEnd(format(new Date(), 'yyyy-MM-dd'));
              setRangeTotal(null);
              setRangeModalVisible(true);
            }} style={styles.rangeButton}>
              <Text style={styles.rangeButtonText}>期間集計</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setZukanModalVisible(true)} style={styles.zukanButton}>
              <Text style={styles.zukanButtonText}>図鑑</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.totalAmount}>¥{monthlyTotal.toLocaleString()}</Text>

          {/* Wall Meter */}
          <View style={styles.wallContainer}>
            <View style={styles.wallHeader}>
              <Text style={styles.wallTitle}>103万の壁</Text>
              <Text style={styles.wallRemaining}>あと ¥{(WALL_LIMIT - annualTotal).toLocaleString()}</Text>
            </View>
            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, {
                width: `${Math.min((annualTotal / WALL_LIMIT) * 100, 100)}%`,
                backgroundColor: (annualTotal / WALL_LIMIT) > 0.95 ? '#ff4444' : (annualTotal / WALL_LIMIT) > 0.8 ? '#ffbb33' : '#00C851'
              }]} />
            </View>
            <Text style={styles.wallPercent}>{((annualTotal / WALL_LIMIT) * 100).toFixed(1)}% 消化 (¥{annualTotal.toLocaleString()})</Text>
          </View>
        </View>

        <Calendar
          current={selectedDate}
          onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
          onMonthChange={(month: DateData) => setCurrentMonth(month.dateString.substring(0, 7))}
          markingType={'multi-dot'}
          markedDates={markedDates}
          theme={{
            todayTextColor: '#00adf5',
            selectedDayBackgroundColor: '#00adf5',
            arrowColor: '#00adf5',
            monthTextColor: '#333',
            textMonthFontWeight: 'bold',
          }}
        />

        <View style={styles.listContainer}>
          <View style={styles.listHeaderContainer}>
            <Text style={styles.listHeader}>
              {format(parseISO(selectedDate), 'M月d日 (E)', { locale: ja })} の予定
            </Text>
            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addButton}>
              <Text style={styles.addButtonText}>＋ 追加</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={selectedShifts}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item, index }) => (
              <Swipeable
                renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, index, item)}
                overshootRight={false}
                onSwipeableOpen={(direction) => {
                  if (direction === 'right') {
                    confirmDeleteShift(item);
                  }
                }}
              >
                <View style={[styles.card, { borderLeftColor: item.color || (item.type === 'Tutor' ? 'red' : 'blue') }]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardWage}>¥{item.salary.toLocaleString()}</Text>
                  </View>
                  <Text style={styles.cardTime}>{item.startTime} - {item.endTime}</Text>
                  <Text style={styles.hintText}>◀ スライドアクション</Text>
                </View>
              </Swipeable>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>予定はありません</Text>}
          />
        </View>

        {/* Add Shift Modal */}
        <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalView}>
              <Text style={styles.modalTitle}>予定を追加 ({selectedDate})</Text>

              {/* Type Selection */}
              <View style={styles.typeSelector}>
                <TouchableOpacity style={[styles.typeButton, newShiftType === 'Tutor' && styles.typeButtonSelected]} onPress={() => setNewShiftType('Tutor')}>
                  <Text style={[styles.typeButtonText, newShiftType === 'Tutor' && styles.typeButtonTextSelected]}>手入力</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeButton, newShiftType === 'MyBasket' && styles.typeButtonSelected]} onPress={() => setNewShiftType('MyBasket')}>
                  <Text style={[styles.typeButtonText, newShiftType === 'MyBasket' && styles.typeButtonTextSelected]}>まいばす</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeButton, newShiftType === 'Other' && styles.typeButtonSelected]} onPress={() => setNewShiftType('Other')}>
                  <Text style={[styles.typeButtonText, newShiftType === 'Other' && styles.typeButtonTextSelected]}>時給計算</Text>
                </TouchableOpacity>
              </View>

              {/* Conditional Intervals */}
              {newShiftType === 'Tutor' && (
                <>
                  <TextInput style={styles.input} placeholder="タイトル (例: 家庭教師)" value={newShiftTitle} onChangeText={setNewShiftTitle} />
                  <TextInput style={styles.input} placeholder="金額 (例: 4000)" value={newShiftSalary} onChangeText={setNewShiftSalary} keyboardType="numeric" />
                </>
              )}

              {newShiftType === 'MyBasket' && (
                <>
                  <Text style={styles.label}>タイトル: まいばす (固定)</Text>
                  <Text style={styles.label}>金額: ¥{parseInt(newShiftSalary || '0').toLocaleString()} (自動計算)</Text>
                </>
              )}

              {newShiftType === 'Other' && (
                <>
                  <TextInput style={styles.input} placeholder="タイトル (例: バイト)" value={newShiftTitle} onChangeText={setNewShiftTitle} />
                  <TextInput style={styles.input} placeholder="時給 (例: 1200)" value={newHourlyWage} onChangeText={setNewHourlyWage} keyboardType="numeric" />
                  <Text style={styles.label}>金額: ¥{parseInt(newShiftSalary || '0').toLocaleString()} (自動計算)</Text>
                </>
              )}

              {/* Color Selection */}
              <View style={styles.colorSelector}>
                {COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[styles.colorButton, { backgroundColor: color }, selectedColor === color && styles.colorButtonSelected]}
                    onPress={() => setSelectedColor(color)}
                  />
                ))}
              </View>

              <View style={styles.row}>
                {Platform.OS === 'web' ? (
                  <View style={[styles.input, { flex: 1, marginRight: 5, justifyContent: 'center' }]}>
                    {/* @ts-ignore */}
                    {React.createElement('input', {
                      type: 'time',
                      value: newShiftStart,
                      onChange: (e: any) => setNewShiftStart(e.target.value),
                      style: { width: '100%', height: '100%', fontSize: 16, border: 'none', background: 'transparent' }
                    })}
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setShowStartTimePicker(true)} style={[styles.input, { flex: 1, marginRight: 5, justifyContent: 'center' }]}>
                    <Text style={styles.inputText}>{newShiftStart || "開始"}</Text>
                  </TouchableOpacity>
                )}

                {Platform.OS === 'web' ? (
                  <View style={[styles.input, { flex: 1, marginLeft: 5, justifyContent: 'center' }]}>
                    {/* @ts-ignore */}
                    {React.createElement('input', {
                      type: 'time',
                      value: newShiftEnd,
                      onChange: (e: any) => setNewShiftEnd(e.target.value),
                      style: { width: '100%', height: '100%', fontSize: 16, border: 'none', background: 'transparent' }
                    })}
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setShowEndTimePicker(true)} style={[styles.input, { flex: 1, marginLeft: 5, justifyContent: 'center' }]}>
                    <Text style={styles.inputText}>{newShiftEnd || "終了"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {Platform.OS !== 'web' && showStartTimePicker && (
                <DateTimePicker
                  value={getTimeDate(newShiftStart)}
                  mode="time"
                  is24Hour={true}
                  display="default"
                  onChange={onStartTimeChange}
                />
              )}
              {Platform.OS !== 'web' && showEndTimePicker && (
                <DateTimePicker
                  value={getTimeDate(newShiftEnd)}
                  mode="time"
                  is24Hour={true}
                  display="default"
                  onChange={onEndTimeChange}
                />
              )}

              <View style={styles.modalButtons}>
                <Button title="キャンセル" onPress={() => setModalVisible(false)} color="gray" />
                <Button title="追加" onPress={handleAddShift} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Range Calculation Modal */}
        <Modal animationType="fade" transparent={true} visible={rangeModalVisible} onRequestClose={() => setRangeModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalView}>
              <Text style={styles.modalTitle}>期間集計</Text>
              <Text style={styles.label}>開始日 (YYYY-MM-DD)</Text>
              {Platform.OS === 'web' ? (
                <View style={[styles.input, { justifyContent: 'center' }]}>
                  {/* @ts-ignore */}
                  {React.createElement('input', {
                    type: 'date',
                    value: rangeStart,
                    onChange: (e: any) => setRangeStart(e.target.value),
                    style: { width: '100%', height: '100%', fontSize: 16, border: 'none', background: 'transparent' }
                  })}
                </View>
              ) : (
                <TouchableOpacity onPress={() => setShowRangeStartDatePicker(true)} style={[styles.input, { justifyContent: 'center' }]}>
                  <Text style={styles.inputText}>{rangeStart || "タップして選択"}</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.label}>終了日 (YYYY-MM-DD)</Text>
              {Platform.OS === 'web' ? (
                <View style={[styles.input, { justifyContent: 'center' }]}>
                  {/* @ts-ignore */}
                  {React.createElement('input', {
                    type: 'date',
                    value: rangeEnd,
                    onChange: (e: any) => setRangeEnd(e.target.value),
                    style: { width: '100%', height: '100%', fontSize: 16, border: 'none', background: 'transparent' }
                  })}
                </View>
              ) : (
                <TouchableOpacity onPress={() => setShowRangeEndDatePicker(true)} style={[styles.input, { justifyContent: 'center' }]}>
                  <Text style={styles.inputText}>{rangeEnd || "タップして選択"}</Text>
                </TouchableOpacity>
              )}

              {Platform.OS !== 'web' && showRangeStartDatePicker && (
                <DateTimePicker
                  value={getDateObj(rangeStart)}
                  mode="date"
                  display="default"
                  onChange={onRangeStartDateChange}
                />
              )}
              {Platform.OS !== 'web' && showRangeEndDatePicker && (
                <DateTimePicker
                  value={getDateObj(rangeEnd)}
                  mode="date"
                  display="default"
                  onChange={onRangeEndDateChange}
                />
              )}

              <Button title="計算する" onPress={handleRangeCalculation} />

              {rangeTotal !== null && (
                <View style={{ marginTop: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 16 }}>期間合計:</Text>
                  <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#00adf5' }}>¥{rangeTotal.toLocaleString()}</Text>
                </View>
              )}

              <View style={{ marginTop: 20 }}>
                <Button title="閉じる" onPress={() => setRangeModalVisible(false)} color="gray" />
              </View>
            </View>
          </View>
        </Modal>

        {/* Baito Zukan Modal */}
        <Modal animationType="slide" transparent={false} visible={zukanModalVisible} onRequestClose={() => setZukanModalVisible(false)}>
          <SafeAreaView style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.modalTitle}>バイト図鑑 (勤務地コレクション)</Text>
              <TouchableOpacity onPress={() => setZukanModalVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>閉じる</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={discoveredLocations}
              keyExtractor={(item) => item.name}
              numColumns={2}
              contentContainerStyle={{ padding: 10 }}
              renderItem={({ item }) => (
                <View style={[styles.zukanItem, { borderColor: getLevelColor(item.count), borderWidth: 2 }]}>
                  <View style={[styles.zukanIcon, { backgroundColor: getStringColor(item.name) }]}>
                    <Text style={styles.zukanIconText}>{item.name.substring(0, 1)}</Text>
                  </View>
                  <Text style={styles.zukanName}>{item.name}</Text>
                  <View style={styles.zukanBadgeContainer}>
                    <Text style={[styles.zukanRank, { color: getLevelColor(item.count) }]}>{getRankTitle(item.count)}</Text>
                    <Text style={styles.zukanCount}>Lv.{item.count}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>まだデータがありません</Text>}
            />
          </SafeAreaView>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={deleteModalVisible}
          onRequestClose={() => setDeleteModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalView}>
              <Text style={styles.modalTitle}>削除確認</Text>
              <Text style={{ marginBottom: 20, textAlign: 'center' }}>この予定を削除しますか？{'\n'}({shiftToDelete?.title})</Text>
              <View style={styles.modalButtons}>
                <Button title="キャンセル" onPress={() => setDeleteModalVisible(false)} color="gray" />
                <Button title="削除する" onPress={performDelete} color="#dd2c00" />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 20, backgroundColor: '#fff', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  monthText: { fontSize: 16, color: '#666' },
  totalAmount: { fontSize: 32, fontWeight: 'bold', color: '#333', marginTop: 5 },
  listContainer: { flex: 1, padding: 20 },
  listHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  listHeader: { fontSize: 18, fontWeight: '600', color: '#444' },
  addButton: { backgroundColor: '#00adf5', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20 },
  addButtonText: { color: '#fff', fontWeight: 'bold' },
  rangeButton: { backgroundColor: '#FFA500', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15 },
  rangeButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 5, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1.41 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  cardWage: { fontSize: 16, fontWeight: 'bold', color: '#2e8b57' },
  cardTime: { fontSize: 14, color: '#666' },
  hintText: { fontSize: 10, color: '#999', marginTop: 5, textAlign: 'right' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalView: { width: '80%', backgroundColor: 'white', borderRadius: 20, padding: 20, alignItems: 'stretch', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  input: { height: 40, borderColor: '#ddd', borderWidth: 1, marginBottom: 15, paddingHorizontal: 10, borderRadius: 5, justifyContent: 'center' },
  inputText: { fontSize: 16, color: '#333' },
  row: { flexDirection: 'row', marginBottom: 15 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around' },
  deleteButtonSmall: { backgroundColor: '#ffcccc', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  deleteButtonText: { color: '#ff3333', fontSize: 12, fontWeight: 'bold' },
  deleteAction: { backgroundColor: '#dd2c00', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 10, marginTop: 0, borderRadius: 0, width: 80, height: '100%' },
  deleteActionText: { color: 'white', fontWeight: 'bold', padding: 20 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  typeSelector: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  typeButton: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#00adf5', borderRadius: 20, marginHorizontal: 5 },
  typeButtonSelected: { backgroundColor: '#00adf5' },
  typeButtonText: { color: '#00adf5', fontWeight: 'bold' },
  typeButtonTextSelected: { color: '#fff' },
  label: { marginBottom: 10, fontSize: 16, fontWeight: 'bold', color: '#555' },
  colorSelector: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  colorButton: { width: 30, height: 30, borderRadius: 15, marginHorizontal: 5, borderWidth: 2, borderColor: 'transparent' },
  colorButtonSelected: { borderColor: '#333', transform: [{ scale: 1.2 }] },
  // Wall Meter Styles
  wallContainer: { width: '100%', marginTop: 15, padding: 10, backgroundColor: '#f9f9f9', borderRadius: 8 },
  wallHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  wallTitle: { fontWeight: 'bold', color: '#555' },
  wallRemaining: { fontWeight: 'bold', color: '#555' },
  progressBarBackground: { height: 10, backgroundColor: '#e0e0e0', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 5 },
  wallPercent: { textAlign: 'center', fontSize: 12, color: '#777', marginTop: 3 },
  // Zukan Styles
  zukanButton: { backgroundColor: '#9C27B0', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15, marginLeft: 5 },
  zukanButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  zukanItem: { flex: 1, margin: 5, backgroundColor: '#fff', borderRadius: 10, padding: 15, alignItems: 'center', elevation: 2 },
  zukanIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  zukanIconText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  zukanName: { fontWeight: 'bold', fontSize: 13, textAlign: 'center', marginBottom: 5, height: 35 },
  zukanBadgeContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  zukanRank: { fontSize: 10, fontWeight: 'bold', marginRight: 5 },
  zukanCount: { color: '#555', fontSize: 12, fontWeight: 'bold' },
  closeButton: { padding: 5 },
  closeButtonText: { color: '#00adf5', fontWeight: 'bold' }
});
