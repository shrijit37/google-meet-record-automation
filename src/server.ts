import express, { Request, Response } from 'express';
import { config } from './config/config.js';
import { jobQueue, MeetingJob } from './queue/jobQueue.js';
import { meetJoiner } from './meet/meetJoiner.js';
import { recordingHandler } from './meet/recordingHandler.js';
import { browserManager } from './browser/browserManager.js';
import { loginHandler } from './meet/loginHandler.js';

const app = express();
app.use(express.json());

// Initialize automation components
async function initializeAutomation(): Promise<void> {
    await browserManager.initialize();
    await loginHandler.initialize();
    await meetJoiner.initialize();
    await recordingHandler.initialize();

    // Check if logged in
    const isLoggedIn = await loginHandler.isLoggedIn();
    if (!isLoggedIn) {
        console.log('⚠️ Not logged in! Run "npm run login" first to authenticate.');
    } else {
        console.log('✅ Already logged in and ready to join meetings');
    }

    // Set up job processor
    jobQueue.setProcessor(async (job: MeetingJob) => {
        // Join the meeting
        const joined = await meetJoiner.joinMeeting(job.meetingUrl);
        if (!joined) {
            throw new Error('Failed to join meeting');
        }

        jobQueue.updateJobStatus(job.id, 'in-meeting');

        // Start recording if requested
        if (job.startRecording) {
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for meeting to stabilize
            const recordingStarted = await recordingHandler.startRecording();
            if (!recordingStarted) {
                console.log('⚠️ Could not start recording - continuing in meeting without recording');
            }
        }

        // Stay in the meeting - the job stays in "in-meeting" status
        // User can manually stop via API or the meeting will end naturally
    });
}

// API Routes

/**
 * Health check endpoint
 */
app.get('/api/status', (req: Request, res: Response) => {
    const queueStatus = jobQueue.getStatus();
    res.json({
        status: 'running',
        isProcessing: queueStatus.isProcessing,
        queueLength: queueStatus.queueLength,
        currentJob: queueStatus.currentJob
            ? {
                id: queueStatus.currentJob.id,
                meetingUrl: queueStatus.currentJob.meetingUrl,
                status: queueStatus.currentJob.status,
            }
            : null,
    });
});

/**
 * Join a meeting
 */
app.post('/api/join-meeting', async (req: Request, res: Response) => {
    const { meetingUrl, startRecording = true, scheduledTime, headless = true } = req.body;

    if (!meetingUrl) {
        res.status(400).json({ error: 'meetingUrl is required' });
        return;
    }

    // Validate meeting URL format
    if (!meetingUrl.includes('meet.google.com')) {
        res.status(400).json({ error: 'Invalid Google Meet URL' });
        return;
    }

    // Check if logged in
    const isLoggedIn = await loginHandler.isLoggedIn();
    if (!isLoggedIn) {
        res.status(401).json({
            error: 'Not logged in. Please run "npm run login" first to authenticate.',
        });
        return;
    }

    // Parse scheduled time if provided
    let scheduleDate: Date | undefined;
    if (scheduledTime) {
        scheduleDate = new Date(scheduledTime);
        if (isNaN(scheduleDate.getTime())) {
            res.status(400).json({ error: 'Invalid scheduledTime format' });
            return;
        }
    }

    // Reinitialize browser in headed mode if requested
    if (headless === false) {
        console.log('🖥️ Switching to headed mode (visible browser)...');
        await browserManager.close();
        await browserManager.initialize(false); // false = not headless
        await loginHandler.initialize();
        await meetJoiner.initialize();
        await recordingHandler.initialize();
    }

    // Add job to queue
    const job = jobQueue.addJob(meetingUrl, startRecording, scheduleDate);

    res.status(201).json({
        jobId: job.id,
        status: job.status,
        message: scheduleDate
            ? `Meeting scheduled for ${scheduleDate.toISOString()}`
            : 'Meeting queued for joining',
    });
});

/**
 * Get job status
 */
app.get('/api/job/:jobId', (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = jobQueue.getJob(jobId);

    if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
    }

    res.json(job);
});

/**
 * Stop current recording
 */
app.post('/api/stop-recording', async (req: Request, res: Response) => {
    try {
        const stopped = await recordingHandler.stopRecording();
        res.json({
            success: stopped,
            message: stopped ? 'Recording stopped' : 'Could not stop recording',
        });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to stop recording',
        });
    }
});

/**
 * Leave current meeting
 */
app.post('/api/leave-meeting', async (req: Request, res: Response) => {
    try {
        // Stop recording first if active
        if (recordingHandler.getIsRecording()) {
            await recordingHandler.stopRecording();
        }

        const left = await meetJoiner.leaveMeeting();
        res.json({
            success: left,
            message: left ? 'Left meeting' : 'Could not leave meeting',
        });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to leave meeting',
        });
    }
});

/**
 * Get all jobs
 */
app.get('/api/jobs', (req: Request, res: Response) => {
    const jobs = jobQueue.getAllJobs();
    res.json(jobs);
});

// Start server
export async function startServer(): Promise<void> {
    try {
        await initializeAutomation();

        app.listen(config.port, () => {
            console.log(`\n🚀 Google Meet Automation Server running on port ${config.port}`);
            console.log(`\n📚 Available endpoints:`);
            console.log(`   GET  /api/status         - Check bot status`);
            console.log(`   POST /api/join-meeting   - Join a meeting`);
            console.log(`   GET  /api/job/:jobId     - Get job status`);
            console.log(`   POST /api/stop-recording - Stop current recording`);
            console.log(`   POST /api/leave-meeting  - Leave current meeting`);
            console.log(`   GET  /api/jobs           - List all jobs`);
            console.log(`\n💡 Example usage:`);
            console.log(
                `   curl -X POST http://localhost:${config.port}/api/join-meeting \\`
            );
            console.log(`        -H "Content-Type: application/json" \\`);
            console.log(
                `        -d '{"meetingUrl": "https://meet.google.com/xxx-xxxx-xxx", "startRecording": true}'`
            );
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    await browserManager.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Shutting down...');
    await browserManager.close();
    process.exit(0);
});
