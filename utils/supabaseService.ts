
import { supabase } from './supabaseClient';
import { Shift } from './shiftCalculator';

// Table name: 'shifts'
// Expected columns: id, user_id (optional), title, date, start_time, end_time, location, salary, type, description, created_at

export const fetchShiftsFromSupabase = async (): Promise<Shift[]> => {
    try {
        const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .order('date', { ascending: true });

        if (error) {
            console.error('Error fetching shifts:', error);
            return [];
        }

        return data.map((item: any) => ({
            date: item.date,
            title: item.title,
            startTime: item.start_time,
            endTime: item.end_time,
            location: item.location,
            salary: item.salary,
            type: item.type,
            description: item.description || 'Manual Entry (Supabase)',
            hourlyRate: item.hourly_rate,
        }));
    } catch (e) {
        console.error('Unexpected error fetching shifts:', e);
        return [];
    }
};

export const addShiftToSupabase = async (shift: Shift): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('shifts')
            .insert([
                {
                    title: shift.title,
                    date: shift.date,
                    start_time: shift.startTime,
                    end_time: shift.endTime,
                    location: shift.location,
                    salary: shift.salary,
                    type: shift.type,
                    description: shift.description,
                    hourly_rate: shift.hourlyRate,
                }
            ]);

        if (error) {
            console.error('Error adding shift:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Unexpected error adding shift:', e);
        return false;
    }
};
