import { v4 as uuidv4 } from 'uuid';

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

export class JobQueue {
    private queue: MeetingJob[] = [];
    private currentJob: MeetingJob | null = null;
    private isProcessing: boolean = false;
    private processCallback: ((job: MeetingJob) => Promise<void>) | null = null;

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

        // Start processing if not already
        this.processNext();

        return job;
    }

    /**
     * Process the next job in the queue
     */
    private async processNext(): Promise<void> {
        if (this.isProcessing || !this.processCallback) {
            return;
        }

        // Check for scheduled jobs
        const now = new Date();
        const readyJob = this.queue.find(
            (job) => job.status === 'queued' && (!job.scheduledTime || job.scheduledTime <= now)
        );

        if (!readyJob) {
            // Check if there are scheduled jobs waiting
            const pendingScheduled = this.queue.filter(
                (job) => job.status === 'queued' && job.scheduledTime && job.scheduledTime > now
            );

            if (pendingScheduled.length > 0) {
                const nextScheduled = pendingScheduled.sort(
                    (a, b) => (a.scheduledTime?.getTime() || 0) - (b.scheduledTime?.getTime() || 0)
                )[0];

                const delay = nextScheduled.scheduledTime!.getTime() - now.getTime();
                console.log(`⏰ Next scheduled job in ${Math.round(delay / 1000)}s`);
                setTimeout(() => this.processNext(), delay);
            }
            return;
        }

        this.isProcessing = true;
        this.currentJob = readyJob;
        readyJob.status = 'processing';
        readyJob.startedAt = new Date();

        console.log(`🔄 Processing job: ${readyJob.id}`);

        try {
            await this.processCallback(readyJob);
            readyJob.status = 'completed';
            readyJob.completedAt = new Date();
            console.log(`✅ Job completed: ${readyJob.id}`);
        } catch (error) {
            readyJob.status = 'failed';
            readyJob.error = error instanceof Error ? error.message : String(error);
            readyJob.completedAt = new Date();
            console.error(`❌ Job failed: ${readyJob.id}`, error);
        }

        this.currentJob = null;
        this.isProcessing = false;

        // Process next job
        this.processNext();
    }

    /**
     * Get job by ID
     */
    getJob(jobId: string): MeetingJob | undefined {
        return this.queue.find((job) => job.id === jobId);
    }

    /**
     * Get current job being processed
     */
    getCurrentJob(): MeetingJob | null {
        return this.currentJob;
    }

    /**
     * Get all jobs
     */
    getAllJobs(): MeetingJob[] {
        return [...this.queue];
    }

    /**
     * Get queue status
     */
    getStatus(): { isProcessing: boolean; queueLength: number; currentJob: MeetingJob | null } {
        return {
            isProcessing: this.isProcessing,
            queueLength: this.queue.filter((j) => j.status === 'queued').length,
            currentJob: this.currentJob,
        };
    }

    /**
     * Update job status to in-meeting
     */
    updateJobStatus(jobId: string, status: MeetingJob['status']): void {
        const job = this.getJob(jobId);
        if (job) {
            job.status = status;
        }
    }
}

export const jobQueue = new JobQueue();
