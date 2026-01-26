import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from './env';

passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.GOOGLE_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      // Extract user info
      const userProfile = {
        id: profile.id,
        email: profile.emails?.[0]?.value || '',
        displayName: profile.displayName,
      };

      return done(null, userProfile);
    }
  )
);

// Serialize user (not used in stateless JWT auth, but required by Passport)
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

export default passport;
