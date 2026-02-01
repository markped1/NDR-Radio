
import { supabase } from './supabaseClient';

export interface StationState {
    is_playing: boolean;
    track_id: string;
    track_url: string;
    track_name: string;
    track_artist?: string;
    duration?: number;
    started_at: number; // Cloud timestamp (Date.now())
    updated_at?: number;
    active_tab?: 'home' | 'news' | 'radio' | 'community';
}

export const realtimeService = {
    // Listener: Subscribe to changes from the "station_state" table
    subscribeToStation: (callback: (state: StationState) => void) => {
        // 1. Subscribe to real-time changes
        const channel = supabase
            .channel('station_sync')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'station_state', filter: 'id=eq.1' },
                (payload) => {
                    console.log("Realtime Update Received:", payload.new);
                    callback(payload.new as StationState);
                }
            )
            .subscribe();

        // 2. Fetch the initial state immediately
        supabase.from('station_state').select('*').eq('id', 1).single().then(({ data, error }) => {
            if (!error && data) {
                console.log("Initial Realtime State:", data);
                callback(data as StationState);
            }
        });

        // Return unsubscribe function
        return () => supabase.removeChannel(channel);
    },

    // Admin: Broadcast update to the cloud
    updateStation: async (state: Partial<StationState>) => {
        const { error } = await supabase.from('station_state').update({
            ...state,
            updated_at: Date.now()
        }).eq('id', 1);

        if (error) console.error("Failed to broadcast station state:", error);
    }
};
