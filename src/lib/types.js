export const DEFAULT_WEIGHTS = {
  academics: 30,
  attendance: 20,
  lms: 15,
  engagement: 10,
  skills: 10,
  placement: 15,
};
export function riskBand(score) {
  if (score >= 80) return "On Track";
  if (score >= 65) return "Monitor";
  if (score >= 50) return "Needs Attention";
  return "High Priority";
}
