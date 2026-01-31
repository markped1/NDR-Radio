
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MUSIC_DIR = path.join(__dirname, '../public/music');
const OUTPUT_FILE = path.join(__dirname, '../public/playlist.json');

// Supported extensions
const EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            const ext = path.extname(file).toLowerCase();
            if (EXTENSIONS.includes(ext)) {
                // Calculate relative path for URL (e.g., /music/Album/song.mp3)
                // We use forward slashes for URLs regardless of OS
                const relativePath = fullPath.replace(path.join(__dirname, '../public'), '').replace(/\\/g, '/');

                arrayOfFiles.push({
                    id: 'static-' + Math.random().toString(36).substr(2, 9),
                    name: path.basename(file, ext),
                    url: relativePath,
                    date: fs.statSync(fullPath).mtimeMs, // Keep creation date
                    type: 'audio'
                });
            }
        }
    });

    return arrayOfFiles;
}

try {
    if (!fs.existsSync(MUSIC_DIR)) {
        console.log('Creating music directory...');
        fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }

    console.log('Scanning for music files in ' + MUSIC_DIR + '...');
    const playlist = getAllFiles(MUSIC_DIR).map(item => ({
        id: item.id,
        name: item.name,
        url: item.url,
        type: 'audio',
        timestamp: item.date
    }));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(playlist, null, 2));
    console.log(`Success! Generated playlist with ${playlist.length} tracks.`);
    console.log(`Saved to: ${OUTPUT_FILE}`);
} catch (e) {
    console.error('Error generating playlist:', e);
}
