import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config/config.js';
import { SessionManager } from './sessionManager.js';
import path from 'path';
import fs from 'fs';

export class BrowserManager {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private sessionManager: SessionManager;

    constructor() {
        this.sessionManager = new SessionManager(config.sessionDir);
    }

    async initialize(headless: boolean = config.headless): Promise<void> {
        console.log('🚀 Initializing browser...');

        // Ensure session directory exists
        if (!fs.existsSync(config.sessionDir)) {
            fs.mkdirSync(config.sessionDir, { recursive: true });
        }

        // Launch browser with persistent context
        this.browser = await chromium.launch({
            headless,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--use-fake-ui-for-media-stream', // Auto-accept camera/mic permissions
                '--use-fake-device-for-media-stream', // Use fake media devices
            ],
        });

        // Create context with saved session if available
        const sessionPath = path.join(config.sessionDir, 'google-session.json');
        const hasSession = await this.sessionManager.hasValidSession();

        if (hasSession) {
            console.log('📦 Loading saved session...');
            const storageState = await this.sessionManager.loadSession();
            this.context = await this.browser.newContext({
                storageState,
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                permissions: ['camera', 'microphone'],
            });
        } else {
            console.log('🆕 Creating new browser context...');
            this.context = await this.browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                permissions: ['camera', 'microphone'],
            });
        }

        this.page = await this.context.newPage();
        console.log('✅ Browser initialized');
    }

    async getPage(): Promise<Page> {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }
        return this.page;
    }

    async getContext(): Promise<BrowserContext> {
        if (!this.context) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }
        return this.context;
    }

    async saveSession(): Promise<void> {
        if (!this.context) {
            throw new Error('No browser context to save');
        }
        await this.sessionManager.saveSession(this.context);
        console.log('💾 Session saved');
    }

    async isLoggedIn(): Promise<boolean> {
        const page = await this.getPage();

        try {
            // Navigate to Google account page to check login status
            await page.goto('https://myaccount.google.com/', {
                waitUntil: 'networkidle',
                timeout: config.pageLoadTimeout
            });

            // Check if we're on the login page (not logged in) or account page (logged in)
            const url = page.url();
            const isLoggedIn = url.includes('myaccount.google.com') && !url.includes('signin');

            console.log(`🔐 Login status: ${isLoggedIn ? 'Logged in' : 'Not logged in'}`);
            return isLoggedIn;
        } catch (error) {
            console.error('Error checking login status:', error);
            return false;
        }
    }

    async close(): Promise<void> {
        if (this.page) {
            await this.page.close();
            this.page = null;
        }
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        console.log('🛑 Browser closed');
    }
}

export const browserManager = new BrowserManager();
