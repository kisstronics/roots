import { appUrl } from "./paths";

export interface EnquiryInput {
  email: string;
  phone: string;
  enquiry: string;
}

export function enquiryError(input: EnquiryInput): string | null {
  const email = input.email.trim();
  const phone = input.phone.trim();
  const enquiry = input.enquiry.trim();
  if (!email && !phone) return "Enter an email or a phone number.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That email does not look right.";
  if (phone && !/^\+?[0-9][0-9\s().-]{6,20}$/.test(phone)) return "That phone number does not look right.";
  if (!enquiry) return "Write a short enquiry.";
  if (enquiry.length > 2000) return "Keep the enquiry under 2000 characters.";
  return null;
}

export async function sendEnquiry(input: EnquiryInput): Promise<void> {
  const response = await fetch(appUrl("/__contact"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email.trim(),
      phone: input.phone.trim(),
      enquiry: input.enquiry.trim(),
    }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "The enquiry could not be sent.");
  }
}
