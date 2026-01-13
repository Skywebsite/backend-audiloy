"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const db_1 = require("../src/config/db");
const auth_1 = __importDefault(require("../src/routes/auth"));
const users_1 = __importDefault(require("../src/routes/users"));
const songs_1 = __importDefault(require("../src/routes/songs"));
const app = (0, express_1.default)();
// Initialize database connection
(0, db_1.connectDb)().catch((err) => {
    console.error('Failed to connect to MongoDB', err);
});
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
// API routes
app.use('/auth', auth_1.default);
app.use('/users', users_1.default);
app.use('/songs', songs_1.default);
// Export the app for Vercel serverless
exports.default = app;
