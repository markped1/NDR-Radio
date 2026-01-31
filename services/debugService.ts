
import { dbService } from './../services/dbService';

export const forceRefreshNews = async () => {
    localStorage.removeItem('ndn_radio_last_sync');
    localStorage.removeItem('ndn_radio_news');
    window.location.reload();
};
