import { Page } from 'playwright';

export class RecordingHandler {
    private page: Page;
    private isRecording: boolean = false;

    constructor(page: Page) {
        this.page = page;
    }

    /**
     * Start recording the current meeting
     */
    async startRecording(): Promise<boolean> {

        if (this.isRecording) {
            console.log('⚠️ Already recording');
            return true;
        }

        console.log('🎬 Starting recording...');

        try {
            // Click the "More options" button (three dots menu)
            await this.openMoreOptionsMenu();

            await this.page.waitForTimeout(2000); // Wait longer for menu animation

            // Debug: Log all menu items to see what's available
            console.log('🔍 Searching for recording option in menu...');

            // Try to find and click "Record" option using multiple strategies
            let recordClicked = false;

            // Strategy 1: Look for menu items containing "Record" text
            const menuItems = await this.page.$$('[role="menuitem"], [role="option"], li, [data-menu-item]');
            console.log(`📋 Found ${menuItems.length} menu items`);

            for (const item of menuItems) {
                try {
                    const text = await item.textContent();
                    if (text && (text.toLowerCase().includes('record') || text.toLowerCase().includes('recording'))) {
                        console.log(`🎯 Found menu item with text: "${text.trim()}"`);
                        if (await item.isVisible()) {
                            await item.click();
                            recordClicked = true;
                            console.log('✅ Clicked recording option');
                            break;
                        }
                    }
                } catch (e) {
                    // Continue checking other items
                }
            }

            // Strategy 2: Use locator with text matching
            if (!recordClicked) {
                console.log('🔄 Trying text-based locator...');
                try {
                    const recordButton = this.page.locator('text=/Record/i').first();
                    if (await recordButton.isVisible({ timeout: 2000 })) {
                        await recordButton.click();
                        recordClicked = true;
                        console.log('✅ Clicked recording option via text locator');
                    }
                } catch (e) {
                    // Continue to next strategy
                }
            }

            // Strategy 3: Look for Activities panel button first (Google Meet's new UI)
            if (!recordClicked) {
                console.log('🔄 Trying Activities panel approach...');
                await this.page.keyboard.press('Escape'); // Close current menu
                await this.page.waitForTimeout(500);

                try {
                    // Look for Activities button
                    const activitiesBtn = await this.page.$('[aria-label*="Activities" i], [data-tooltip*="Activities" i]');
                    if (activitiesBtn && await activitiesBtn.isVisible()) {
                        await activitiesBtn.click();
                        console.log('📋 Opened Activities panel');
                        await this.page.waitForTimeout(1500);

                        // Look for Recording option in Activities
                        const recordingOption = this.page.locator('text=/Recording/i').first();
                        if (await recordingOption.isVisible({ timeout: 2000 })) {
                            await recordingOption.click();
                            recordClicked = true;
                            console.log('✅ Clicked Recording in Activities');
                        }
                    }
                } catch (e) {
                    // Continue
                }
            }

            if (!recordClicked) {
                // Close the menu if we couldn't find the record option
                await this.page.keyboard.press('Escape');
                console.log('❌ Could not find "Record" option.');
                console.log('💡 Tips:');
                console.log('   - Make sure you have Google Workspace with recording enabled');
                console.log('   - You may need to be the meeting host');
                console.log('   - Try clicking "Activities" → "Recording" manually in the Meet UI');
                return false;
            }

            // Handle consent dialog if it appears
            await this.handleRecordingConsent();

            // Wait for recording to start
            await this.page.waitForTimeout(3000);

            // Verify recording started by checking for recording indicator
            const isRecordingNow = await this.checkRecordingStatus();

            if (isRecordingNow) {
                this.isRecording = true;
                console.log('✅ Recording started successfully');
                return true;
            } else {
                console.log('⚠️ Recording may have started but could not verify');
                this.isRecording = true; // Assume it started
                return true;
            }
        } catch (error) {
            console.error('❌ Failed to start recording:', error);
            return false;
        }
    }

