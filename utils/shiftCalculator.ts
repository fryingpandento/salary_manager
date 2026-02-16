import { getDaysInMonth, isSaturday, isSunday, format } from 'date-fns';

export interface Shift {
    date: string;       // YYYY-MM-DD
    title: string;
    description?: string;
    salary: number;
    type: 'Tutor' | 'MyBasket' | 'Other';
    startTime?: string;
    endTime?: string;
    hourlyRate?: number;
    color?: string;
    location?: string;
}

// Matches the output of the schedule scraper
export interface ScraperData {
    full_text: string;
    details: string;
    startDate: string; // ISO format
    endDate: string;   // ISO format
    type?: string;     // 'try' | 'mybasket' (optional)
    salary?: number;   // optional pre-calculated salary
    location?: string; // optional location
}

export type TutorShiftRaw = ScraperData; // Alias for compatibility if needed

export interface LocationStats {
    name: string;
    count: number;
    lastVisited: string;
}

const WAGE_MYBASKET_SAT = 1240;
const WAGE_MYBASKET_SUN = 1290;
const HOURS_MYBASKET = 4;

// Parse salary from description string (e.g. "日給：4,000円")
const parseTutorSalary = (description: string): number => {
    const match = description.match(/日給[：:]\s*([0-9,]+)円/);
    if (match && match[1]) {
        return parseInt(match[1].replace(/,/g, ''), 10);
    }
    return 0;
};

export const WAGE_MYBASKET_WEEKDAY_MORNING = 1330; // ~09:00
export const WAGE_MYBASKET_WEEKDAY_DAY = 1240;     // 09:00~22:00
export const WAGE_MYBASKET_WEEKDAY_NIGHT = 1555;   // 22:00~
export const WAGE_MYBASKET_WEEKEND_OFFSET = 50;

// Helper to convert "HH:mm" to minutes from midnight
const timeToMinutes = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

// Calculate wage for MyBasket based on time and date
export const calculateMyBasketWage = (dateStr: string, startTime: string, endTime: string): number => {
    const date = new Date(dateStr);
    const isWeekend = isSaturday(date) || isSunday(date);
    const offset = isWeekend ? WAGE_MYBASKET_WEEKEND_OFFSET : 0;

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);

    // Rates for time segments
    const rateMorning = WAGE_MYBASKET_WEEKDAY_MORNING + offset;
    const rateDay = WAGE_MYBASKET_WEEKDAY_DAY + offset;
    const rateNight = WAGE_MYBASKET_WEEKDAY_NIGHT + offset;

    let totalWage = 0;

    // Iterate through minutes
    // Optimization: Calculate overlap for each segment
    // Segment 1: 0 - 540 (09:00)
    const morningEnd = 540;
    const dayEnd = 1320; // 22:00

    // Morning overlap
    if (startMin < morningEnd) {
        const overlap = Math.min(endMin, morningEnd) - Math.max(startMin, 0);
        if (overlap > 0) totalWage += (overlap / 60) * rateMorning;
    }

    // Day overlap
    if (startMin < dayEnd && endMin > morningEnd) {
        const overlap = Math.min(endMin, dayEnd) - Math.max(startMin, morningEnd);
        if (overlap > 0) totalWage += (overlap / 60) * rateDay;
    }

    // Night overlap
    if (endMin > dayEnd) {
        const overlap = endMin - Math.max(startMin, dayEnd);
        if (overlap > 0) totalWage += (overlap / 60) * rateNight;
    }

    return Math.floor(totalWage);
};

// Calculate wage for generic hourly rate
export const calculateHourlyWage = (hourlyRate: number, startTime: string, endTime: string): number => {
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    const durationMin = endMin - startMin;
    if (durationMin <= 0) return 0;
    return Math.floor((durationMin / 60) * hourlyRate);
};

