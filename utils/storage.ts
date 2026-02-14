import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shift, ScraperData, parseTutorShifts, LocationStats } from './shiftCalculator';
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

const TUTOR_EXCLUSION_KEY = '@salary_manager_tutor_exclusions';

// Load excluded tutor shifts (Full ID strings)
export const loadExcludedTutorShifts = async (): Promise<string[]> => {
    try {
        const jsonValue = await AsyncStorage.getItem(TUTOR_EXCLUSION_KEY);
        return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
        console.error('Failed to load tutor exclusions', e);
        return [];
    }
};

// Save excluded tutor shifts
export const saveExcludedTutorShifts = async (ids: string[]): Promise<void> => {
    try {
        const jsonValue = JSON.stringify(ids);
        await AsyncStorage.setItem(TUTOR_EXCLUSION_KEY, jsonValue);
    } catch (e) {
        console.error('Failed to save tutor exclusions', e);
    }
};
const LOCATIONS_KEY = '@salary_manager_locations';

export const loadDiscoveredLocations = async (): Promise<LocationStats[]> => {
    try {
        const jsonValue = await AsyncStorage.getItem(LOCATIONS_KEY);
        return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
        console.error('Failed to load locations', e);
        return [];
    }
};

export const saveDiscoveredLocations = async (locations: LocationStats[]): Promise<void> => {
    try {
        const jsonValue = JSON.stringify(locations);
        await AsyncStorage.setItem(LOCATIONS_KEY, jsonValue);
    } catch (e) {
        console.error('Failed to save locations', e);
    }
};
