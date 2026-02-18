
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your actual Supabase URL and Anon Key
const SUPABASE_URL = 'https://wkhhbwzbbvpwmkqdvvso.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kWCeIBN9tu2Jg5LDX5Q9Hg_EL1xHz-f';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
