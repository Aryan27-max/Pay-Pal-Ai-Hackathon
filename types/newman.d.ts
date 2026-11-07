/** Minimal types for the part of newman's Node API that scripts/newman-run.ts uses. */
declare module "newman" {
  namespace newman {
    type Stat = { total: number; failed: number };
    type NewmanRunSummary = { run: { stats: { requests: Stat; assertions: Stat } } };
    type NewmanRunOptions = {
      collection: string;
      environment?: string;
      workingDir?: string;
      reporters?: string[];
      reporter?: Record<string, unknown>;
      timeoutRequest?: number;
    };
    function run(options: NewmanRunOptions, callback: (err: Error | null, summary: NewmanRunSummary) => void): void;
  }
  export default newman;
}
