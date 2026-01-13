import { Schema, model, Types, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  username: string;
  password: string;
  bio?: string;
  isPrivate: boolean;
  profileImage: {
    url: string;
    publicId: string;
  };
  uploadedSongs: Types.ObjectId[];
  friends: Types.ObjectId[];
  friendRequests: Types.ObjectId[];
  listenTogetherRequests: Types.ObjectId[]; // Incoming listen together requests
  activeListenSession?: Types.ObjectId; // Current active session (if any)
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    bio: { type: String, default: '' },
    isPrivate: { type: Boolean, default: false },
    profileImage: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    uploadedSongs: [{ type: Types.ObjectId, ref: 'Song' }],
    friends: [{ type: Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: Types.ObjectId, ref: 'User' }],
    listenTogetherRequests: [{ type: Types.ObjectId, ref: 'ListenTogetherRequest' }],
    activeListenSession: { type: Types.ObjectId, ref: 'ListenSession' },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);


