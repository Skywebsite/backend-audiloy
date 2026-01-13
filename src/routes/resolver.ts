
import { Router, Request, Response } from 'express';
// @ts-ignore - yt-search has no type declarations
import yts from 'yt-search';
import ytdl from '@distube/ytdl-core';

// Type for yt-search video result
interface YTVideo {
    videoId: string;
    title: string;
    seconds: number;
    thumbnail: string;
    author: { name: string };
}

const router = Router();

// Define input type
interface ResolveAudioRequest {
    title: string;
    artist: string;
    duration?: number; // duration in ms
}

router.post('/resolve-audio', async (req: Request, res: Response) => {
    try {
        const { title, artist, duration } = req.body as ResolveAudioRequest;

        if (!title || !artist) {
            return res.status(400).json({ error: 'Title and artist are required' });
        }

        const query = `${title} ${artist} audio`;
        const searchResults = await yts(query);

        if (!searchResults.videos || searchResults.videos.length === 0) {
            return res.status(404).json({ error: 'No results found' });
        }

        let videoId = searchResults.videos[0].videoId; // Default to first result

        // If duration is provided, try to find a better match
        if (duration) {
            const durationSeconds = duration / 1000;
            const tolerance = 5; // +/- 5 seconds

            const match = (searchResults.videos as YTVideo[]).find((v: YTVideo) => {
                return Math.abs(v.seconds - durationSeconds) <= tolerance;
            });

            if (match) {
                videoId = match.videoId;
            }
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Get direct audio URL
        const info = await ytdl.getInfo(videoUrl);
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });

        if (!format || !format.url) {
            return res.status(500).json({ error: 'Could not extract audio URL' });
        }

        return res.json({
            audioUrl: format.url,
            source: 'youtube',
            videoId: videoId,
            title: info.videoDetails.title
        });

    } catch (error) {
        console.error('Error resolving audio:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

interface SearchRequest {
    q: string;
}

router.get('/search', async (req: Request, res: Response) => {
    try {
        const { q } = req.query as unknown as SearchRequest;

        if (!q) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const searchResults = await yts(q + ' audio');

        if (!searchResults.videos) {
            return res.status(404).json({ error: 'No results' });
        }

        // Return top 20 results
        const tracks = (searchResults.videos as YTVideo[]).slice(0, 20).map((v: YTVideo) => ({
            id: v.videoId,
            title: v.title,
            artist: v.author.name,
            duration: v.seconds * 1000,
            artwork: v.thumbnail,
            source: 'youtube'
        }));

        return res.json(tracks);

    } catch (error) {
        console.error('Error searching:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
