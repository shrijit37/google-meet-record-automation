import { Page } from 'playwright';
import { config } from '../config/config.js';
import { browserManager } from '../browser/browserManager.js';

export class MeetJoiner {
    private page: Page | null = null;

    async initialize(): Promise<void> {
        this.page = await browserManager.getPage();
    }

    /**
     * Join a Google Meet meeting
     */
    async joinMeeting(meetingUrl: string): Promise<boolean> {
        if (!this.page) {
            throw new Error('MeetJoiner not initialized');
        }

        console.log(`🚀 Joining meeting: ${meetingUrl}`);

        try {
            // Navigate to meeting URL
            await this.page.goto(meetingUrl, {
                waitUntil: 'networkidle',
                timeout: config.pageLoadTimeout,
            });

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
     * Handle the pre-join screen (turn off camera/mic, click join)
     */
    private async handlePreJoinScreen(): Promise<void> {
        if (!this.page) throw new Error('Page not initialized');

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
        if (!this.page) return;

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
        if (!this.page) return false;

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
        if (!this.page) return false;

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

export const meetJoiner = new MeetJoiner();
