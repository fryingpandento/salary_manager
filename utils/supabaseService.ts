
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
            startTime: item.start_time ? item.start_time.slice(0, 5) : '',
            endTime: item.end_time ? item.end_time.slice(0, 5) : '',
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

export const addShiftToSupabase = async (shift: Shift): Promise<{ data: Shift | null, error: string | null }> => {
    try {
        const { data, error } = await supabase
            .from('shifts')
            .insert([
                {
                    title: shift.title,
                    date: shift.date,
                    start_time: shift.startTime,
                    end_time: shift.endTime,
                    location: shift.location || null, // Handle undefined
                    salary: shift.salary,
                    type: shift.type,
                    description: shift.description || null,
                    hourly_rate: shift.hourlyRate || null, // Handle undefined
                    // color: shift.color || null, // Column missing in DB
                }
            ])
            .select();

        if (error) {
            console.error('Error adding shift:', error);
            return { data: null, error: error.message || JSON.stringify(error) };
        }

        if (data && data.length > 0) {
            const item = data[0];
            return {
                data: {
                    ...shift,
                    id: item.id,
                    color: item.color
                },
                error: null
            };
        }
        return { data: null, error: 'No data returned' };
    } catch (e: any) {
        console.error('Unexpected error adding shift:', e);
        return { data: null, error: e.message || 'Unexpected error' };
    }
};

export const updateShiftInSupabase = async (shift: Shift): Promise<{ success: boolean, error: string | null }> => {
    if (!shift.id) return { success: false, error: 'Shift ID missing' };
    try {
        const { error } = await supabase
            .from('shifts')
            .update({
                title: shift.title,
                date: shift.date,
                start_time: shift.startTime,
                end_time: shift.endTime,
                location: shift.location || null,
                salary: shift.salary,
                type: shift.type,
                description: shift.description || null,
                hourly_rate: shift.hourlyRate || null,
                // color: shift.color || null, // Column missing in DB
            })
            .eq('id', shift.id);

        if (error) {
            console.error('Error updating shift:', error);
            return { success: false, error: error.message || JSON.stringify(error) };
        }
        return { success: true, error: null };
    } catch (e: any) {
        console.error('Unexpected error updating shift:', e);
        return { success: false, error: e.message || 'Unexpected error' };
    }
};

export const deleteShiftFromSupabase = async (id: number): Promise<{ success: boolean, error: string | null }> => {
    try {
        const { error } = await supabase
            .from('shifts')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting shift:', error);
            return { success: false, error: error.message || JSON.stringify(error) };
        }
        return { success: true, error: null };
    } catch (e: any) {
        console.error('Unexpected error deleting shift:', e);
        return { success: false, error: e.message || 'Unexpected error' };
    }
};
