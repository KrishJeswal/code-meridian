export {};

declare global {
  // Added in Clerk Dashboard → Sessions → Customize session token as
  // "org_name": "{{org.name}}". Optional because the token only has it when
  // an organization is active and the claim is configured.
  interface CustomJwtSessionClaims {
    org_name?: string;
  }
}
