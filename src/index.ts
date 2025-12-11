import { startServer } from './server.js';

// Main entry point
async function main(): Promise<void> {
    console.log('🤖 Google Meet Automation Bot');
    console.log('='.repeat(40));

    await startServer();
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
