import { getDaysInMonth, isSaturday, isSunday, format } from 'date-fns';

export interface Shift {
    date: string;       // YYYY-MM-DD
    title: string;
    description?: string;
    salary: number;
    type: 'Tutor' | 'MyBasket';
    startTime?: string;
    endTime?: string;
}

// Matches the output of the schedule scraper
export interface ScraperData {
    full_text: string;
    details: string;
    startDate: string; // ISO format
    endDate: string;   // ISO format
}

export type TutorShiftRaw = ScraperData; // Alias for compatibility if needed

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

        return {
            date: dateStr,
            title: title,
            description: item.details,
            salary: parseTutorSalary(item.details),
            type: 'Tutor',
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

// Calculate total salary for a specific month
export const calculateMonthlyTotal = (shifts: Shift[], year: number, month: number): number => {
    const targetPrefix = format(new Date(year, month - 1, 1), 'yyyy-MM');
    return shifts
        .filter(s => s.date.startsWith(targetPrefix))
        .reduce((sum, s) => sum + s.salary, 0);
};
