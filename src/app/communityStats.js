// Community ratings: averages from running totals, and the named difficulty scale.
export const DIFFICULTY = [
  { level: 1, name: "Beginner", hint: "First drives: empty lots and very quiet streets" },
  { level: 2, name: "Easy", hint: "Quiet neighbourhoods with simple turns" },
  { level: 3, name: "Moderate", hint: "Some traffic, intersections and lane changes" },
  { level: 4, name: "Challenging", hint: "Busy roads, merging and tricky junctions" },
  { level: 5, name: "Expert", hint: "Highway speeds, heavy traffic, complex junctions" },
];
/** @param {{ ratingCount?: number, starsTotal?: number, difficultyTotal?: number }} route */
export function communityRating(route) {
  const count = route.ratingCount ?? 0;
  if (!count) return { count: 0, stars: 0, difficulty: 0, level: null };
  const stars = Math.round(((route.starsTotal ?? 0) / count) * 10) / 10;
  const difficulty = Math.round(((route.difficultyTotal ?? 0) / count) * 10) / 10;
  return { count, stars, difficulty, level: DIFFICULTY[Math.min(4, Math.max(0, Math.round(difficulty) - 1))] };
}
