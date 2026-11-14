import assert from "node:assert/strict";
import test from "node:test";
import { deliver, familyCreatedMessage, shareMessage, treeUpdatedMessage, welcomeMessage } from "../src/mail.mjs";

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

test("share email invites someone who does not have an account", () => {
  process.env.APP_PUBLIC_URL = "http://localhost:5173/roots";
  const message = shareMessage({
    email: "new@example.com",
    name: "",
    family: { name: "Nair", slug: "nair" },
    role: "viewer",
    inviter: { name: "Ada" },
    pending: true,
  });
  assert.equal(message.to, "new@example.com");
  assert.equal(message.subject, "Ada shared Nair with you");
  assert.match(message.text, /access to view the Nair family/);
  assert.match(message.text, /Sign up with new@example.com/);
  assert.match(message.text, /http:\/\/localhost:5173\/roots\/signup/);
});

test("share email opens the family for an existing account", () => {
  process.env.APP_PUBLIC_URL = "http://localhost:5173/roots";
  const message = shareMessage({
    email: "ada@example.com",
    name: "Ada",
    family: { name: "Nair", slug: "nair" },
    role: "editor",
    inviter: { name: "Grace" },
    pending: false,
  });
  assert.match(message.text, /access to edit the Nair family/);
  assert.match(message.text, /http:\/\/localhost:5173\/roots\/admin\/family\/nair/);
});

test("update email tells the other person who saved the tree", () => {
  process.env.APP_PUBLIC_URL = "http://localhost:5173/roots";
  const message = treeUpdatedMessage(
    { email: "ada@example.com", name: "Ada" },
    { name: "Nair", slug: "nair" },
    { name: "Grace" },
  );
  assert.equal(message.to, "ada@example.com");
  assert.equal(message.subject, "Nair was updated");
  assert.match(message.text, /Grace saved changes to the Nair family/);
  assert.match(message.text, /http:\/\/localhost:5173\/roots\/admin\/family\/nair/);
});

test("mail is skipped when SMTP is not configured", async () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  const sent = await deliver(welcomeMessage({ email: "ada@example.com", name: "Ada" }));
  assert.equal(sent, false);
});
