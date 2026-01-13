import { Schema, model, Types, Document } from 'mongoose';

export interface IListenSession extends Document {
    host: Types.ObjectId; // User who created the session
    participants: Types.ObjectId[]; // Users in the session
    currentTrack?: {
        id: string;
        title: string;
        artist: string;
        uri: string;
        artwork?: string;
        duration?: number;
    };
    queue: Array<{
        id: string;
        title: string;
        artist: string;
        uri: string;
        artwork?: string;
        duration?: number;
    }>;
    playbackState: {
        position: number; // Current position in seconds
        isPlaying: boolean;
        updatedAt: Date;
    };
    isActive: boolean;
    endedAt?: Date;
}

const listenSessionSchema = new Schema<IListenSession>(
    {
        host: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        currentTrack: {
            type: {
                id: String,
                title: String,
                artist: String,
                uri: String,
                artwork: String,
                duration: Number,
            },
            required: false,
        },
        queue: [
            {
                id: String,
                title: String,
                artist: String,
                uri: String,
                artwork: String,
                duration: Number,
            },
        ],
        playbackState: {
            position: { type: Number, default: 0 },
            isPlaying: { type: Boolean, default: false },
            updatedAt: { type: Date, default: Date.now },
        },
        isActive: { type: Boolean, default: true },
        endedAt: { type: Date },
    },
    { timestamps: true }
);

// Indexes for efficient queries
listenSessionSchema.index({ host: 1, isActive: 1 });
listenSessionSchema.index({ participants: 1, isActive: 1 });

export const ListenSession = model<IListenSession>('ListenSession', listenSessionSchema);
