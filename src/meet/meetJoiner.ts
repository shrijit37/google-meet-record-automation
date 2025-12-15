import { Page } from 'playwright';
import { config } from '../config/config.js';

export class MeetJoiner {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /**
     * Join a Google Meet meeting
     */
    async joinMeeting(meetingUrl: string): Promise<boolean> {

        console.log(`🚀 Joining meeting: ${meetingUrl}`);

        try {
            // Navigate to meeting URL
            await this.page.goto(meetingUrl, {
                waitUntil: 'networkidle',
                timeout: config.pageLoadTimeout,
            });

            // Check if we need to select an account
            await this.handleAccountPicker();

            // Handle various states
            await this.handlePreJoinScreen();

            console.log('✅ Successfully joined meeting');
            return true;
        } catch (error) {
            console.error('❌ Failed to join meeting:', error);
            return false;
        }
    }

    /**
     * Handle Google account picker if it appears
     */
    private async handleAccountPicker(): Promise<void> {
        console.log('🔍 Checking for account picker...');

        try {
            // Wait a bit for any redirects
            await this.page.waitForTimeout(2000);

            const url = this.page.url();

            // Check if we're on an account selection page
            if (url.includes('accounts.google.com') || url.includes('AccountChooser') || url.includes('signin')) {
                console.log('👤 Account picker detected, selecting account...');

                // Wait for page to fully load
                await this.page.waitForLoadState('networkidle');
                await this.page.waitForTimeout(1000);

                // Strategy 1: Click on account list item (the main clickable row)
                // This targets the Google account chooser list items
                const accountListSelectors = [
                    'li[data-authuser]', // List item with authuser
                    'div[data-authuser]', // Div with authuser  
                    '[data-identifier]', // Element with email identifier
                    'ul li', // Generic list items in the account list
                ];

                for (const selector of accountListSelectors) {
                    try {
                        const accounts = await this.page.$$(selector);
                        for (const account of accounts) {
                            const text = await account.textContent();
                            // Look for an account that has an email (contains @)
                            if (text && text.includes('@')) {
                                console.log(`🎯 Found account: ${text.substring(0, 50)}...`);
                                await account.click();
                                console.log('✅ Clicked account in picker');
                                await this.page.waitForTimeout(3000);
                                await this.page.waitForLoadState('networkidle');
                                // Check for password page after account selection
                                await this.handlePasswordEntry();
                                return;
                            }
                        }
                    } catch (e) {
                        // Try next selector
                    }
                }

                // Strategy 2: Click any element containing the email domain
                try {
                    const emailElement = this.page.locator('text=@').first();
                    if (await emailElement.isVisible({ timeout: 2000 })) {
                        // Get parent clickable element
                        const parent = emailElement.locator('xpath=ancestor::li | ancestor::div[@role="link"] | ancestor::a').first();
                        if (await parent.isVisible({ timeout: 1000 })) {
                            await parent.click();
                        } else {
                            await emailElement.click();
                        }
                        console.log('✅ Clicked email element');
                        await this.page.waitForTimeout(3000);
                        await this.page.waitForLoadState('networkidle');
                        // Check for password page
                        await this.handlePasswordEntry();
                        return;
                    }
                } catch (e) {
                    // Continue
                }

                // Strategy 3: Click using coordinates on first visible account row
                try {
                    const accountRows = this.page.locator('ul > li, div[role="listitem"]');
                    const firstRow = accountRows.first();
                    if (await firstRow.isVisible({ timeout: 2000 })) {
                        await firstRow.click();
                        console.log('✅ Clicked first account row');
                        await this.page.waitForTimeout(3000);
                        // Check for password page
                        await this.handlePasswordEntry();
                        return;
                    }
                } catch (e) {
                    // Continue
                }

                console.log('⚠️ Could not auto-select account from picker');
            }

            // Check if we landed on password page after account selection
            await this.handlePasswordEntry();
        } catch (e) {
            console.log('📝 No account picker detected, proceeding...');
        }
    }

    /**
     * Handle password entry page if Google requires re-authentication
     */
    private async handlePasswordEntry(): Promise<void> {
        try {
            await this.page.waitForTimeout(1000);
            const url = this.page.url();

            // Check if we're on a password entry page
            if (url.includes('accounts.google.com') && (url.includes('signin') || url.includes('challenge'))) {
                const passwordInput = await this.page.$('input[type="password"]');

                if (passwordInput && await passwordInput.isVisible()) {
                    console.log('🔐 Password page detected, entering password...');

                    // Use password from config or environment
                    const password = process.env.GOOGLE_PASSWORD || '';

                    if (!password) {
                        console.log('⚠️ No GOOGLE_PASSWORD set in environment');
                        return;
                    }

                    await passwordInput.click();
                    await passwordInput.fill(password);
                    await this.page.waitForTimeout(500);

                    // Click Next/Sign in button
                    const nextButton = await this.page.$('#passwordNext, button[type="submit"], [data-idom-class*="action"]');
                    if (nextButton) {
                        await nextButton.click();
                        console.log('✅ Submitted password');
                        await this.page.waitForTimeout(3000);
                        await this.page.waitForLoadState('networkidle');
                    }
                }
            }
        } catch (e) {
            console.log('📝 No password page or error:', e);
        }
    }

