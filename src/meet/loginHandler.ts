import { Page } from 'playwright';
import { config } from '../config/config.js';
import { browserManager } from '../browser/browserManager.js';

export class LoginHandler {
    private page: Page | null = null;

    async initialize(): Promise<void> {
        this.page = await browserManager.getPage();
    }

    /**
     * Check if currently logged into Google
     */
    async isLoggedIn(): Promise<boolean> {
        return browserManager.isLoggedIn();
    }

    /**
     * Perform manual login - opens browser for user interaction
     * This is the recommended approach to avoid bot detection
     */
    async performManualLogin(): Promise<boolean> {
        if (!this.page) {
            throw new Error('LoginHandler not initialized');
        }

        console.log('🔑 Starting manual login process...');
        console.log('📌 Please log into your Google account in the browser window');
        console.log('⏳ You have 5 minutes to complete login...');

        // Navigate to Google login
        await this.page.goto('https://accounts.google.com/signin', {
            waitUntil: 'networkidle',
            timeout: config.pageLoadTimeout,
        });

        // Wait for user to complete login
        console.log('⏳ Waiting for login completion...');

        try {
            // Wait until we're redirected away from the signin page
            await this.page.waitForURL(
                (url) => {
                    const urlStr = url.toString();
                    // User has navigated away from signin - could be myaccount, or just google.com
                    const isNotSignin = !urlStr.includes('accounts.google.com/signin') &&
                        !urlStr.includes('accounts.google.com/v3/signin') &&
                        !urlStr.includes('accounts.google.com/ServiceLogin');
                    const isGoogleDomain = urlStr.includes('google.com');
                    return isGoogleDomain && isNotSignin;
                },
                { timeout: 300000 } // 5 minutes for manual login
            );

            console.log('🔄 Redirect detected, waiting for session to stabilize...');

            // Give extra time for cookies to be fully set
            await this.page.waitForTimeout(3000);

            // Navigate to myaccount to verify we're truly logged in
            await this.page.goto('https://myaccount.google.com/', {
                waitUntil: 'networkidle',
                timeout: config.pageLoadTimeout,
            });

            await this.page.waitForTimeout(2000);

            // Check if we're on the account page (not redirected back to login)
            const currentUrl = this.page.url();
            const isLoggedIn = currentUrl.includes('myaccount.google.com') &&
                !currentUrl.includes('signin') &&
                !currentUrl.includes('ServiceLogin');

            if (isLoggedIn) {
                console.log('✅ Login successful!');
                await browserManager.saveSession();
                return true;
            } else {
                console.log('❌ Login verification failed - was redirected to:', currentUrl);
                return false;
            }
        } catch (error) {
            console.error('❌ Login timeout or error:', error);
            return false;
        }
    }

    /**
     * Automated login using credentials from config
     * WARNING: High risk of bot detection by Google
     */
    async performAutomatedLogin(): Promise<boolean> {
        if (!this.page) {
            throw new Error('LoginHandler not initialized');
        }

        const { googleEmail, googlePassword } = config;

        if (!googleEmail || !googlePassword) {
            throw new Error('Google credentials not configured. Set GOOGLE_EMAIL and GOOGLE_PASSWORD in .env');
        }

        console.log('🤖 Starting automated login (high detection risk)...');

        try {
            // Navigate to Google login
            await this.page.goto('https://accounts.google.com/signin', {
                waitUntil: 'networkidle',
                timeout: config.pageLoadTimeout,
            });

            // Enter email with human-like typing
            await this.page.waitForSelector('input[type="email"]', { timeout: config.elementTimeout });
            await this.simulateHumanTyping(this.page, 'input[type="email"]', googleEmail);

            // Click Next
            await this.page.click('#identifierNext');
            await this.page.waitForTimeout(2000);

            // Enter password
            await this.page.waitForSelector('input[type="password"]', { timeout: config.elementTimeout });
            await this.simulateHumanTyping(this.page, 'input[type="password"]', googlePassword);

            // Click Next
            await this.page.click('#passwordNext');
            await this.page.waitForTimeout(3000);

            // Check for 2FA or other verification
            const url = this.page.url();
            if (url.includes('challenge') || url.includes('signin/v2/challenge')) {
                console.log('⚠️ 2FA or additional verification required. Please complete manually.');

                // Wait for user to complete verification
                await this.page.waitForURL(
                    (u) => !u.toString().includes('challenge'),
                    { timeout: 120000 } // 2 minutes for 2FA
                );
            }

            // Verify login
            const isLoggedIn = await this.isLoggedIn();

            if (isLoggedIn) {
                console.log('✅ Automated login successful!');
                await browserManager.saveSession();
                return true;
            } else {
                console.log('❌ Automated login failed');
                return false;
            }
        } catch (error) {
            console.error('❌ Automated login error:', error);
            return false;
        }
    }

    /**
     * Simulate human-like typing with random delays
     */
    private async simulateHumanTyping(page: Page, selector: string, text: string): Promise<void> {
        const element = await page.$(selector);
        if (!element) throw new Error(`Element not found: ${selector}`);

        await element.click();
        await page.waitForTimeout(500);

        for (const char of text) {
            await element.type(char, { delay: 50 + Math.random() * 100 });
        }
    }
}

export const loginHandler = new LoginHandler();
