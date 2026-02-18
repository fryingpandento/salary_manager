
import { supabase } from './supabaseClient';
import { Shift } from './shiftCalculator';

// Table name: 'shifts'
// Expected columns: id, user_id (optional), title, date, start_time, end_time, location, salary, type, description, created_at, color

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
            id: item.id,
            date: item.date,
            title: item.title,
            startTime: item.start_time,
            endTime: item.end_time,
            location: item.location,
            salary: item.salary,
            type: item.type,
            description: item.description || 'Manual Entry (Supabase)',
            hourlyRate: item.hourly_rate,
            color: item.color,
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
                    color: shift.color,
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

export const updateShiftInSupabase = async (shift: Shift): Promise<boolean> => {
    if (!shift.id) return false;
    try {
        const { error } = await supabase
            .from('shifts')
            .update({
                title: shift.title,
                date: shift.date,
                start_time: shift.startTime,
                end_time: shift.endTime,
                location: shift.location,
                salary: shift.salary,
                type: shift.type,
                description: shift.description,
                hourly_rate: shift.hourlyRate,
                color: shift.color,
            })
            .eq('id', shift.id);

        if (error) {
            console.error('Error updating shift:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Unexpected error updating shift:', e);
        return false;
    }
};

export const deleteShiftFromSupabase = async (id: number): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('shifts')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting shift:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Unexpected error deleting shift:', e);
        return false;
    }
};
