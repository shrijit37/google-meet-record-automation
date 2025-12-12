import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/config.js';

export interface MeetingJob {
    id: string;
    meetingUrl: string;
    startRecording: boolean;
    scheduledTime?: Date;
    status: 'queued' | 'processing' | 'in-meeting' | 'completed' | 'failed';
    error?: string;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
}

/**
 * Concurrent job queue supporting multiple simultaneous meetings.
 */
export class JobQueue {
    private queue: MeetingJob[] = [];
    private activeJobs: Map<string, MeetingJob> = new Map();
    private processCallback: ((job: MeetingJob) => Promise<void>) | null = null;
    private scheduledTimers: Map<string, NodeJS.Timeout> = new Map();

    /**
     * Set the callback function that processes jobs
     */
    setProcessor(callback: (job: MeetingJob) => Promise<void>): void {
        this.processCallback = callback;
    }

    /**
     * Add a new meeting job to the queue
     */
    addJob(meetingUrl: string, startRecording: boolean = true, scheduledTime?: Date): MeetingJob {
        const job: MeetingJob = {
            id: uuidv4(),
            meetingUrl,
            startRecording,
            scheduledTime,
            status: 'queued',
            createdAt: new Date(),
        };

        this.queue.push(job);
        console.log(`📥 Job added: ${job.id} - ${meetingUrl}`);

        // Start processing
        this.processNext();

        return job;
    }

    /**
     * Process next available job(s) - supports concurrent processing
     */
    private async processNext(): Promise<void> {
        if (!this.processCallback) {
            return;
        }

        const now = new Date();

        // Find all queued jobs that are ready
        const readyJobs = this.queue.filter(
            (job) => job.status === 'queued' && (!job.scheduledTime || job.scheduledTime <= now)
        );

        // Process as many jobs as we have slots for
        for (const job of readyJobs) {
            // Check if we have capacity
            if (this.activeJobs.size >= config.maxConcurrentSessions) {
                console.log(`⏳ Max concurrent (${config.maxConcurrentSessions}) reached. Job ${job.id} waiting.`);
                break;
            }

            // Start processing this job (don't await - run in parallel)
            this.processJob(job);
        }

        // Schedule timer for any future scheduled jobs
        this.scheduleUpcomingJobs();
    }

    /**
     * Process a single job
     */
    private async processJob(job: MeetingJob): Promise<void> {
        if (!this.processCallback) return;

        job.status = 'processing';
        job.startedAt = new Date();
        this.activeJobs.set(job.id, job);

        console.log(`🔄 Processing job: ${job.id} (active: ${this.activeJobs.size}/${config.maxConcurrentSessions})`);

        try {
            await this.processCallback(job);
            // Note: Job completion is handled externally (when meeting ends)
            // The callback should update status to 'in-meeting' while active
        } catch (error) {
            job.status = 'failed';
            job.error = error instanceof Error ? error.message : String(error);
            job.completedAt = new Date();
            this.activeJobs.delete(job.id);
            console.error(`❌ Job failed: ${job.id}`, error);

            // Try to process next job since we freed a slot
            this.processNext();
        }
    }

    /**
     * Mark a job as completed and release its slot
     */
    completeJob(jobId: string, error?: string): void {
        const job = this.getJob(jobId);
        if (!job) return;

        if (error) {
            job.status = 'failed';
            job.error = error;
        } else {
            job.status = 'completed';
        }
        job.completedAt = new Date();
        this.activeJobs.delete(jobId);

        console.log(`${error ? '❌' : '✅'} Job ${error ? 'failed' : 'completed'}: ${jobId}`);

        // Process next queued job since we freed a slot
        this.processNext();
    }

    /**
     * Schedule timers for upcoming jobs
     */
    private scheduleUpcomingJobs(): void {
        const now = new Date();
        const pendingScheduled = this.queue.filter(
            (job) => job.status === 'queued' && job.scheduledTime && job.scheduledTime > now
        );

        for (const job of pendingScheduled) {
            // Skip if already scheduled
            if (this.scheduledTimers.has(job.id)) continue;

            const delay = job.scheduledTime!.getTime() - now.getTime();
            console.log(`⏰ Job ${job.id} scheduled in ${Math.round(delay / 1000)}s`);

            const timer = setTimeout(() => {
                this.scheduledTimers.delete(job.id);
                this.processNext();
            }, delay);

            this.scheduledTimers.set(job.id, timer);
        }
    }

    /**
     * Get job by ID
     */
    getJob(jobId: string): MeetingJob | undefined {
        return this.queue.find((job) => job.id === jobId);
    }

    /**
     * Get all active jobs (currently processing or in-meeting)
     */
    getActiveJobs(): MeetingJob[] {
        return Array.from(this.activeJobs.values());
    }

    /**
     * Get all jobs
     */
    getAllJobs(): MeetingJob[] {
        return [...this.queue];
    }

    /**
     * Get queue status - now shows concurrent info
     */
    getStatus(): {
        activeCount: number;
        maxConcurrent: number;
        queueLength: number;
        activeJobs: { id: string; meetingUrl: string; status: string }[];
    } {
        return {
            activeCount: this.activeJobs.size,
            maxConcurrent: config.maxConcurrentSessions,
            queueLength: this.queue.filter((j) => j.status === 'queued').length,
            activeJobs: this.getActiveJobs().map((j) => ({
                id: j.id,
                meetingUrl: j.meetingUrl,
                status: j.status,
            })),
        };
    }

    /**
     * Update job status
     */
    updateJobStatus(jobId: string, status: MeetingJob['status']): void {
        const job = this.getJob(jobId);
        if (job) {
            job.status = status;
        }
    }

    /**
     * Clear all scheduled timers (for cleanup)
     */
    clearTimers(): void {
        for (const timer of this.scheduledTimers.values()) {
            clearTimeout(timer);
        }
        this.scheduledTimers.clear();
    }
}

export const jobQueue = new JobQueue();
