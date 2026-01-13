import { Router } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { User } from '../models/User';
import { ListenTogetherRequest } from '../models/ListenTogetherRequest';
import { ListenSession } from '../models/ListenSession';

const router = Router();

// Send listen together invitation
router.post('/invite/:userId', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { userId } = req.params;
        const fromUserId = req.userId;

        if (!fromUserId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (userId === fromUserId) {
            return res.status(400).json({ message: 'Cannot send request to yourself' });
        }

        // Check if both users exist
        const [fromUser, toUser] = await Promise.all([
            User.findById(fromUserId),
            User.findById(userId),
        ]);

        if (!fromUser || !toUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if they are friends
        const areFriends = fromUser.friends.some((id) => id.toString() === userId);
        if (!areFriends) {
            return res.status(403).json({ message: 'You can only invite friends to listen together' });
        }

        // Check if there's already a pending request
        const existingRequest = await ListenTogetherRequest.findOne({
            from: fromUserId,
            to: userId,
            status: 'pending',
        });

        if (existingRequest) {
            return res.status(400).json({ message: 'Request already sent' });
        }

        // Create new request
        const request = new ListenTogetherRequest({
            from: fromUserId,
            to: userId,
            status: 'pending',
        });

        await request.save();

        // Add to user's incoming requests
        toUser.listenTogetherRequests.push(request._id as any);
        await toUser.save();

        return res.json({
            message: 'Invitation sent',
            requestId: request._id
        });
    } catch (error) {
        console.error('Error sending listen together invite:', error);
        return res.status(500).json({ message: 'Failed to send invitation' });
    }
});

// Get pending listen together requests
router.get('/requests', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const requests = await ListenTogetherRequest.find({
            to: userId,
            status: 'pending',
            expiresAt: { $gt: new Date() }, // Only non-expired requests
        })
            .populate('from', 'name username profileImage')
            .sort({ createdAt: -1 });

        return res.json(requests);
    } catch (error) {
        console.error('Error fetching listen together requests:', error);
        return res.status(500).json({ message: 'Failed to fetch requests' });
    }
});

// Accept listen together request
router.post('/requests/:requestId/accept', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const request = await ListenTogetherRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (request.to.toString() !== userId) {
            return res.status(403).json({ message: 'Unauthorized to accept this request' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Request is no longer pending' });
        }

        if (request.expiresAt < new Date()) {
            request.status = 'expired';
            await request.save();
            return res.status(400).json({ message: 'Request has expired' });
        }

        // Check if either user is already in an active session
        const [hostUser, participantUser] = await Promise.all([
            User.findById(request.from),
            User.findById(userId),
        ]);

        if (!hostUser || !participantUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // End any existing active sessions for both users
        if (hostUser.activeListenSession) {
            await ListenSession.findByIdAndUpdate(hostUser.activeListenSession, {
                isActive: false,
                endedAt: new Date(),
            });
        }

        if (participantUser.activeListenSession) {
            await ListenSession.findByIdAndUpdate(participantUser.activeListenSession, {
                isActive: false,
                endedAt: new Date(),
            });
        }

        // Create new session
        const session = new ListenSession({
            host: request.from,
            participants: [request.from, userId],
            queue: [],
            playbackState: {
                position: 0,
                isPlaying: false,
                updatedAt: new Date(),
            },
            isActive: true,
        });

        await session.save();

        // Update request
        request.status = 'accepted';
        request.sessionId = session._id as any;
        await request.save();

        // Update both users' active session
        hostUser.activeListenSession = session._id as any;
        participantUser.activeListenSession = session._id as any;

        // Remove request from participant's incoming requests
        participantUser.listenTogetherRequests = participantUser.listenTogetherRequests.filter(
            (id) => id.toString() !== requestId
        );

        await Promise.all([hostUser.save(), participantUser.save()]);

        return res.json({
            message: 'Request accepted',
            sessionId: session._id,
            session,
        });
    } catch (error) {
        console.error('Error accepting listen together request:', error);
        return res.status(500).json({ message: 'Failed to accept request' });
    }
});

// Decline listen together request
router.post('/requests/:requestId/decline', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const request = await ListenTogetherRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (request.to.toString() !== userId) {
            return res.status(403).json({ message: 'Unauthorized to decline this request' });
        }

        request.status = 'declined';
        await request.save();

        // Remove from user's requests
        const user = await User.findById(userId);
        if (user) {
            user.listenTogetherRequests = user.listenTogetherRequests.filter(
                (id) => id.toString() !== requestId
            );
            await user.save();
        }

        return res.json({ message: 'Request declined' });
    } catch (error) {
        console.error('Error declining listen together request:', error);
        return res.status(500).json({ message: 'Failed to decline request' });
    }
});

// Get all friends (for selection in UI)
router.get('/friends', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const user = await User.findById(userId).populate(
            'friends',
            'name username profileImage isPrivate'
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json(user.friends);
    } catch (error) {
        console.error('Error fetching friends:', error);
        return res.status(500).json({ message: 'Failed to fetch friends' });
    }
});

export default router;
