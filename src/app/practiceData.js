// Stable labels are stored with each drive; add choices without renaming existing ones.
export const PRACTICE_SKILLS = [
  "Starting and stopping", "Turns", "Intersections", "Lane changes",
  "Parking", "Backing up", "Highway merging", "Roundabouts",
];

export const PRACTICE_CONDITIONS = [
  "Residential roads", "City traffic", "Highway", "Rural roads",
  "Light traffic", "Heavy traffic", "Rain", "Night driving",
];

export function practiceCoverage(drives, learnerId, field, choices) {
  return choices.map((label) => {
    const matches = drives.filter((drive) => drive.learnerId === learnerId && Array.isArray(drive[field]) && drive[field].includes(label));
    const lastDate = matches.reduce((latest, drive) => drive.date > latest ? drive.date : latest, "");
    return { label, count: matches.length, lastDate };
  });
}
