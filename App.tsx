import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, SafeAreaView, FlatList, TouchableOpacity, Modal, TextInput, Alert, Button, Animated, Platform } from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Calendar, DateData } from 'react-native-calendars';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

import { Shift, ScraperData, parseTutorShifts, generateMyBasketShifts, calculateMonthlyTotal } from './utils/shiftCalculator';
import { loadManualShifts, saveManualShifts, loadExcludedDates, saveExcludedDates, loadExcludedTutorShifts, saveExcludedTutorShifts } from './utils/storage';
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

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      const shifts = await loadManualShifts();
      const exclusions = await loadExcludedDates();
      const tutorExclusions = await loadExcludedTutorShifts();
      setManualShifts(shifts);
      setExcludedDates(exclusions);
      setExcludedTutorShifts(tutorExclusions);
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

    // 2. MyBasket Shifts (Generate for current month +/- 1 month)
    const [year, month] = currentMonth.split('-').map(Number);
    const myBasketShiftsNext = generateMyBasketShifts(year, month + 1 > 12 ? 1 : month + 1);
    const myBasketShiftsCurr = generateMyBasketShifts(year, month);
    const myBasketShiftsPrev = generateMyBasketShifts(year, month - 1 < 1 ? 12 : month - 1);

    // Filter MyBasket by excluded dates
    const generated = [...myBasketShiftsCurr, ...myBasketShiftsPrev, ...myBasketShiftsNext]
      .filter(s => !excludedDates.includes(s.date));

    // Combine all
    const combined = [...scraperShifts, ...manualShifts, ...generated];
    setAllShifts(combined);
  }, [currentMonth, manualShifts, excludedDates, excludedTutorShifts]);

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
      const color = shift.type === 'Tutor' ? 'red' : 'blue';
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
      type: 'Tutor', // Treat manual entries as Tutor type (editable)
      startTime: newShiftStart,
      endTime: newShiftEnd,
      description: '手動追加'
    };

    const updated = [...manualShifts, newShift];
    setManualShifts(updated);
    await saveManualShifts(updated);

    setModalVisible(false);
    setNewShiftTitle('');
    setNewShiftSalary('');
  };

  const handleDeleteShift = async (indexInSelected: number, shiftToDelete: Shift) => {
    const doDelete = async () => {
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
    };

    if (Platform.OS === 'web') {
      if (window.confirm('この予定を削除しますか？')) {
        await doDelete();
      }
    } else {
      Alert.alert('削除確認', 'この予定を削除しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: doDelete
        }
      ]);
    }
  };

  const renderRightActions = (progress: any, dragX: any, index: number, item: Shift) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity onPress={() => handleDeleteShift(index, item)} style={styles.deleteAction}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Text style={styles.deleteActionText}>削除</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.monthText}>
            {format(parseISO(currentMonth + '-01'), 'yyyy年M月', { locale: ja })} の給与予測
          </Text>
          <Text style={styles.totalAmount}>¥{monthlyTotal.toLocaleString()}</Text>
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
              >
                <View style={[styles.card, { borderLeftColor: item.type === 'Tutor' ? 'red' : 'blue' }]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardWage}>¥{item.salary.toLocaleString()}</Text>
                  </View>
                  <Text style={styles.cardTime}>{item.startTime} - {item.endTime}</Text>
                  <View style={styles.cardActions}>
                    <Text style={styles.hintText}>◀ スワイプで削除</Text>
                    <TouchableOpacity onPress={() => handleDeleteShift(index, item)} style={styles.deleteButtonSmall}>
                      <Text style={styles.deleteButtonText}>削除</Text>
                    </TouchableOpacity>
                  </View>
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

              <TextInput style={styles.input} placeholder="タイトル (例: 家庭教師)" value={newShiftTitle} onChangeText={setNewShiftTitle} />
              <TextInput style={styles.input} placeholder="金額 (例: 4000)" value={newShiftSalary} onChangeText={setNewShiftSalary} keyboardType="numeric" />
              <View style={styles.row}>
                <TextInput style={[styles.input, { flex: 1, marginRight: 5 }]} placeholder="開始 (09:00)" value={newShiftStart} onChangeText={setNewShiftStart} />
                <TextInput style={[styles.input, { flex: 1, marginLeft: 5 }]} placeholder="終了 (12:00)" value={newShiftEnd} onChangeText={setNewShiftEnd} />
              </View>

              <View style={styles.modalButtons}>
                <Button title="キャンセル" onPress={() => setModalVisible(false)} color="gray" />
                <Button title="追加" onPress={handleAddShift} />
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
  input: { height: 40, borderColor: '#ddd', borderWidth: 1, marginBottom: 15, paddingHorizontal: 10, borderRadius: 5 },
  row: { flexDirection: 'row', marginBottom: 15 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around' },
  deleteButtonSmall: { backgroundColor: '#ffcccc', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  deleteButtonText: { color: '#ff3333', fontSize: 12, fontWeight: 'bold' },
  deleteAction: { backgroundColor: '#dd2c00', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 10, marginTop: 0, borderRadius: 0, width: 80, height: '100%' },
  deleteActionText: { color: 'white', fontWeight: 'bold', padding: 20 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }
});