    /**
     * Stop the current recording
     */
    async stopRecording(): Promise<boolean> {

        if (!this.isRecording) {
            console.log('⚠️ Not currently recording');
            return true;
        }

        console.log('🛑 Stopping recording...');

        try {
            // Click the "More options" button
            await this.openMoreOptionsMenu();

            await this.page.waitForTimeout(1000);

            // Look for "Stop recording" option
            const stopSelectors = [
                'li:has-text("Stop recording")',
                '[role="menuitem"]:has-text("Stop recording")',
                'span:has-text("Stop recording")',
                'div:has-text("Stop recording")',
            ];

            let stopClicked = false;
            for (const selector of stopSelectors) {
                try {
                    const item = await this.page.$(selector);
                    if (item && await item.isVisible()) {
                        await item.click();
                        stopClicked = true;
                        console.log('✅ Clicked "Stop recording" option');
                        break;
                    }
                } catch (e) {
                    // Try next selector
                }
            }

            if (!stopClicked) {
                await this.page.keyboard.press('Escape');
                console.log('⚠️ Could not find "Stop recording" option');
                return false;
            }

            // Handle confirmation if needed
            await this.handleStopConfirmation();

            this.isRecording = false;
            console.log('✅ Recording stopped');
            return true;
        } catch (error) {
            console.error('❌ Failed to stop recording:', error);
            return false;
        }
    }

    /**
     * Open the "More options" menu
     */
    private async openMoreOptionsMenu(): Promise<void> {

        const menuSelectors = [
            '[aria-label="More options"]',
            '[aria-label="More actions"]',
            'button[aria-label*="more" i]',
            '[data-tooltip*="More" i]',
        ];

        for (const selector of menuSelectors) {
            try {
                const button = await this.page.$(selector);
                if (button && await button.isVisible()) {
                    await button.click();
                    console.log('📋 Opened more options menu');
                    return;
                }
            } catch (e) {
                // Try next selector
            }
        }

        // Fallback: try keyboard shortcut
        console.log('⌨️ Trying keyboard shortcut for menu...');
        await this.page.keyboard.press('Meta+e'); // Mac
    }

    /**
     * Handle recording consent dialog ("Make sure that everyone is ready")
     */
    private async handleRecordingConsent(): Promise<void> {

        console.log('🔍 Looking for recording consent dialog or Start button...');

        try {
            // Wait for the dialog/panel to appear
            await this.page.waitForTimeout(2000);

            // First, dismiss any Gemini/AI popups that might be overlaying
            await this.dismissOverlayPopups();
            await this.page.waitForTimeout(500);

            // Strategy 0: Look for the Recording panel's Start button (when Manage recording was clicked)
            // This shows up as a panel on the right with a blue "Start recording" button
            console.log('🔄 Strategy 0: Looking for Start recording button in panel...');
            const panelStartSelectors = [
                'button:has-text("Start recording")',
                '[role="button"]:has-text("Start recording")',
                'button[data-mdc-dialog-action="confirm"]',
                'button.mdc-button--unelevated', // Material Design filled button
            ];

            let clickedStartRecording = false;
            for (const selector of panelStartSelectors) {
                try {
                    const btn = await this.page.$(selector);
                    if (btn && await btn.isVisible()) {
                        console.log(`🎯 Found Start recording button: ${selector}`);
                        await btn.click({ force: true });
                        console.log('✅ Clicked Start recording button');
                        clickedStartRecording = true;
                        await this.page.waitForTimeout(2000); // Wait for consent dialog to appear
                        break;
                    }
                } catch (e) {
                    // Try next
                }
            }

            // Also try locator-based approach for the panel
            if (!clickedStartRecording) {
                try {
                    const startRecBtn = this.page.locator('button', { hasText: /^Start recording$/i }).first();
                    if (await startRecBtn.isVisible({ timeout: 1000 })) {
                        await startRecBtn.click({ force: true });
                        console.log('✅ Clicked Start recording via locator');
                        clickedStartRecording = true;
                        await this.page.waitForTimeout(2000);
                    }
                } catch (e) {
                    // Continue
                }
            }

            // Check if the consent dialog is visible
            const dialogText = await this.page.locator('text=/Make sure that everyone is ready/i').isVisible({ timeout: 3000 }).catch(() => false);
            if (dialogText) {
                console.log('📋 Found consent dialog, looking for Start button...');
            }

            // Strategy 1: Force click on Start button
            console.log('🔄 Strategy 1: Looking for Start button with force click...');
            const startButtonSelectors = [
                'button:has-text("Start"):not(:has-text("Cancel"))',
                '[role="button"]:has-text("Start")',
            ];

            for (const selector of startButtonSelectors) {
                try {
                    const buttons = await this.page.$$(selector);
                    for (const button of buttons) {
                        if (await button.isVisible()) {
                            const text = await button.textContent();
                            if (text && text.trim().toLowerCase() === 'start') {
                                console.log(`🎯 Found Start button`);
                                await button.click({ force: true });
                                console.log('✅ Force-clicked Start button');
                                await this.page.waitForTimeout(1500);
                                return;
                            }
                        }
                    }
                } catch (e) {
                    // Try next
                }
            }

            // Strategy 2: Find all clickable elements with exact "Start" text
            console.log('🔄 Strategy 2: Scanning all elements...');
            const clickableElements = await this.page.$$('button, [role="button"], span[jsname], div[jsaction]');

            for (const el of clickableElements) {
                try {
                    const text = await el.textContent();
                    const isVisible = await el.isVisible();
                    if (isVisible && text && text.trim() === 'Start') {
                        console.log('🎯 Found element with exact "Start" text');
                        await el.click({ force: true });
                        console.log('✅ Force-clicked Start element');
                        await this.page.waitForTimeout(1500);
                        return;
                    }
                } catch (e) {
                    // Continue
                }
            }

            // Strategy 3: Use bounding box click on visible Start text
            console.log('🔄 Strategy 3: Trying bounding box click...');
            try {
                const startLocator = this.page.locator('text="Start"').last();
                if (await startLocator.isVisible({ timeout: 2000 })) {
                    const box = await startLocator.boundingBox();
                    if (box) {
                        await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                        console.log('✅ Clicked Start using coordinates');
                        await this.page.waitForTimeout(1500);
                        return;
                    }
                }
            } catch (e) {
                console.log('⚠️ Bounding box click failed');
            }

            // Strategy 4: Keyboard navigation
            console.log('🔄 Strategy 4: Trying keyboard navigation...');
            try {
                await this.page.keyboard.press('Tab');
                await this.page.waitForTimeout(200);
                await this.page.keyboard.press('Tab');
                await this.page.waitForTimeout(200);
                await this.page.keyboard.press('Enter');
                console.log('✅ Pressed Enter after Tab navigation');
                await this.page.waitForTimeout(1500);
                return;
            } catch (e) {
                // Continue
            }

            console.log('⚠️ Could not click consent dialog Start button');
        } catch (e) {
            console.log('⚠️ Error handling consent dialog:', e);
        }
    }

