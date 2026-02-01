
import { createClient } from '@supabase/supabase-js';

// Access environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("Supabase credentials missing! Real-time features disabled.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
