const { parseISO, format } = require('date-fns');

// Mock data
const today = new Date();
today.setHours(0, 0, 0, 0);
const nextWeek = new Date(today);
nextWeek.setDate(today.getDate() + 7);

const shifts = [
    { date: '2026-02-19', endTime: '12:00', title: 'Past' },
    { date: '2026-02-20', endTime: '09:00', title: 'Future' },
    { date: 'invalid-date', endTime: '00:00', title: 'Invalid' },
    { date: undefined, endTime: '00:00', title: 'Missing Date' },
    { date: '2026-02-19', endTime: undefined, title: 'Missing EndTime' },
    { date: '2026-02-19', endTime: 'invalid', title: 'Invalid EndTime' },
];

console.log('Running validation...');

try {
    const filtered = shifts.filter(s => {
        if (!s.date) {
            console.log(`Skipping missing date: ${s.title}`);
            return false;
        }

        // Emulating App.tsx logic
        const d = parseISO(s.date);
        if (isNaN(d.getTime())) {
            console.log(`Skipping invalid date: ${s.title}`);
            return false;
        }

        if (d > today && d <= nextWeek) return true;

        const sDateStr = format(d, 'yyyy-MM-dd');
        const todayStr = format(today, 'yyyy-MM-dd');

        if (sDateStr === todayStr) {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();

            const endTimeStr = s.endTime || '00:00';
            if (!endTimeStr.includes(':')) {
                console.log(`Skipping invalid time format: ${s.title}`);
                return false;
            }

            const [endH, endM] = endTimeStr.split(':').map(Number);
            return endH > currentHour || (endH === currentHour && endM > currentMinute);
        }
        return false;
    });

    console.log('Filtered shifts:', filtered.length);
    filtered.forEach(s => console.log(`- ${s.title}`));
    console.log('Validation passed.');
} catch (e) {
    console.error('Validation crashed:', e);
}
