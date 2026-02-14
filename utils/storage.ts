import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shift, ScraperData, parseTutorShifts } from './shiftCalculator';
// @ts-ignore
import tutorDataRaw from '../assets/shifts.json';

const MANUAL_SHIFTS_KEY = '@salary_manager_manual_shifts';
const EXCLUSION_KEY = '@salary_manager_exclusions';

// Load manual shifts from storage.
export const loadManualShifts = async (): Promise<Shift[]> => {
    try {
        const jsonValue = await AsyncStorage.getItem(MANUAL_SHIFTS_KEY);
        return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
        console.error('Failed to load manual shifts', e);
        return [];
    }
};

// Save manual shifts to storage
export const saveManualShifts = async (shifts: Shift[]): Promise<void> => {
    try {
        const jsonValue = JSON.stringify(shifts);
        await AsyncStorage.setItem(MANUAL_SHIFTS_KEY, jsonValue);
    } catch (e) {
        console.error('Failed to save manual shifts', e);
    }
};

// Load excluded dates (dates where MyBasket shifts are deleted/hidden)
export const loadExcludedDates = async (): Promise<string[]> => {
    try {
        const jsonValue = await AsyncStorage.getItem(EXCLUSION_KEY);
        return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
        console.error('Failed to load exclusions', e);
        return [];
    }
};

// Save excluded dates
export const saveExcludedDates = async (dates: string[]): Promise<void> => {
    try {
        const jsonValue = JSON.stringify(dates);
        await AsyncStorage.setItem(EXCLUSION_KEY, jsonValue);
    } catch (e) {
        console.error('Failed to save exclusions', e);
    }
};
