import assert from "node:assert/strict";
import test from "node:test";
import { cleanPerson, cleanStructure, linksFromPeople, sameMillis } from "../src/db.mjs";

test("tree links keep relationship ids and leave person details out", () => {
  const links = linksFromPeople([
    {
      id: "ada",
      firstName: "Ada",
      lastName: "Lovelace",
      photo: "data:image/jpeg;base64,abc",
      parentIds: [],
      spouseIds: ["charles"],
      siblingIds: [],
    },
  ]);
  assert.deepEqual(links, [{ id: "ada", parentIds: [], spouseIds: ["charles"], siblingIds: [] }]);
  assert.equal("firstName" in links[0], false);
  assert.equal("photo" in links[0], false);
});

test("structure keeps known people and makes spouse links mutual", () => {
  const links = cleanStructure([
    { id: "ada", parentIds: ["missing", "ada"], spouseIds: ["charles"], siblingIds: ["ada"] },
    { id: "charles", parentIds: [], spouseIds: [], siblingIds: [] },
    { id: "ada", parentIds: ["charles"], spouseIds: [], siblingIds: [] },
  ]);
  assert.deepEqual(links, [
    { id: "ada", parentIds: [], spouseIds: ["charles"], siblingIds: [] },
    { id: "charles", parentIds: [], spouseIds: ["ada"], siblingIds: [] },
  ]);
});

test("a person profile rejects a blank name and ignores relationships", () => {
  const profile = cleanPerson({
    firstName: "Ada",
    lastName: "Lovelace",
    gender: "female",
    living: false,
    birthYear: 1815,
    deathYear: 1852,
    parentIds: ["george"],
    photo: "data:image/png;base64,abc",
  });
  assert.equal(profile.firstName, "Ada");
  assert.equal(profile.deathYear, 1852);
  assert.equal("parentIds" in profile, false);
  assert.throws(() => cleanPerson({ firstName: " ", lastName: "Lovelace" }), /first name/);
});

test("structure versions match only for the same millisecond", () => {
  const stamp = "2026-03-01T12:00:00.000Z";
  assert.equal(sameMillis(stamp, new Date(stamp)), true);
  assert.equal(sameMillis(stamp, "2026-03-01T12:00:00.001Z"), false);
  assert.equal(sameMillis("not-a-date", stamp), false);
});
