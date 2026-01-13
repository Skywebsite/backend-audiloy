import { Router } from 'express';
import multer from 'multer';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { optionalAuthMiddleware } from '../middleware/optionalAuth';
import { User } from '../models/User';
import { Song } from '../models/Song';
import cloudinary from '../config/cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get current user profile
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await User.findById(req.userId).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json(user);
});

// Update basic settings (name / username / privacy)
router.patch('/me', authMiddleware, async (req: AuthRequest, res) => {
  const { isPrivate, name, username } = req.body as {
    isPrivate?: boolean;
    name?: string;
    username?: string;
  };

  const updates: any = {
    ...(typeof isPrivate === 'boolean' ? { isPrivate } : {}),
    ...(name ? { name } : {}),
  };

  if (username) {
    const normalized = username.trim().toLowerCase();
    const existing = await User.findOne({ _id: { $ne: req.userId }, username: normalized });
    if (existing) {
      return res.status(409).json({ message: 'Username already taken' });
    }
    updates.username = normalized;
  }

  const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true }).select(
    '-password'
  );

  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json(user);
});

// Update profile with optional avatar upload
router.patch(
  '/me/profile',
  authMiddleware,
  upload.single('avatar'),
  async (req: AuthRequest, res) => {
    try {
      const { name, isPrivate } = req.body as { name?: string; isPrivate?: string };

      const updates: any = {};
      if (name) updates.name = name;
      if (typeof isPrivate === 'string') updates.isPrivate = isPrivate === 'true';

      if (req.file) {
        const file = req.file as Express.Multer.File;
        const uploadResult = await new Promise<{ url: string; public_id: string }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'audioly/avatars',
              resource_type: 'image',
            },
            (error, result) => {
              if (error || !result) return reject(error);
              resolve({ url: result.secure_url, public_id: result.public_id });
            }
          );

          stream.end(file.buffer);
        });

        updates.profileImage = {
          url: uploadResult.url,
          publicId: uploadResult.public_id,
        };
      }

      const user = await User.findByIdAndUpdate(
        req.userId,
        { $set: updates },
        { new: true }
      ).select('-password');

      if (!user) return res.status(404).json({ message: 'User not found' });
      return res.json(user);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return res.status(500).json({ message: 'Failed to update profile' });
    }
  }
);

// List all users with optional search and simple status
router.get('/', optionalAuthMiddleware, async (req: AuthRequest, res) => {
  const { q } = req.query;
  let me: InstanceType<typeof User> | null = null;

  if (req.userId) {
    me = await User.findById(req.userId);
  }

  // Build filter
  const filter: any = {};
  if (me) {
    filter._id = { $ne: me.id };
  }

  if (typeof q === 'string' && q.trim()) {
    const regex = new RegExp(q.trim(), 'i');
    filter.$or = [
      { name: regex },
      { username: regex }
    ];
  }

  const friends = new Set(me?.friends.map((id) => id.toString()) || []);
  const requests = new Set(me?.friendRequests.map((id) => id.toString()) || []);

  const users = await User.find(filter)
    .select('name username profileImage isPrivate friends friendRequests')
    .sort({ createdAt: -1 }) // Newest users first or relevant sort
    .limit(50); // Limit results for performance

  const result = await Promise.all(users.map(async (u) => {
    const id = u.id;
    const isFriend = friends.has(id);
    const sentRequest = me ? u.friendRequests.some((rid) => rid.toString() === me!.id) : false;
    const incomingRequest = requests.has(id);

    // Get song count (public only for non-friends/strangers usually, but request said 'uploaded')
    // Let's count public songs for consistency with what they can perform searching on
    const songsCount = await Song.countDocuments({ owner: id, isPublic: true });

    return {
      id,
      name: u.name,
      username: u.username,
      profileImage: u.profileImage,
      isPrivate: u.isPrivate,
      isFriend,
      sentRequest,
      incomingRequest,
      songsCount
    };
  }));

  return res.json(result);
});

// Get my friends and pending requests
router.get('/friends', authMiddleware, async (req: AuthRequest, res) => {
  const me = await User.findById(req.userId)
    .populate('friends', 'name username email isPrivate profileImage')
    .populate('friendRequests', 'name username email isPrivate profileImage');

  if (!me) return res.status(404).json({ message: 'User not found' });

  return res.json({
    friends: me.friends,
    incomingRequests: me.friendRequests,
  });
});

