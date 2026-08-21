export function operatorIqSchedulerEnabled(
  value = process.env.OPERATOR_IQ_SCHEDULER_ENABLED
): boolean {
  return value === "1";
}
