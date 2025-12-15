import express, { Request, Response } from 'express';
import { config } from './config/config.js';
import { jobQueue, MeetingJob } from './queue/jobQueue.js';
import { sessionPool } from './browser/SessionPool.js';

const app = express();
app.use(express.json());

// Initialize automation components
async function initializeAutomation(): Promise<void> {
    await sessionPool.initialize();

    // Check if logged in
    const isLoggedIn = await sessionPool.isLoggedIn();
    if (!isLoggedIn) {
        console.log('⚠️ Not logged in! Run "npm run login" first to authenticate.');
    } else {
        console.log('✅ Session loaded - ready to join meetings');
    }

    // Set up job processor for concurrent processing
    jobQueue.setProcessor(async (job: MeetingJob) => {
        // Acquire a session from the pool
        const session = await sessionPool.acquireSession(job.id);
        if (!session) {
            throw new Error('No session slot available');
        }

        try {
            // Join the meeting
            const joined = await session.joinMeeting(job.meetingUrl);
            if (!joined) {
                throw new Error('Failed to join meeting');
            }

            // Save session after successful join (persists login cookies)
            await sessionPool.saveSessionFromContext(session.getContext());

            jobQueue.updateJobStatus(job.id, 'in-meeting');

            // Start recording if requested
            if (job.startRecording) {
                await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for meeting to stabilize
                const recordingStarted = await session.startRecording();
                if (!recordingStarted) {
                    console.log(`⚠️ Job ${job.id}: Could not start recording - continuing without recording`);
                }
            }

            // Job stays in "in-meeting" status
            // Session remains active until user calls leave-meeting API or meeting ends
        } catch (error) {
            // Release session on error
            await sessionPool.releaseSession(job.id);
            throw error;
        }
    });
}

// API Routes

/**
 * Health check endpoint - shows concurrent status
 */
app.get('/api/status', (req: Request, res: Response) => {
    const queueStatus = jobQueue.getStatus();
    res.json({
        status: 'running',
        concurrent: {
            active: queueStatus.activeCount,
            max: queueStatus.maxConcurrent,
        },
        queuedJobs: queueStatus.queueLength,
        activeJobs: queueStatus.activeJobs,
    });
});

/**
 * Join a meeting (concurrent support)
 */
app.post('/api/join-meeting', async (req: Request, res: Response) => {
    const { meetingUrl, startRecording = true, scheduledTime, headless } = req.body;

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
    const isLoggedIn = await sessionPool.isLoggedIn();
    if (!isLoggedIn) {
        res.status(401).json({
            error: 'Not logged in. Please run "npm run login" first to authenticate.',
        });
        return;
    }

    // Reinitialize pool if headless mode is explicitly specified and differs from current
    if (headless !== undefined) {
        const currentHeadless = sessionPool.isHeadless();
        if (headless !== currentHeadless) {
            if (headless) {
                console.log('🤖 Switching to headless mode...');
            } else {
                console.log('🖥️ Switching to headed mode (visible browser)...');
            }
            await sessionPool.reinitialize(headless);
        }
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

    // Add job to queue (will be processed concurrently if slots available)
    const job = jobQueue.addJob(meetingUrl, startRecording, scheduleDate);

    res.status(201).json({
        jobId: job.id,
        status: job.status,
        message: scheduleDate
            ? `Meeting scheduled for ${scheduleDate.toISOString()}`
            : 'Meeting queued for joining',
        concurrent: {
            active: sessionPool.getActiveCount(),
            max: sessionPool.getMaxConcurrent(),
        },
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
 * Stop recording for a specific job
 */
app.post('/api/stop-recording/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const session = sessionPool.getSession(jobId);

    if (!session) {
        res.status(404).json({ error: 'No active session for this job' });
        return;
    }

    try {
        const stopped = await session.stopRecording();
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
 * Leave meeting for a specific job
 */
app.post('/api/leave-meeting/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const session = sessionPool.getSession(jobId);

    if (!session) {
        res.status(404).json({ error: 'No active session for this job' });
        return;
    }

    try {
        // Stop recording first if active
        if (session.getIsRecording()) {
            await session.stopRecording();
        }

        const left = await session.leaveMeeting();

        // Release session and complete job
        await sessionPool.releaseSession(jobId);
        jobQueue.completeJob(jobId);

        res.json({
            success: left,
            message: left ? 'Left meeting and released session' : 'Could not leave meeting',
        });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to leave meeting',
        });
    }
});

/**
 * Legacy: Leave all meetings (for backwards compatibility)
 */
app.post('/api/leave-meeting', async (req: Request, res: Response) => {
    const activeJobIds = sessionPool.getActiveJobIds();

    if (activeJobIds.length === 0) {
        res.json({ success: true, message: 'No active meetings to leave' });
        return;
    }

    const results: { jobId: string; success: boolean }[] = [];

    for (const jobId of activeJobIds) {
        const session = sessionPool.getSession(jobId);
        if (session) {
            try {
                if (session.getIsRecording()) {
                    await session.stopRecording();
                }
                await session.leaveMeeting();
                await sessionPool.releaseSession(jobId);
                jobQueue.completeJob(jobId);
                results.push({ jobId, success: true });
            } catch (e) {
                results.push({ jobId, success: false });
            }
        }
    }

    res.json({
        success: results.every((r) => r.success),
        message: `Left ${results.filter((r) => r.success).length}/${results.length} meetings`,
        details: results,
    });
});

/**
 * Legacy: Stop recording for current/first active job
 */
app.post('/api/stop-recording', async (req: Request, res: Response) => {
    const activeJobIds = sessionPool.getActiveJobIds();

    if (activeJobIds.length === 0) {
        res.status(404).json({ error: 'No active sessions' });
        return;
    }

    // Stop first active session's recording
    const session = sessionPool.getSession(activeJobIds[0]);
    if (!session) {
        res.status(404).json({ error: 'No active session found' });
        return;
    }

    try {
        const stopped = await session.stopRecording();
        res.json({
            success: stopped,
            message: stopped ? 'Recording stopped' : 'Could not stop recording',
            jobId: activeJobIds[0],
        });
    } catch (error) {
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to stop recording',
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
            console.log(`\n📊 Concurrent meeting support: max ${config.maxConcurrentSessions} sessions`);
            console.log(`\n📚 Available endpoints:`);
            console.log(`   GET  /api/status              - Check bot status (shows concurrent info)`);
            console.log(`   POST /api/join-meeting        - Join a meeting (concurrent)`);
            console.log(`   GET  /api/job/:jobId          - Get job status`);
            console.log(`   POST /api/stop-recording/:id  - Stop recording for specific job`);
            console.log(`   POST /api/leave-meeting/:id   - Leave specific meeting`);
            console.log(`   GET  /api/jobs                - List all jobs`);
            console.log(`\n💡 Example - Join 2 meetings concurrently:`);
            console.log(`   curl -X POST http://localhost:${config.port}/api/join-meeting \\`);
            console.log(`        -H "Content-Type: application/json" \\`);
            console.log(`        -d '{"meetingUrl": "https://meet.google.com/xxx-xxxx-xxx"}'`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    jobQueue.clearTimers();
    await sessionPool.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Shutting down...');
    jobQueue.clearTimers();
    await sessionPool.close();
    process.exit(0);
});
