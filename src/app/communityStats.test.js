import { test } from "node:test";
import assert from "node:assert/strict";
import { communityRating } from "./communityStats.js";

test("community averages come from totals and map to a named difficulty", () => {
  assert.deepEqual(communityRating({}), { count: 0, stars: 0, difficulty: 0, level: null });
  const rating = communityRating({ ratingCount: 3, starsTotal: 13, difficultyTotal: 8 });
  assert.equal(rating.stars, 4.3);
  assert.equal(rating.difficulty, 2.7);
  assert.equal(rating.level.name, "Moderate");
  assert.equal(communityRating({ ratingCount: 1, starsTotal: 5, difficultyTotal: 1 }).level.name, "Beginner");
  assert.equal(communityRating({ ratingCount: 2, starsTotal: 10, difficultyTotal: 10 }).level.name, "Expert");
});
