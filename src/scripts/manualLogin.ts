import { browserManager } from '../browser/browserManager.js';
import { loginHandler } from '../meet/loginHandler.js';

/**
 * Manual login script
 * Opens a browser window for the user to log into Google manually.
 * This avoids bot detection that occurs with automated login.
 */
async function manualLogin(): Promise<void> {
    console.log('🔐 Manual Login Script');
    console.log('='.repeat(40));
    console.log('');
    console.log('This will open a browser window where you can log into Google.');
    console.log('After logging in, the session will be saved for future use.');
    console.log('');

    try {
        // Initialize browser in headed mode (visible)
        await browserManager.initialize(false); // false = not headless
        await loginHandler.initialize();

        // Check if already logged in
        const alreadyLoggedIn = await loginHandler.isLoggedIn();

        if (alreadyLoggedIn) {
            console.log('✅ Already logged in! Session is valid.');
            console.log('');
            console.log('You can start the bot with: npm run dev');
        } else {
            // Perform manual login
            const success = await loginHandler.performManualLogin();

            if (success) {
                console.log('');
                console.log('✅ Login successful! Session saved.');
                console.log('');
                console.log('You can now start the bot with: npm run dev');
            } else {
                console.log('');
                console.log('❌ Login failed or was cancelled.');
                console.log('Please try again.');
            }
        }
    } catch (error) {
        console.error('❌ Error during login:', error);
    } finally {
        await browserManager.close();
        process.exit(0);
    }
}

manualLogin();
