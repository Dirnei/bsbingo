# PRD: Phase 3 — User Authentication & Ownership

## Introduction

Add user accounts via OAuth 2.0 (GitHub and Google) so word groups can be owned by users. Groups gain public/private visibility, and owners can share private groups via invite links. Anonymous users can still play public groups.

## Goals

- Enable OAuth 2.0 login via GitHub and Google (no custom registration/password)
- Create user profiles automatically from OAuth data (name, email, avatar)
- Tie word groups to their creators with ownership
- Support public and private group visibility
- Allow sharing private groups via token-based invite links
- Preserve anonymous access for playing public groups

## User Stories

### US-001: Configure OAuth providers
**Description:** As a developer, I need ASP.NET Core external authentication configured for GitHub and Google so users can sign in with their existing accounts.

**Acceptance Criteria:**
- [x] GitHub OAuth provider configured in ASP.NET Core Authentication
- [x] Google OAuth provider configured in ASP.NET Core Authentication
- [x] Client IDs and secrets configurable via environment variables / `appsettings.json`
- [x] OAuth callback endpoints registered and working
- [x] Typecheck passes

### US-002: User creation on first login
**Description:** As a new user, I want my account created automatically when I first sign in so there is no separate registration step.

**Acceptance Criteria:**
- [x] On first OAuth login, a User document is created in MongoDB
- [x] User document stores: displayName, email, avatarUrl (from OAuth profile)
- [x] User document stores linked OAuth provider info (provider name + provider user ID)
- [x] If user already exists (same provider + providerId), no duplicate is created
- [x] A user can link multiple OAuth providers to the same account (same email match)
- [x] Typecheck passes

### US-003: Implement UserActor
**Description:** As a developer, I need a UserActor to manage user state and OAuth identity linking through the actor system.

**Acceptance Criteria:**
- [x] UserActor handles `GetOrCreateUser` message (upsert on OAuth login)
- [x] UserActor handles `GetUser` message (by ID)
- [x] UserActor handles `LinkOAuthProvider` message (add provider to existing user)
- [x] Registered via Servus.Akka DI integration
- [x] Typecheck passes

### US-004: JWT issuance after OAuth callback
**Description:** As an authenticated user, I need a JWT token after login so the frontend can authenticate API requests.

**Acceptance Criteria:**
- [ ] After successful OAuth callback, a JWT is issued
- [ ] JWT contains user ID, display name, and email
- [ ] JWT has configurable expiration (default 7 days)
- [ ] JWT secret configurable via environment variables
- [ ] Token returned to frontend (via cookie or redirect with token)
- [ ] Typecheck passes

### US-005: Auth middleware for protected routes
**Description:** As a developer, I need authentication middleware so certain API endpoints require a valid JWT.

**Acceptance Criteria:**
- [ ] Middleware validates JWT on protected endpoints
- [ ] `GET /api/auth/me` returns current user info (name, email, avatar)
- [ ] Group create/edit/delete endpoints require authentication
- [ ] Group list and game endpoints remain publicly accessible
- [ ] Returns 401 for missing/invalid tokens on protected routes
- [ ] Typecheck passes

### US-006: Login UI with OAuth buttons
**Description:** As a user, I want a login page with "Sign in with GitHub" and "Sign in with Google" buttons so I can authenticate quickly.

**Acceptance Criteria:**
- [ ] Login page with two OAuth buttons (GitHub and Google)
- [ ] No username/password fields (OAuth only)
- [ ] Buttons initiate the OAuth redirect flow
- [ ] After successful login, redirects back to the app
- [ ] Matches the dark industrial aesthetic
- [ ] Typecheck passes

### US-007: User avatar and name in header
**Description:** As an authenticated user, I want to see my avatar and name in the app header so I know I'm logged in.

**Acceptance Criteria:**
- [ ] Header shows avatar image and display name when logged in
- [ ] Shows "Sign In" button when not logged in
- [ ] Dropdown menu with "My Groups" and "Sign Out" options
- [ ] Sign out clears the JWT and returns to anonymous state
- [ ] Typecheck passes

