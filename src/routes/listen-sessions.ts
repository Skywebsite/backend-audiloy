import { Router } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { User } from '../models/User';
import { ListenSession } from '../models/ListenSession';

const router = Router();

// Get current active session for user
router.get('/active', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const user = await User.findById(userId);
        if (!user || !user.activeListenSession) {
            return res.json({ session: null });
        }

        const session = await ListenSession.findById(user.activeListenSession)
            .populate('host', 'name username profileImage')
            .populate('participants', 'name username profileImage');

        if (!session || !session.isActive) {
            // Clean up stale reference
            user.activeListenSession = undefined;
            await user.save();
            return res.json({ session: null });
        }

        return res.json({ session });
    } catch (error) {
        console.error('Error fetching active session:', error);
        return res.status(500).json({ message: 'Failed to fetch session' });
    }
});

// Get session details
router.get('/:sessionId', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const session = await ListenSession.findById(sessionId)
            .populate('host', 'name username profileImage')
            .populate('participants', 'name username profileImage');

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Check if user is part of this session
        const isParticipant = session.participants.some(
            (p: any) => p._id.toString() === userId
        );

        if (!isParticipant) {
            return res.status(403).json({ message: 'You are not part of this session' });
        }

        return res.json(session);
    } catch (error) {
        console.error('Error fetching session:', error);
        return res.status(500).json({ message: 'Failed to fetch session' });
    }
});

// Update playback state (only host can update)
router.post('/:sessionId/sync', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const session = await ListenSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        if (!session.isActive) {
            return res.status(400).json({ message: 'Session is no longer active' });
        }

        // Only host can update playback state
        if (session.host.toString() !== userId) {
            return res.status(403).json({ message: 'Only the host can update playback state' });
        }

        const { currentTrack, position, isPlaying, queue } = req.body;

        // Update playback state
        if (typeof position === 'number') {
            session.playbackState.position = position;
        }

        if (typeof isPlaying === 'boolean') {
            session.playbackState.isPlaying = isPlaying;
        }

        if (currentTrack) {
            session.currentTrack = currentTrack;
        }

        if (queue) {
            session.queue = queue;
        }

        session.playbackState.updatedAt = new Date();
        await session.save();

        return res.json({
            message: 'Playback state updated',
            playbackState: session.playbackState,
            currentTrack: session.currentTrack,
        });
    } catch (error) {
        console.error('Error updating playback state:', error);
        return res.status(500).json({ message: 'Failed to update playback state' });
    }
});

// Get current playback state (for participants to sync)
router.get('/:sessionId/state', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const session = await ListenSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Check if user is part of this session
        const isParticipant = session.participants.some((p) => p.toString() === userId);
        if (!isParticipant) {
            return res.status(403).json({ message: 'You are not part of this session' });
        }

        return res.json({
            currentTrack: session.currentTrack,
            playbackState: session.playbackState,
            queue: session.queue,
            host: session.host,
        });
    } catch (error) {
        console.error('Error fetching playback state:', error);
        return res.status(500).json({ message: 'Failed to fetch playback state' });
    }
});

// Leave session
router.post('/:sessionId/leave', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const [session, user] = await Promise.all([
            ListenSession.findById(sessionId),
            User.findById(userId),
        ]);

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Remove user from participants
        session.participants = session.participants.filter((p) => p.toString() !== userId);

        // If host leaves or all participants left, end the session
        if (session.host.toString() === userId || session.participants.length === 0) {
            session.isActive = false;
            session.endedAt = new Date();

            // Remove session from all participants
            await User.updateMany(
                { _id: { $in: session.participants } },
                { $unset: { activeListenSession: 1 } }
            );
        }

        await session.save();

        // Remove session from user
        user.activeListenSession = undefined;
        await user.save();

        return res.json({ message: 'Left session successfully' });
    } catch (error) {
        console.error('Error leaving session:', error);
        return res.status(500).json({ message: 'Failed to leave session' });
    }
});

// End session (host only)
router.post('/:sessionId/end', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const session = await ListenSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Only host can end session
        if (session.host.toString() !== userId) {
            return res.status(403).json({ message: 'Only the host can end the session' });
        }

        session.isActive = false;
        session.endedAt = new Date();
        await session.save();

        // Remove session from all participants
        await User.updateMany(
            { _id: { $in: session.participants } },
            { $unset: { activeListenSession: 1 } }
        );

        return res.json({ message: 'Session ended successfully' });
    } catch (error) {
        console.error('Error ending session:', error);
        return res.status(500).json({ message: 'Failed to end session' });
    }
});

export default router;