    /**
     * Handle the pre-join screen (turn off camera/mic, click join)
     */
    private async handlePreJoinScreen(): Promise<void> {


        console.log('📝 Handling pre-join screen...');

        // Wait for the join screen to load
        await this.page.waitForTimeout(3000);

        // Try to turn off camera if the button exists
        try {
            const cameraButton = await this.page.$('[aria-label*="camera" i], [data-is-muted="false"][aria-label*="camera" i]');
            if (cameraButton) {
                const isMuted = await cameraButton.getAttribute('data-is-muted');
                if (isMuted !== 'true') {
                    await cameraButton.click();
                    console.log('📷 Camera turned off');
                }
            }
        } catch (e) {
            console.log('📷 Camera button not found or already off');
        }

        // Try to turn off microphone if the button exists  
        try {
            const micButton = await this.page.$('[aria-label*="microphone" i], [data-is-muted="false"][aria-label*="microphone" i]');
            if (micButton) {
                const isMuted = await micButton.getAttribute('data-is-muted');
                if (isMuted !== 'true') {
                    await micButton.click();
                    console.log('🎤 Microphone turned off');
                }
            }
        } catch (e) {
            console.log('🎤 Microphone button not found or already off');
        }

        await this.page.waitForTimeout(1000);

        // Look for "Join now" or "Ask to join" button
        const joinButtonSelectors = [
            'button:has-text("Join now")',
            'button:has-text("Ask to join")',
            'button:has-text("Join")',
            '[data-idom-class*="join"] button',
            'button[jsname="Qx7uuf"]', // Common Google Meet join button
        ];

        let joinClicked = false;
        for (const selector of joinButtonSelectors) {
            try {
                const button = await this.page.$(selector);
                if (button && await button.isVisible()) {
                    await button.click();
                    console.log(`✅ Clicked join button: ${selector}`);
                    joinClicked = true;
                    break;
                }
            } catch (e) {
                // Try next selector
            }
        }

        if (!joinClicked) {
            // Fallback: try to find any button that looks like a join button
            const buttons = await this.page.$$('button');
            for (const button of buttons) {
                const text = await button.textContent();
                if (text && (text.toLowerCase().includes('join') || text.toLowerCase().includes('ask'))) {
                    await button.click();
                    console.log(`✅ Clicked button with text: ${text}`);
                    joinClicked = true;
                    break;
                }
            }
        }

        if (!joinClicked) {
            throw new Error('Could not find join button');
        }

        // Wait for the meeting to load
        await this.page.waitForTimeout(5000);

        // Handle any popups that appear after joining
        await this.dismissPopups();
    }

    /**
     * Dismiss any popups that appear after joining
     */
    private async dismissPopups(): Promise<void> {

        const dismissSelectors = [
            'button:has-text("Got it")',
            'button:has-text("Dismiss")',
            'button:has-text("Close")',
            'button:has-text("No thanks")',
            'button:has-text("Maybe later")',
            '[aria-label="Close"]',
        ];

        for (const selector of dismissSelectors) {
            try {
                const button = await this.page.$(selector);
                if (button && await button.isVisible()) {
                    await button.click();
                    console.log(`🔕 Dismissed popup: ${selector}`);
                    await this.page.waitForTimeout(500);
                }
            } catch (e) {
                // Ignore errors
            }
        }
    }

    /**
     * Check if currently in a meeting
     */
    async isInMeeting(): Promise<boolean> {

        try {
            const url = this.page.url();
            // Check if we're on a meet page and the meeting controls are visible
            const inMeetUrl = url.includes('meet.google.com') && !url.includes('lookup');

            if (!inMeetUrl) return false;

            // Check for meeting controls (hangup button, etc.)
            const hangupButton = await this.page.$('[aria-label*="Leave" i], [aria-label*="hang up" i]');
            return hangupButton !== null;
        } catch (e) {
            return false;
        }
    }

    /**
     * Leave the current meeting
     */
    async leaveMeeting(): Promise<boolean> {

        try {
            console.log('👋 Leaving meeting...');

            const leaveSelectors = [
                '[aria-label*="Leave" i]',
                '[aria-label*="hang up" i]',
                'button:has-text("Leave call")',
            ];

            for (const selector of leaveSelectors) {
                try {
                    const button = await this.page.$(selector);
                    if (button && await button.isVisible()) {
                        await button.click();
                        console.log('✅ Left meeting');
                        await this.page.waitForTimeout(2000);
                        return true;
                    }
                } catch (e) {
                    // Try next selector
                }
            }

            console.log('⚠️ Could not find leave button');
            return false;
        } catch (error) {
            console.error('❌ Error leaving meeting:', error);
            return false;
        }
    }
}

// Note: Singleton removed - create instances via MeetingSession
