import { Router } from 'express';
import multer from 'multer';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { Song } from '../models/Song';
import { User } from '../models/User';
import cloudinary from '../config/cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const deriveTitleFromFilename = (filename: string | undefined) => {
  const raw = (filename ?? '').trim();
  const withoutExt = raw.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'Untitled';
};

// Upload audio (and optional cover) to Cloudinary and create Song
router.post(
  '/upload',
  authMiddleware,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { title, category, isPublic } = req.body as {
        title?: string;
        category?: string;
        isPublic?: string;
      };

      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      const audioFile = files?.audio?.[0];
      if (!audioFile) {
        return res.status(400).json({ message: 'Audio file is required' });
      }

      const resolvedTitle = title?.trim() ? title.trim() : deriveTitleFromFilename(audioFile.originalname);

      const coverFile = files?.cover?.[0];

      const uploadToCloudinary = async (
        file: Express.Multer.File,
        folder: string,
        resourceType: 'image' | 'video' | 'auto'
      ) =>
        new Promise<{
          url: string;
          public_id: string;
        }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder,
              resource_type: resourceType,
            },
            (error, result) => {
              if (error || !result) return reject(error);
              resolve({ url: result.secure_url, public_id: result.public_id });
            }
          );

          stream.end(file.buffer);
        });

      const owner = await User.findById(req.userId);

      const [audioUpload, coverUpload] = await Promise.all([
        uploadToCloudinary(audioFile, 'audioly/audio', 'auto'),
        coverFile ? uploadToCloudinary(coverFile, 'audioly/covers', 'image') : null,
      ]);

      const song = await Song.create({
        owner: req.userId,
        title: resolvedTitle,
        category,
        audioUrl: audioUpload.url,
        audioPublicId: audioUpload.public_id,
        coverUrl: coverUpload?.url,
        coverPublicId: coverUpload?.public_id,
        // If account is private, force songs to be private
        isPublic: owner && owner.isPrivate ? false : isPublic ? isPublic === 'true' : true,
      });

      await User.findByIdAndUpdate(req.userId, {
        $addToSet: { uploadedSongs: song.id },
      });

      return res.status(201).json(song);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Explore: all public songs
router.get('/explore', async (_req, res) => {
  const songs = await Song.find({ isPublic: true }).populate('owner', 'name');
  return res.json(songs);
});

// Feed: own songs + friends' songs (public + private)
router.get('/feed', authMiddleware, async (req: AuthRequest, res) => {
  const me = await User.findById(req.userId);
  if (!me) return res.status(404).json({ message: 'User not found' });

  const ids = [me.id, ...me.friends.map((f) => f.toString())];

  const songs = await Song.find({ owner: { $in: ids } }).populate('owner', 'name');
  return res.json(songs);
});

// Current user's own uploads
router.get('/mine', authMiddleware, async (req: AuthRequest, res) => {
  const songs = await Song.find({ owner: req.userId }).sort({ createdAt: -1 });
  return res.json(songs);
});

// Update song (title, category, isPublic, cover)
router.put(
  '/:id',
  authMiddleware,
  (req, res, next) => {
    // Only use multer if content-type is multipart/form-data
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      return upload.fields([{ name: 'cover', maxCount: 1 }])(req, res, next);
    }
    return next();
  },
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { title, category, isPublic } = req.body as {
        title?: string;
        category?: string;
        isPublic?: string;
      };

      const song = await Song.findById(id);
      if (!song) {
        return res.status(404).json({ message: 'Song not found' });
      }

      // Check if user owns this song
      if (song.owner.toString() !== req.userId) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };
      const coverFile = files?.cover?.[0];

      let coverUrl = song.coverUrl;
      let coverPublicId = song.coverPublicId;

      // If new cover is uploaded, replace old one
      if (coverFile) {
        const uploadToCloudinary = async (
          file: Express.Multer.File,
          folder: string,
          resourceType: 'image' | 'video' | 'auto'
        ) =>
          new Promise<{
            url: string;
            public_id: string;
          }>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder,
                resource_type: resourceType,
              },
              (error, result) => {
                if (error || !result) return reject(error);
                resolve({ url: result.secure_url, public_id: result.public_id });
              }
            );
            stream.end(file.buffer);
          });

        // Delete old cover from Cloudinary if exists
        if (song.coverPublicId) {
          try {
            await cloudinary.uploader.destroy(song.coverPublicId);
          } catch {
            // ignore deletion errors
          }
        }

        const coverUpload = await uploadToCloudinary(coverFile, 'audioly/covers', 'image');
        coverUrl = coverUpload.url;
        coverPublicId = coverUpload.public_id;
      }

      // Update song
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (category !== undefined) updateData.category = category;
      if (isPublic !== undefined) {
        updateData.isPublic = typeof isPublic === 'string' ? isPublic === 'true' : isPublic;
      }
      updateData.coverUrl = coverUrl;
      updateData.coverPublicId = coverPublicId;

      const updatedSong = await Song.findByIdAndUpdate(id, updateData, { new: true });
      return res.json(updatedSong);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Increment play count (public endpoint, no auth required)
router.post('/:id/play', async (req, res) => {
  try {
    const { id } = req.params;
    const song = await Song.findByIdAndUpdate(
      id,
      { $inc: { playCount: 1 } },
      { new: true }
    );
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }
    return res.json({ playCount: song.playCount });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete song
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    // eslint-disable-next-line no-console
    console.log('DELETE /songs/:id called with id:', req.params.id);
    const { id } = req.params;

    const song = await Song.findById(id);
    if (!song) {
      return res.status(404).json({ message: 'Song not found' });
    }

    // Check if user owns this song
    if (song.owner.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Delete files from Cloudinary
    try {
      if (song.audioPublicId) {
        await cloudinary.uploader.destroy(song.audioPublicId, { resource_type: 'video' });
      }
      if (song.coverPublicId) {
        await cloudinary.uploader.destroy(song.coverPublicId);
      }
    } catch {
      // ignore deletion errors
    }

    // Remove from user's uploadedSongs
    await User.findByIdAndUpdate(req.userId, {
      $pull: { uploadedSongs: id },
    });

    // Delete song from database
    await Song.findByIdAndDelete(id);

    return res.json({ message: 'Song deleted successfully' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;


