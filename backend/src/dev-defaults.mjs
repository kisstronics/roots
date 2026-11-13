process.env.APP_PUBLIC_URL ||= "http://localhost:5173/roots";
process.env.GOOGLE_CALLBACK_URL ||= `${process.env.APP_PUBLIC_URL.replace(/\/$/, "")}/api/auth/google/callback`;
process.env.PORT ||= "3001";
