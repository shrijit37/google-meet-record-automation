import { Browser, BrowserContext, Page } from 'playwright';
import { MeetJoiner } from '../meet/meetJoiner.js';
import { RecordingHandler } from '../meet/recordingHandler.js';
import { StorageState } from './sessionManager.js';

/**
 * Represents a single meeting session with its own browser context.
 * Each session can join one meeting independently.
 */
export class MeetingSession {
    private context: BrowserContext;
    private page: Page;
    private meetJoiner: MeetJoiner;
    private recordingHandler: RecordingHandler;
    private _isActive: boolean = true;

    private constructor(
        context: BrowserContext,
        page: Page,
        meetJoiner: MeetJoiner,
        recordingHandler: RecordingHandler
    ) {
        this.context = context;
        this.page = page;
        this.meetJoiner = meetJoiner;
        this.recordingHandler = recordingHandler;
    }

    /**
     * Create a new meeting session from a shared browser
     */
    static async create(browser: Browser, storageState?: StorageState): Promise<MeetingSession> {
        // Create isolated context (shares browser, but separate cookies/storage)
        const contextOptions: Parameters<Browser['newContext']>[0] = {
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            permissions: ['camera', 'microphone'],
        };

        if (storageState) {
            contextOptions.storageState = storageState;
        }

        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();

        // Create session-specific handlers (not singletons)
        const meetJoiner = new MeetJoiner(page);
        const recordingHandler = new RecordingHandler(page);

        console.log('🆕 Created new meeting session');
        return new MeetingSession(context, page, meetJoiner, recordingHandler);
    }

    /**
     * Join a meeting
     */
    async joinMeeting(meetingUrl: string): Promise<boolean> {
        if (!this._isActive) {
            throw new Error('Session is no longer active');
        }
        return this.meetJoiner.joinMeeting(meetingUrl);
    }

    /**
     * Start recording
     */
    async startRecording(): Promise<boolean> {
        if (!this._isActive) {
            throw new Error('Session is no longer active');
        }
        return this.recordingHandler.startRecording();
    }

    /**
     * Stop recording
     */
    async stopRecording(): Promise<boolean> {
        if (!this._isActive) {
            throw new Error('Session is no longer active');
        }
        return this.recordingHandler.stopRecording();
    }

    /**
     * Leave the current meeting
     */
    async leaveMeeting(): Promise<boolean> {
        if (!this._isActive) {
            return true; // Already inactive
        }
        return this.meetJoiner.leaveMeeting();
    }

    /**
     * Check if currently in a meeting
     */
    async isInMeeting(): Promise<boolean> {
        if (!this._isActive) return false;
        return this.meetJoiner.isInMeeting();
    }

    /**
     * Check recording status
     */
    getIsRecording(): boolean {
        return this.recordingHandler.getIsRecording();
    }

    /**
     * Get the page (for advanced operations)
     */
    getPage(): Page {
        return this.page;
    }

    /**
     * Get the browser context (for saving session)
     */
    getContext(): BrowserContext {
        return this.context;
    }

    /**
     * Check if session is active
     */
    isActive(): boolean {
        return this._isActive;
    }

    /**
     * Cleanup and close the session
     */
    async cleanup(): Promise<void> {
        if (!this._isActive) return;

        console.log('🧹 Cleaning up meeting session...');
        this._isActive = false;

        try {
            // Try to leave meeting gracefully
            await this.meetJoiner.leaveMeeting();
        } catch (e) {
            // Ignore errors during cleanup
        }

        try {
            await this.page.close();
        } catch (e) {
            // Ignore
        }

        try {
            await this.context.close();
        } catch (e) {
            // Ignore
        }

        console.log('✅ Session cleaned up');
    }
}