// Helper to extract clean location name from details or title
// Format: "R7年度_中央ふれあい館（埼玉県_川口市）（駐車場なし）" -> "中央ふれあい館"
export const extractLocationName = (description: string | undefined): string => {
    if (!description) return '不明';

    // Check for "勤務地：" pattern in details
    const match = description.match(/勤務地：(.*?)(?:\s|\/|$)/);
    let rawLocation = match ? match[1] : description;

    // Clean up
    // 1. Remove "R\d+年度_" prefix
    rawLocation = rawLocation.replace(/R\d+年度_/, '');
    // 2. Remove particular suffixes like (埼玉県_川口市), (駐車場なし)
    // We remove any string enclosed in full-width parenthesis （...）
    rawLocation = rawLocation.replace(/（.*?）/g, '');

    return rawLocation.trim();
};

// ... (existing parseTutorShifts, generateMyBasketShifts, calculateMonthlyTotal implementations)
// Note: generateMyBasketShifts relies on WAGE_MYBASKET_SAT constants which we might want to consolidate or keep for compatibility if used elsewhere.
// But technically user wants DYNAMIC calculation now, so maybe generateMyBasketShifts should use the new function?
// For now, I will keep old constants for generateMyBasketShifts unless user asks to change the *generation* logic. 
// User asked to "add MyBasket as selectable", so this applies to manually added shifts.

// ... (Rest of file content)


// Convert raw JSON data (from scraper) to Shift objects
export const parseTutorShifts = (rawData: ScraperData[]): Shift[] => {
    return rawData.map(item => {
        const start = new Date(item.startDate);
        const end = new Date(item.endDate);
        const dateStr = format(start, 'yyyy-MM-dd');

        // Extract title from details (e.g., "勤務地：XXX")
        let title = '家庭教師';
        // details looks like: "案件名：... / 勤務地：... / ..."
        if (item.details) {
            const parts = item.details.split(' / ');
            const locationPart = parts.find(p => p.startsWith('勤務地：'));
            if (locationPart) {
                title = locationPart.replace('勤務地：', '').trim();
            }
        }

        // Determine type based on scraper data or details
        let type: 'Tutor' | 'MyBasket' | 'Other' = 'Tutor';
        if (item.type === 'mybasket') {
            type = 'MyBasket';
        } else if (item.type === 'try') {
            type = 'Tutor';
        }

        // Use pre-calculated salary if available (for MyBasket)
        const salary = item.salary !== undefined ? item.salary : parseTutorSalary(item.details);

        return {
            date: dateStr,
            title: title,
            description: item.details,
            salary: salary,
            type: type,
            startTime: format(start, 'HH:mm'),
            endTime: format(end, 'HH:mm'),
        };
    });
};

// Generate MyBasket shifts for a specific month
export const generateMyBasketShifts = (year: number, month: number): Shift[] => {
    const daysInMonth = getDaysInMonth(new Date(year, month - 1));
    const shifts: Shift[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dateStr = format(date, 'yyyy-MM-dd');

        if (isSaturday(date)) {
            shifts.push({
                date: dateStr,
                title: 'まいばす',
                salary: WAGE_MYBASKET_SAT * HOURS_MYBASKET,
                type: 'MyBasket',
                startTime: '09:00',
                endTime: '13:00'
            });
        } else if (isSunday(date)) {
            shifts.push({
                date: dateStr,
                title: 'まいばす',
                salary: WAGE_MYBASKET_SUN * HOURS_MYBASKET,
                type: 'MyBasket',
                startTime: '09:00',
                endTime: '13:00'
            });
        }
    }
    return shifts;
};


// Calculate total salary for a specific range
export const calculateRangeTotal = (shifts: Shift[], startDate: string, endDate: string): number => {
    return shifts
        .filter(s => s.date >= startDate && s.date <= endDate)
        .reduce((sum, s) => sum + s.salary, 0);
};

// Calculate total salary for a specific month
export const calculateMonthlyTotal = (shifts: Shift[], year: number, month: number): number => {
    const targetPrefix = format(new Date(year, month - 1, 1), 'yyyy-MM');
    return shifts
        .filter(s => s.date.startsWith(targetPrefix))
        .reduce((sum, s) => sum + s.salary, 0);
};

// Calculate annual total salary for 1.03M wall
export const calculateAnnualTotal = (shifts: Shift[], year: number): number => {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return shifts
        .filter(s => s.date >= start && s.date <= end)
        .reduce((sum, s) => sum + s.salary, 0);
};
