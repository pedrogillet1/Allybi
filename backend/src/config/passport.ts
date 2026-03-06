import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { config } from "./env";

const googleCallbackUrl = String(
  config.GOOGLE_AUTH_CALLBACK_URL || config.GOOGLE_CALLBACK_URL || "",
).trim();

if (!googleCallbackUrl && process.env.NODE_ENV !== "test") {
  throw new Error(
    "Google OAuth callback URL is missing. Configure GOOGLE_AUTH_CALLBACK_URL.",
  );
}

passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: googleCallbackUrl,
    },
    (accessToken, refreshToken, profile, done) => {
      const primaryEmail =
        profile.emails?.find((entry) => Boolean(entry?.value?.trim())) || null;
      const primaryEmailAny = primaryEmail as
        | { verified?: boolean | null }
        | null;
      const emailVerified =
        typeof primaryEmailAny?.verified === "boolean"
          ? primaryEmailAny.verified
          : null;

      // Extract user info
      const userProfile = {
        id: profile.id,
        email: primaryEmail?.value || "",
        emailVerified,
        displayName: profile.displayName,
      };

      return done(null, userProfile);
    },
  ),
);

// Serialize user (not used in stateless JWT auth, but required by Passport)
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

export default passport;