### US-008: Group ownership
**Description:** As an authenticated user, I want groups I create to be tied to my account so I can manage them from "My Groups."

**Acceptance Criteria:**
- [ ] `createdBy` field on groups is set to the current user's ID on creation
- [ ] Only the group owner can edit or delete their groups
- [ ] Non-owners see play button only (no edit/delete)
- [ ] Seed data groups have no owner (community groups)
- [ ] Typecheck passes

### US-009: Public/private group visibility
**Description:** As a group owner, I want to set my group as public or private so I can control who can play it.

**Acceptance Criteria:**
- [ ] Toggle on group create/edit form: Public (default) or Private
- [ ] Public groups visible to everyone in the group list
- [ ] Private groups visible only to the owner and shared users
- [ ] `GET /api/groups` filters based on visibility and current user
- [ ] Anonymous users see only public groups
- [ ] Typecheck passes

### US-010: Share private groups via invite link
**Description:** As a group owner, I want to generate an invite link for my private group so I can share it with specific people.

**Acceptance Criteria:**
- [ ] "Share" button on private group generates a unique invite URL
- [ ] Invite URL contains a token (e.g., `/groups/invite/{token}`)
- [ ] Visiting the invite URL grants access to the private group
- [ ] Shared users added to the group's `sharedWith` list
- [ ] Owner can see who has access
- [ ] Typecheck passes

### US-011: "My Groups" dashboard
**Description:** As an authenticated user, I want a dashboard showing all groups I own or have access to.

**Acceptance Criteria:**
- [ ] Page at `/my-groups` (requires authentication)
- [ ] Shows groups owned by the current user
- [ ] Shows private groups shared with the current user
- [ ] Edit/delete actions available for owned groups
- [ ] Play action available for all listed groups
- [ ] Typecheck passes

## Functional Requirements

- FR-1: OAuth 2.0 authentication via GitHub and Google providers
- FR-2: User document created automatically on first OAuth login (upsert)
- FR-3: JWT issued after OAuth callback with configurable expiration
- FR-4: `GET /api/auth/me` returns current user profile
- FR-5: Protected endpoints require valid JWT (create/edit/delete groups)
- FR-6: Public endpoints remain accessible without authentication
- FR-7: Groups have `createdBy` field linking to the owner
- FR-8: Groups have `visibility` field: "public" or "private"
- FR-9: Private groups accessible only by owner and users in `sharedWith` list
- FR-10: Invite token system for sharing private groups
- FR-11: Only group owners can edit or delete their groups
- FR-12: "My Groups" dashboard shows owned and shared groups

## Non-Goals

- No custom username/password registration
- No email verification
- No role-based access control (admin, moderator, etc.)
- No group transfer (change owner)
- No revoking individual shared access (only regenerate invite token)
- No social features (following users, liking groups)

## Design Considerations

- OAuth buttons: standard branded buttons (GitHub octocat, Google logo) on dark background
- User menu: avatar + name in header with dropdown
- "My Groups" page: similar card layout to the main group list
- Public/private toggle: simple switch or radio buttons on the group form
- Invite link: copy-to-clipboard button with visual feedback

## Technical Considerations

- ASP.NET Core external authentication middleware for OAuth providers
- JWT stored in httpOnly cookie (more secure) or localStorage (simpler)
- Consider refresh token strategy for long sessions
- OAuth client secrets must never be exposed to the frontend
- User data model supports multiple OAuth providers per user (for account linking)

## Success Metrics

- Users can sign in with GitHub or Google in under 10 seconds
- Group ownership correctly enforced (only owners can edit/delete)
- Private groups invisible to unauthorized users
- Invite links work for sharing private groups
- Anonymous users can still browse and play public groups

## Open Questions

- Should JWT be stored in an httpOnly cookie or localStorage?
- Should we support account deletion / GDPR data export?
- Should invite links be single-use or multi-use?
- Should there be a limit on how many groups a user can create?
