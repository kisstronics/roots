import nodemailer from "nodemailer";

export function welcomeMessage(user) {
  const name = displayName(user);
  const home = appUrl("/admin");
  return {
    to: user.email,
    subject: "Welcome to Our Roots",
    text: [
      `Hello ${name},`,
      "",
      "Your Our Roots account is ready. You can create families and share a tree when you want someone to view it without logging in.",
      "",
      `Open your families: ${home}`,
    ].join("\n"),
    html: layout({
      title: "Welcome to Our Roots",
      body: `<p>Hello ${escapeHtml(name)},</p>
<p>Your Our Roots account is ready. You can create families and share a tree when you want someone to view it without logging in.</p>
<p><a href="${escapeHtml(home)}">Open your families</a></p>`,
    }),
  };
}

export function familyCreatedMessage(user, family) {
  const name = displayName(user);
  const familyName = String(family.name || "Your family").trim() || "Your family";
  const link = appUrl(`/admin/family/${family.slug}`);
  return {
    to: user.email,
    subject: `${familyName} is on Our Roots`,
    text: [
      `Hello ${name},`,
      "",
      `You created the ${familyName} family. It stays private until you generate a share link.`,
      "",
      `Open it: ${link}`,
    ].join("\n"),
    html: layout({
      title: `${escapeHtml(familyName)} is on Our Roots`,
      body: `<p>Hello ${escapeHtml(name)},</p>
<p>You created the ${escapeHtml(familyName)} family. It stays private until you generate a share link.</p>
<p><a href="${escapeHtml(link)}">Open ${escapeHtml(familyName)}</a></p>`,
    }),
  };
}

export async function sendWelcomeEmail(user) {
  return deliver(welcomeMessage(user));
}

export async function sendFamilyCreatedEmail(user, family) {
  return deliver(familyCreatedMessage(user, family));
}

export async function deliver(message) {
  const smtp = smtpConfig();
  if (!smtp) {
    console.warn(`Email is not configured, so "${message.subject}" was not sent to ${message.to}.`);
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  try {
    await transporter.sendMail({
      from: smtp.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    console.log(`Sent "${message.subject}" to ${message.to}.`);
    return true;
  } finally {
    transporter.close();
  }
}

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const user = process.env.SMTP_USER?.trim() ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const port = Number(process.env.SMTP_PORT) || 587;
  const from = process.env.MAIL_FROM?.trim() || (user ? `Our Roots <${user}>` : "");
  if (!host || !user || !pass.trim() || !from) return null;
  return {
    host,
    port,
    user,
    pass,
    from,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
  };
}

function appUrl(path) {
  const base = (process.env.APP_PUBLIC_URL || "http://localhost:5173/roots").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function displayName(user) {
  const name = String(user?.name || "").trim();
  return name || "there";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout({ title, body }) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;background:#f4efe4;color:#1c2822;font-family:Georgia,serif;">
    <div style="max-width:520px;margin:0 auto;padding:28px 20px;">
      <p style="margin:0 0 16px;letter-spacing:.14em;text-transform:uppercase;font-size:12px;color:#a4783b;">Our Roots</p>
      <h1 style="font-size:28px;font-weight:560;margin:0 0 12px;">${title}</h1>
      <div style="font-family:'Segoe UI',sans-serif;font-size:16px;line-height:1.5;">${body}</div>
    </div>
  </body>
</html>`;
}
