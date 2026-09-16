/** One sample per texel per dispatch, independent of the requested total samples. */
export class ProgressiveScheduler {
    dispatches;
    lastDispatchMs;
    tileSize;
    cursor;
    sample;
    options;
    size;
    constructor(size, options) {
        this.size = size;
        this.options = options;
        this.reset();
    }
    reset() {
        this.sample = 0;
        this.cursor = 0;
        this.tileSize = this.options.tileSize;
        this.lastDispatchMs = 0;
        this.dispatches = 0;
    }
    get done() {
        return this.sample >= this.options.samples;
    }
    next() {
        return this.done
            ? null
            : {
                start: this.cursor,
                count: Math.min(this.tileSize, this.size - this.cursor),
                sample: this.sample,
            };
    }
    commit(job, elapsedMs) {
        if (job.start !== this.cursor ||
            job.sample !== this.sample ||
            job.count < 1 ||
            this.cursor + job.count > this.size)
            throw new Error('Out-of-order or invalid dispatch commit.');
        this.lastDispatchMs = elapsedMs;
        this.dispatches++;
        this.cursor += job.count;
        if (this.cursor === this.size) {
            this.cursor = 0;
            this.sample++;
        }
        // Change at most 2× per dispatch; CPU-side elapsed time includes the GPU completion fence.
        const ratio = Math.max(0.5, Math.min(2, this.options.targetDispatchMs / Math.max(0.1, elapsedMs)));
        this.tileSize = Math.max(this.options.minTileSize, Math.min(this.options.maxTileSize, Math.floor(this.tileSize * ratio)));
    }
    progress(state) {
        return {
            state,
            samples: this.sample,
            targetSamples: this.options.samples,
            fraction: (this.sample * this.size + this.cursor) / (this.options.samples * this.size),
            texelsInPass: this.cursor,
            tileSize: this.tileSize,
            lastDispatchMs: this.lastDispatchMs,
            dispatches: this.dispatches,
        };
    }
}
//# sourceMappingURL=scheduler.js.map