import { BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';

export interface StorageState {
    cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        expires: number;
        httpOnly: boolean;
        secure: boolean;
        sameSite: 'Strict' | 'Lax' | 'None';
    }>;
    origins: Array<{
        origin: string;
        localStorage: Array<{ name: string; value: string }>;
    }>;
}

export class SessionManager {
    private sessionDir: string;
    private sessionFile: string;

    constructor(sessionDir: string) {
        this.sessionDir = sessionDir;
        this.sessionFile = path.join(sessionDir, 'google-session.json');
    }

    async hasValidSession(): Promise<boolean> {
        if (!fs.existsSync(this.sessionFile)) {
            return false;
        }

        try {
            const sessionData = JSON.parse(fs.readFileSync(this.sessionFile, 'utf-8')) as StorageState;

            // Check if there are valid cookies
            if (!sessionData.cookies || sessionData.cookies.length === 0) {
                return false;
            }

            // Check if essential Google cookies exist and aren't expired
            const now = Date.now() / 1000;
            const googleCookies = sessionData.cookies.filter(
                (c) => c.domain.includes('google.com') && c.expires > now
            );

            // Look for authentication cookies
            const hasAuthCookies = googleCookies.some(
                (c) => c.name === 'SID' || c.name === 'SSID' || c.name === 'HSID'
            );

            return hasAuthCookies;
        } catch (error) {
            console.error('Error checking session validity:', error);
            return false;
        }
    }

    async saveSession(context: BrowserContext): Promise<void> {
        // Ensure directory exists
        if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }

        // Get storage state from context
        const storageState = await context.storageState();

        // Save to file
        fs.writeFileSync(this.sessionFile, JSON.stringify(storageState, null, 2));
        console.log(`✅ Session saved to ${this.sessionFile}`);
    }

    async loadSession(): Promise<StorageState> {
        if (!fs.existsSync(this.sessionFile)) {
            throw new Error('No saved session found');
        }

        const sessionData = JSON.parse(fs.readFileSync(this.sessionFile, 'utf-8')) as StorageState;
        return sessionData;
    }

    async clearSession(): Promise<void> {
        if (fs.existsSync(this.sessionFile)) {
            fs.unlinkSync(this.sessionFile);
            console.log('🗑️ Session cleared');
        }
    }
}