// Send friend (follow) request
router.post('/request/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const { userId } = req.params;
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });
  if (userId === req.userId) {
    return res.status(400).json({ message: 'Cannot send request to yourself' });
  }

  const target = await User.findById(userId);
  if (!target) return res.status(404).json({ message: 'User not found' });

  const alreadyRequested = target.friendRequests.some((id) => id.toString() === req.userId);
  const alreadyFriend = target.friends.some((id) => id.toString() === req.userId);
  if (alreadyRequested || alreadyFriend) {
    return res.status(400).json({ message: 'Already requested or friends' });
  }

  target.friendRequests.push(req.userId as any);
  await target.save();

  return res.json({ message: 'Request sent' });
});

// Accept friend request (mutual friendship)
router.post('/request/:userId/accept', authMiddleware, async (req: AuthRequest, res) => {
  const { userId } = req.params;
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });

  const [me, other] = await Promise.all([
    User.findById(req.userId),
    User.findById(userId),
  ]);

  if (!me || !other) return res.status(404).json({ message: 'User not found' });

  // Remove from my incoming requests
  me.friendRequests = me.friendRequests.filter((id) => id.toString() !== other.id);

  const myFriends = new Set(me.friends.map((id) => id.toString()));
  const otherFriends = new Set(other.friends.map((id) => id.toString()));

  myFriends.add(other.id);
  otherFriends.add(me.id);

  me.friends = Array.from(myFriends) as any;
  other.friends = Array.from(otherFriends) as any;

  await Promise.all([me.save(), other.save()]);

  return res.json({ message: 'Request accepted' });
});

// Public profile for a given user, with privacy rules
router.get('/:userId/profile', optionalAuthMiddleware, async (req: AuthRequest, res) => {
  const { userId } = req.params;
  const viewerId = req.userId ? String(req.userId) : null;

  const target = await User.findById(userId);
  if (!target) return res.status(404).json({ message: 'User not found' });

  const isSelf = viewerId === String(target.id);
  const isFriend = viewerId ? target.friends.some((id) => id.toString() === viewerId) : false;

  const friendsCount = target.friends.length;

  let canSeeUploads = true;
  if (!isSelf && !isFriend && target.isPrivate) {
    canSeeUploads = false;
  }

  let uploads: typeof Song[] | any[] = [];
  if (!canSeeUploads) {
    uploads = [];
  } else if (isSelf || isFriend) {
    // Friends and self can see all songs (maybe? or just public + private? usually friends see everything or just public?)
    // Requirement "songs the have uploded". Usually private songs are for self only.
    // Let's assume friends can see public only, and self sees all.
    // Or actually, let's follow standard social: public is for everyone, private is for approved friends?
    // If "isPrivate" account usually implies content is private.
    // Let's return all songs if isSelf, otherwise only public songs.
    // UNLESS account is private, then friends can see 'public' marked songs?
    // Let's match the logic:
    if (isSelf) {
      uploads = await Song.find({ owner: target.id }).sort({ createdAt: -1 });
    } else {
      // If I am a friend, or it's a public account, I can see PUBLIC songs.
      // Private songs are usually strictly private or for specific sharing.
      // Let's assume standard "public" visibility for songs.
      uploads = await Song.find({ owner: target.id, isPublic: true }).sort({ createdAt: -1 });
    }
  } else {
    // public viewer (not friend, not self)
    // If account is private, they see nothing (handled by canSeeUploads=false above).
    // If account is public, they see public songs.
    uploads = await Song.find({ owner: target.id, isPublic: true }).sort({ createdAt: -1 });
  }

  // Get request status if logged in
  let connectionStatus: 'none' | 'friend' | 'sent' | 'received' | 'self' = 'none';
  if (isSelf) {
    connectionStatus = 'self';
  } else if (isFriend) {
    connectionStatus = 'friend';
  } else if (viewerId) {
    // Check requests
    if (target.friendRequests.some(id => id.toString() === viewerId)) {
      connectionStatus = 'sent';
    } else {
      // Check if they requested me (I need to check MY requests, but I don't have 'me' loaded efficiently here)
      // optimization: we can do a quick count/find on User or check if target is in MY requests.
      // Easier: just check target's friends/requests? No, incoming is in MY document.
      // Let's load 'me' if needed or do a count.
      const me = await User.findById(viewerId).select('friendRequests');
      if (me && me.friendRequests.some(id => id.toString() === target.id)) {
        connectionStatus = 'received';
      }
    }
  }

  return res.json({
    id: target.id,
    name: target.name,
    username: target.username,
    isPrivate: target.isPrivate,
    profileImage: target.profileImage,
    friendsCount,
    uploadsCount: uploads.length,
    connectionStatus, // Send this simplified status to frontend
    canSeeUploads,
    uploads,
  });
});

export default router;


