# PRD: Phase 5 — Polish & Production Readiness

## Introduction

Polish the application for production use with responsive mobile design, sound effects, animations, theme toggle, localization, PWA support, analytics, and security hardening. This phase transforms the functional app into a production-ready, delightful experience.

## Goals

- Make the app mobile-first and responsive for use during meetings on phones
- Add optional sound effects and enhanced animations (confetti on BINGO)
- Support dark/light theme toggle
- Localize the app in German and English
- Make the app installable as a PWA
- Add usage analytics (most-clicked words, game duration)
- Harden security with rate limiting and abuse protection

## User Stories

### US-001: Responsive mobile design
**Description:** As a player using my phone during a meeting, I want the app to work perfectly on mobile screens so I can play discreetly.

**Acceptance Criteria:**
- [ ] Board scales to fit phone screens (down to 320px width)
- [ ] Cells remain tappable with adequate touch targets (minimum 44px)
- [ ] Group selector and lobby UI work on mobile
- [ ] No horizontal scrolling on any page
- [ ] Navigation adapts to mobile (hamburger menu or bottom nav)
- [ ] Tested on iOS Safari and Android Chrome
- [ ] Typecheck passes

### US-002: Sound effects
**Description:** As a player, I want optional sound feedback when I mark a cell and when BINGO is achieved so the game feels more engaging.

**Acceptance Criteria:**
- [ ] Subtle click sound on cell mark
- [ ] Celebratory sound on BINGO achievement
- [ ] Sound toggle in settings (on/off, default off)
- [ ] Sound preference persisted in localStorage
- [ ] Sounds do not play if device is muted
- [ ] Typecheck passes

### US-003: Confetti animation on BINGO
**Description:** As a player, I want a confetti animation when someone gets BINGO so the moment feels celebratory.

**Acceptance Criteria:**
- [ ] Confetti particles burst on screen when BINGO is detected
- [ ] Existing green glow on winning cells is preserved
- [ ] Animation is performant (no frame drops)
- [ ] Animation can be disabled in settings
- [ ] Works in both single-player and multiplayer
- [ ] Typecheck passes

### US-004: Dark/light theme toggle
**Description:** As a user, I want to switch between dark and light themes based on my preference or environment.

**Acceptance Criteria:**
- [ ] Theme toggle button in header or settings
- [ ] Dark theme: current design (default)
- [ ] Light theme: inverted colors with good contrast and readability
- [ ] Theme preference persisted in localStorage
- [ ] Respects `prefers-color-scheme` system setting as initial default
- [ ] All pages and components support both themes
- [ ] Typecheck passes

### US-005: Localization (German / English)
**Description:** As a user, I want to switch the app language between German and English so I can use it in my preferred language.

**Acceptance Criteria:**
- [ ] Language selector (DE / EN) in header or settings
- [ ] All UI text translated: buttons, labels, messages, error text
- [ ] Current prototype is German — this remains the default
- [ ] English translation covers all user-facing strings
- [ ] Language preference persisted in localStorage
- [ ] Word groups / buzzwords are NOT translated (user-created content)
- [ ] Typecheck passes

### US-006: PWA support
**Description:** As a mobile user, I want to install the app on my home screen so I can access it quickly and play offline in single-player mode.

**Acceptance Criteria:**
- [ ] Web app manifest (`manifest.json`) with app name, icons, theme color
- [ ] Service worker caches static assets for offline access
- [ ] Offline single-player mode works (using last-loaded group data)
- [ ] "Add to Home Screen" prompt appears on supported browsers
- [ ] App icon and splash screen configured
- [ ] Typecheck passes

### US-007: Usage analytics
**Description:** As a product owner, I want basic analytics so I can understand how the app is being used.

**Acceptance Criteria:**
- [ ] Track most-clicked words across all games
- [ ] Track average game duration (time from first mark to BINGO)
- [ ] Track number of games played per group
- [ ] Analytics stored in MongoDB (no external service dependency)
- [ ] Admin-only API endpoint to view analytics summary
- [ ] Privacy-respecting: no personal data in analytics, no cookies for tracking
- [ ] Typecheck passes

### US-008: Rate limiting and abuse protection
**Description:** As an operator, I want rate limiting on public APIs so the app is protected from abuse.

**Acceptance Criteria:**
- [ ] Rate limiting on group creation endpoint (e.g., 10 per hour per IP)
- [ ] Rate limiting on game creation endpoint (e.g., 60 per hour per IP)
- [ ] Rate limiting on lobby creation (e.g., 5 per hour per IP)
- [ ] Returns 429 Too Many Requests when limit exceeded
- [ ] Rate limits configurable via appsettings
- [ ] Input validation on all API endpoints (max word length, max group name length, etc.)
- [ ] CORS configured to allow only the frontend origin
- [ ] Typecheck passes

### US-009: CI/CD pipeline
**Description:** As a developer, I want automated CI/CD so code quality is maintained and deployments are consistent.

**Acceptance Criteria:**
- [ ] GitHub Actions workflow for: lint, typecheck, test (backend + frontend), build, Docker image
- [ ] Backend tests run with xUnit + Akka.NET TestKit
- [ ] Frontend tests run with Vitest
- [ ] E2E tests with Playwright (at least smoke test)
- [ ] Docker image built and tagged on main branch pushes
- [ ] Pipeline fails on lint/test/build errors
- [ ] Typecheck passes

## Functional Requirements

- FR-1: All pages responsive down to 320px width with adequate touch targets
- FR-2: Optional sound effects on cell mark and BINGO (toggleable, default off)
- FR-3: Confetti animation on BINGO (toggleable)
- FR-4: Dark/light theme toggle with system preference detection
- FR-5: German and English localization for all UI text
- FR-6: PWA manifest and service worker for installability and offline single-player
- FR-7: Usage analytics stored in MongoDB (most-clicked words, game duration, games per group)
- FR-8: Rate limiting on creation endpoints with configurable limits
- FR-9: CORS, input validation, and security headers configured
- FR-10: CI/CD pipeline with lint, test, build, and Docker image steps

## Non-Goals

- No third-party analytics services (Google Analytics, Mixpanel, etc.)
- No A/B testing framework
- No user behavior tracking or session recording
- No additional languages beyond German and English
- No native mobile app (PWA only)
- No server-side rendering (SSR)

## Design Considerations

- Light theme: clean whites and grays, maintaining the industrial feel with orange accents
- Mobile: consider bottom sheet patterns for group selection and lobby joining
- Confetti: use a lightweight library (e.g., canvas-confetti) or custom canvas animation
- Settings page: toggles for sound, animations, theme, language

## Technical Considerations

- PWA: Vite PWA plugin for service worker generation
- Localization: i18n library (e.g., i18next) or simple key-value approach
- Rate limiting: ASP.NET Core rate limiting middleware (built-in since .NET 7)
- Analytics: separate MongoDB collection, write-behind pattern to minimize impact
- Structured logging with Serilog (JSON format) for production monitoring
- Docker image: multi-stage build for minimal image size

## Success Metrics

- Lighthouse mobile score > 90
- PWA installable on iOS and Android
- Light theme passes WCAG AA contrast requirements
- Rate limiting blocks abuse without affecting normal usage
- CI/CD pipeline runs in under 5 minutes

## Open Questions

- Should analytics be visible to all users or admin-only?
- Should we add a cookie consent banner for GDPR compliance?
- Should the PWA cache game data for a specific group or just static assets?
- Should we support additional languages in the future (framework ready)?
- What Docker registry should we use for image publishing?
