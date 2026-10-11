export interface TimingDistribution {
	p50: number;
	p95: number;
	p99: number;
	max: number;
}
export interface FrameTiming {
	updateMs: number;
	recordMs: number;
	submitMs: number;
	totalMs: number;
}
export interface FrameProfile {
	samples: number;
	updateMs: TimingDistribution;
	recordMs: TimingDistribution;
	submitMs: TimingDistribution;
	totalMs: TimingDistribution;
}
export function timingDistribution(values: readonly number[]): TimingDistribution {
	const sorted = [...values].sort((a, b) => a - b);
	const percentile = (percent: number): number => sorted[Math.max(0, Math.ceil(sorted.length * percent) - 1)] ?? 0;
	return { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: sorted.at(-1) ?? 0 };
}
export function frameProfile(samples: readonly FrameTiming[]): FrameProfile {
	return {
		samples: samples.length,
		updateMs: timingDistribution(samples.map(sample => sample.updateMs)),
		recordMs: timingDistribution(samples.map(sample => sample.recordMs)),
		submitMs: timingDistribution(samples.map(sample => sample.submitMs)),
		totalMs: timingDistribution(samples.map(sample => sample.totalMs)),
	};
}
