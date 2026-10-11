import { Platform } from 'react-native';
/**
 * Optional loopback collector retains production-JS results when console is
 * disabled. Only synthetic test data is sent, never application resources.
 */
export async function reportResult(value: Record<string, unknown>): Promise<void> {
    try {
        await fetch('http://127.0.0.1:9085/results', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: Platform.OS, os: Platform.Version, development: __DEV__, ...value }) });
    } catch { /* The ordinary test host does not require a collector. */ }
}
