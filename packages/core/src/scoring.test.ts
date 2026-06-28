import type { Repository } from "@rust-snacks/db";
import { describe, expect, it } from "vitest";
import { calculateScore } from "./scoring";

describe("calculateScore", () => {
  const baseRepo: Repository = {
    id: 1,
    github_id: 12345,
    owner: "test-owner",
    name: "test-repo",
    stars: 100,
    forks: 10,
    description: "This is a test Rust project",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_scraped_at: null,
    status: "discovered",
  };

  it("should calculate score based on stars, forks, update activity, and description", () => {
    const score = calculateScore(baseRepo);
    expect(score).toBeGreaterThan(0);
  });

  it("should give higher score to recently updated repo", () => {
    const activeRepo = { ...baseRepo, updated_at: new Date().toISOString() };
    const inactiveRepo = {
      ...baseRepo,
      updated_at: new Date(
        Date.now() - 365 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };

    const activeScore = calculateScore(activeRepo);
    const inactiveScore = calculateScore(inactiveRepo);

    expect(activeScore).toBeGreaterThan(inactiveScore);
  });

  it("should limit maximum score from stars and forks", () => {
    const lowRepo = { ...baseRepo, stars: 10, forks: 2 };
    const highRepo = { ...baseRepo, stars: 100000, forks: 10000 };

    const lowScore = calculateScore(lowRepo);
    const highScore = calculateScore(highRepo);

    expect(highScore).toBeGreaterThan(lowScore);
    // Stars capped at 1000, forks capped at 500, update < 7 days +300, desc +50 = 1850 approx.
    expect(highScore).toBeLessThanOrEqual(2000);
  });
});
