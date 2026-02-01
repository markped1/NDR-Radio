
import { createClient } from '@supabase/supabase-js';

// Access environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

let client: any = null;

try {
    if (supabaseUrl && supabaseKey && supabaseKey.startsWith('ey')) {
        client = createClient(supabaseUrl, supabaseKey);
    } else {
        console.warn("Supabase credentials missing or invalid (Key must start with 'ey'). Real-time disabled.");
    }
} catch (e) {
    console.error("Supabase Init Failed:", e);
}

// Export a robust object that won't crash the app if called
export const supabase = client || {
    from: () => ({
        select: () => Promise.resolve({ data: null, error: { message: 'No Client' } }),
        update: () => Promise.resolve({ data: null, error: { message: 'No Client' } }),
        upsert: () => Promise.resolve({ data: null, error: { message: 'No Client' } }),
        delete: () => Promise.resolve({ data: null, error: { message: 'No Client' } })
    }),
    channel: () => ({
        on: () => ({ subscribe: () => ({}) }),
        subscribe: () => { }
    }),
    removeChannel: () => { },
    auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } })
    }
};
