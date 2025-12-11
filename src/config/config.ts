import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
    // Server
    port: parseInt(process.env.PORT || '3000', 10),

    // Google credentials
    googleEmail: process.env.GOOGLE_EMAIL || '',
    googlePassword: process.env.GOOGLE_PASSWORD || '',

    // Paths
    sessionDir: process.env.SESSION_DIR || path.join(process.cwd(), 'sessions'),
    recordingsDir: path.join(process.cwd(), 'recordings'),

    // Browser
    headless: process.env.HEADLESS !== 'false',

    // Timeouts (in milliseconds)
    pageLoadTimeout: 60000,
    elementTimeout: 30000,
    meetingJoinTimeout: 60000,
};

export type Config = typeof config;