    /**
     * Dismiss any overlay popups (Gemini, tooltips, etc.)
     */
    private async dismissOverlayPopups(): Promise<void> {

        try {
            // Look for "Got it" buttons (Gemini popup)
            const dismissSelectors = [
                'button:has-text("Got it")',
                '[role="button"]:has-text("Got it")',
                'button:has-text("Dismiss")',
                'button:has-text("No thanks")',
            ];

            for (const selector of dismissSelectors) {
                try {
                    const btn = await this.page.$(selector);
                    if (btn && await btn.isVisible()) {
                        await btn.click();
                        console.log('🔕 Dismissed overlay popup');
                        await this.page.waitForTimeout(300);
                    }
                } catch (e) {
                    // Continue
                }
            }
        } catch (e) {
            // No popups to dismiss
        }
    }

    /**
     * Handle stop recording confirmation
     */
    private async handleStopConfirmation(): Promise<void> {

        try {
            await this.page.waitForTimeout(1000);

            const confirmSelectors = [
                'button:has-text("Stop recording")',
                'button:has-text("Stop")',
                'button:has-text("Yes")',
                'button:has-text("Confirm")',
            ];

            for (const selector of confirmSelectors) {
                try {
                    const button = await this.page.$(selector);
                    if (button && await button.isVisible()) {
                        await button.click();
                        console.log('✅ Confirmed stop recording');
                        return;
                    }
                } catch (e) {
                    // Try next
                }
            }
        } catch (e) {
            // No confirmation dialog
        }
    }

    /**
     * Check if recording is currently active
     */
    async checkRecordingStatus(): Promise<boolean> {

        try {
            // Look for recording indicator (usually a red dot or "REC" text)
            const recordingIndicators = [
                '[aria-label*="Recording" i]',
                '[data-recording="true"]',
                '.recording-indicator',
                'span:has-text("REC")',
            ];

            for (const selector of recordingIndicators) {
                const indicator = await this.page.$(selector);
                if (indicator && await indicator.isVisible()) {
                    return true;
                }
            }

            return false;
        } catch (e) {
            return false;
        }
    }

    /**
     * Get current recording state
     */
    getIsRecording(): boolean {
        return this.isRecording;
    }
}

// Note: Singleton removed - create instances via MeetingSession
