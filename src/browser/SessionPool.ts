import { Browser, chromium } from 'playwright';
import { config } from '../config/config.js';
import { SessionManager, StorageState } from './sessionManager.js';
import { MeetingSession } from './MeetingSession.js';
import fs from 'fs';
import path from 'path';

/**
 * Manages a pool of MeetingSession instances for concurrent meeting support.
 * Maintains a single shared browser with multiple isolated contexts.
 */
export class SessionPool {
    private browser: Browser | null = null;
    private activeSessions: Map<string, MeetingSession> = new Map();
    private sessionManager: SessionManager;
    private storageState: StorageState | null = null;
    private headless: boolean;

    constructor() {
        this.sessionManager = new SessionManager(config.sessionDir);
        this.headless = config.headless;
    }

    /**
     * Initialize the session pool (start browser, load session)
     */
    async initialize(headless: boolean = this.headless): Promise<void> {
        console.log('🚀 Initializing session pool...');
        this.headless = headless;

        // Ensure session directory exists
        if (!fs.existsSync(config.sessionDir)) {
            fs.mkdirSync(config.sessionDir, { recursive: true });
        }

        // Launch shared browser
        this.browser = await chromium.launch({
            headless: this.headless,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
            ],
        });

        // Load session if available
        if (await this.sessionManager.hasValidSession()) {
            console.log('📦 Loading saved session for pool...');
            this.storageState = await this.sessionManager.loadSession();
        } else {
            console.log('⚠️ No valid session found. Sessions will start unauthenticated.');
        }

        console.log(`✅ Session pool initialized (max concurrent: ${config.maxConcurrentSessions})`);
    }

    /**
     * Acquire a new session for a job
     * Returns null if max concurrent limit is reached
     */
    async acquireSession(jobId: string): Promise<MeetingSession | null> {
        if (!this.browser) {
            throw new Error('Session pool not initialized');
        }

        // Check if already have a session for this job
        if (this.activeSessions.has(jobId)) {
            console.log(`📌 Returning existing session for job ${jobId}`);
            return this.activeSessions.get(jobId)!;
        }

        // Check concurrent limit
        if (this.activeSessions.size >= config.maxConcurrentSessions) {
            console.log(`⏳ Max concurrent sessions (${config.maxConcurrentSessions}) reached. Job ${jobId} must wait.`);
            return null;
        }

        // Create new session
        console.log(`🆕 Acquiring session for job ${jobId} (active: ${this.activeSessions.size + 1}/${config.maxConcurrentSessions})`);
        const session = await MeetingSession.create(this.browser, this.storageState || undefined);
        this.activeSessions.set(jobId, session);

        return session;
    }

    /**
     * Release a session when job completes
     */
    async releaseSession(jobId: string): Promise<void> {
        const session = this.activeSessions.get(jobId);
        if (!session) {
            console.log(`⚠️ No session found for job ${jobId}`);
            return;
        }

        console.log(`🔓 Releasing session for job ${jobId}`);
        await session.cleanup();
        this.activeSessions.delete(jobId);
        console.log(`📊 Active sessions: ${this.activeSessions.size}/${config.maxConcurrentSessions}`);
    }

    /**
     * Get session for a specific job
     */
    getSession(jobId: string): MeetingSession | undefined {
        return this.activeSessions.get(jobId);
    }

    /**
     * Get count of active sessions
     */
    getActiveCount(): number {
        return this.activeSessions.size;
    }

    /**
     * Get max concurrent limit
     */
    getMaxConcurrent(): number {
        return config.maxConcurrentSessions;
    }

    /**
     * Check if a session slot is available
     */
    hasAvailableSlot(): boolean {
        return this.activeSessions.size < config.maxConcurrentSessions;
    }

    /**
     * Check if logged in (by testing session validity)
     */
    async isLoggedIn(): Promise<boolean> {
        return this.sessionManager.hasValidSession();
    }

    /**
     * Get all active job IDs
     */
    getActiveJobIds(): string[] {
        return Array.from(this.activeSessions.keys());
    }

    /**
     * Close all sessions and the browser
     */
    async close(): Promise<void> {
        console.log('🛑 Closing session pool...');

        // Cleanup all active sessions
        for (const [jobId, session] of this.activeSessions) {
            console.log(`  ↳ Cleaning up session for job ${jobId}`);
            await session.cleanup();
        }
        this.activeSessions.clear();

        // Close browser
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }

        console.log('✅ Session pool closed');
    }

    /**
     * Reinitialize with different headless setting
     */
    async reinitialize(headless: boolean): Promise<void> {
        await this.close();
        await this.initialize(headless);
    }
}

// Export singleton instance
export const sessionPool = new SessionPool();
