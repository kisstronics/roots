import fs from "node:fs";

const file = "public/families/sharma.json";
const family = JSON.parse(fs.readFileSync(file, "utf8"));
const report = family.people.map((person) => ({
  id: person.id,
  name: `${person.firstName} ${person.lastName}`,
  hadPhoto: typeof person.photo === "string" && person.photo.startsWith("data:"),
}));
for (const person of family.people) {
  if (typeof person.photo === "string" && person.photo.startsWith("data:")) person.photo = null;
}
fs.writeFileSync(file, `${JSON.stringify(family, null, 2)}\n`);
console.log(JSON.stringify({ people: family.people.length, updatedAt: family.updatedAt, bytes: fs.statSync(file).size, report }, null, 2));
