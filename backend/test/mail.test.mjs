import assert from "node:assert/strict";
import test from "node:test";
import { deliver, familyCreatedMessage, welcomeMessage } from "../src/mail.mjs";

test("welcome email goes to the new user", () => {
  const message = welcomeMessage({ email: "ada@example.com", name: "Ada Lovelace" });
  assert.equal(message.to, "ada@example.com");
  assert.equal(message.subject, "Welcome to Our Roots");
  assert.match(message.text, /Hello Ada Lovelace/);
  assert.match(message.text, /\/admin$/);
  assert.doesNotMatch(message.text, /ada@example.com/);
});

test("family email goes to the signed-up user", () => {
  process.env.APP_PUBLIC_URL = "http://localhost:5173/roots";
  const message = familyCreatedMessage(
    { email: "ada@example.com", name: "Ada" },
    { name: "Nair", slug: "nair" },
  );
  assert.equal(message.to, "ada@example.com");
  assert.equal(message.subject, "Nair is on Our Roots");
  assert.match(message.text, /created the Nair family/);
  assert.match(message.text, /http:\/\/localhost:5173\/roots\/admin\/family\/nair/);
});

test("mail is skipped when SMTP is not configured", async () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  const sent = await deliver(welcomeMessage({ email: "ada@example.com", name: "Ada" }));
  assert.equal(sent, false);
});
