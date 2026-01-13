import { Schema, model, Types, Document } from 'mongoose';

export interface IListenTogetherRequest extends Document {
    from: Types.ObjectId; // User who sent the request
    to: Types.ObjectId; // User who received the request
    status: 'pending' | 'accepted' | 'declined' | 'expired';
    sessionId?: Types.ObjectId; // Created when accepted
    expiresAt: Date;
}

const listenTogetherRequestSchema = new Schema<IListenTogetherRequest>(
    {
        from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined', 'expired'],
            default: 'pending'
        },
        sessionId: { type: Schema.Types.ObjectId, ref: 'ListenSession' },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        },
    },
    { timestamps: true }
);

// Index for quick lookups
listenTogetherRequestSchema.index({ to: 1, status: 1 });
listenTogetherRequestSchema.index({ from: 1, status: 1 });
listenTogetherRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ListenTogetherRequest = model<IListenTogetherRequest>(
    'ListenTogetherRequest',
    listenTogetherRequestSchema
);
