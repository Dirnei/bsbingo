# PRD: Phase 2 — Group Management (CRUD)

## Introduction

Add full CRUD capabilities for word groups so anyone (anonymous, no auth required) can create, edit, and delete custom word groups through the UI. This enables users to build their own bingo games for any meeting, topic, or event.

## Goals

- Allow anonymous users to create new word groups via the UI
- Provide a word list editor with add, remove, and drag-reorder functionality
- Enable editing and deleting existing groups
- Validate groups have at least 24 words and a name
- Provide both server-side and client-side validation

## User Stories

### US-001: Extend GroupActor with CRUD operations
**Description:** As a developer, I need the GroupActor to handle Create, Update, and Delete messages so word groups can be fully managed through the actor system.

**Acceptance Criteria:**
- [x] GroupActor handles `CreateGroup` message — validates and persists a new group to MongoDB
- [x] GroupActor handles `UpdateGroup` message — updates name, description, and/or words
- [x] GroupActor handles `DeleteGroup` message — removes group from MongoDB
- [x] Validation: group must have a `name` and at least 24 words
- [x] Returns appropriate success/error responses
- [x] Typecheck passes

### US-002: Create group management API endpoints
**Description:** As a frontend developer, I need CRUD API endpoints for groups so the UI can manage them.

**Acceptance Criteria:**
- [x] `POST /api/groups` — create a new group (body: name, description, words)
- [x] `PUT /api/groups/{id}` — update an existing group
- [x] `DELETE /api/groups/{id}` — delete a group
- [x] Returns 201 on create with the new group
- [x] Returns 400 with validation errors (missing name, fewer than 24 words)
- [x] Returns 404 when group not found on update/delete
- [x] Typecheck passes

### US-003: Group list page
**Description:** As a user, I want to see all available word groups in a list so I can browse, play, edit, or delete them.

**Acceptance Criteria:**
- [x] Page at `/groups` shows all groups
- [x] Each group card shows name, description, and word count
- [x] "Play" button navigates to game with that group
- [x] "Edit" button navigates to edit page
- [x] "Delete" button with confirmation dialog before deleting
- [x] "Create New Group" button visible and prominent
- [x] Matches dark industrial aesthetic
- [x] Typecheck passes

### US-004: Group create page
**Description:** As a user, I want to create a new word group by entering a name, description, and list of words.

**Acceptance Criteria:**
- [x] Page at `/groups/new`
- [x] Form fields: name (required), description (optional)
- [x] Word list editor component (see US-005)
- [x] "Save" button submits to `POST /api/groups`
- [x] Client-side validation: name required, at least 24 words
- [x] On success, navigates to group list with success feedback
- [x] On error, shows validation messages inline
- [x] Typecheck passes

### US-005: Word list editor component
**Description:** As a user, I want an intuitive word list editor so I can build my buzzword collection easily.

**Acceptance Criteria:**
- [ ] Text input to add new words (Enter key or "Add" button)
- [ ] Each word shown as a removable chip/tag or list item
- [ ] Remove button (X) on each word
- [ ] Drag-and-drop reordering of words
- [ ] Word count displayed (e.g., "32 words — minimum 24")
- [ ] Visual warning when below 24 words
- [ ] Duplicate word detection (warn, don't block)
- [ ] Reusable component (used in both create and edit pages)
- [ ] Typecheck passes

### US-006: Group edit page
**Description:** As a user, I want to edit an existing word group to update its name, description, or words.

**Acceptance Criteria:**
- [ ] Page at `/groups/{id}/edit`
- [ ] Pre-populated with existing group data (fetched from `GET /api/groups/{id}`)
- [ ] Same form layout as create page (reuses word list editor)
- [ ] "Save" button submits to `PUT /api/groups/{id}`
- [ ] Loading state while fetching group data
- [ ] 404 handling if group doesn't exist
- [ ] Typecheck passes

### US-007: Delete group with confirmation
**Description:** As a user, I want a confirmation dialog before deleting a group so I don't accidentally lose my word collection.

**Acceptance Criteria:**
- [ ] Delete button triggers a confirmation dialog ("Are you sure? This cannot be undone.")
- [ ] Dialog shows the group name being deleted
- [ ] "Cancel" closes dialog without action
- [ ] "Delete" sends `DELETE /api/groups/{id}` and removes from list
- [ ] Success feedback after deletion
- [ ] Typecheck passes

## Functional Requirements

- FR-1: GroupActor handles `CreateGroup`, `UpdateGroup`, `DeleteGroup` messages
- FR-2: Server-side validation rejects groups with fewer than 24 words or missing name
- FR-3: `POST /api/groups` creates a new group and returns 201 with the created group
- FR-4: `PUT /api/groups/{id}` updates an existing group
- FR-5: `DELETE /api/groups/{id}` removes a group from the database
- FR-6: Group list page displays all groups with play/edit/delete actions
- FR-7: Group create/edit forms include the word list editor component
- FR-8: Word list editor supports add, remove, drag-reorder, and shows word count
- FR-9: Client-side validation mirrors server-side rules (name required, >= 24 words)
- FR-10: Confirmation dialog required before group deletion

## Non-Goals

- No user ownership of groups (Phase 3 — currently all groups are anonymous)
- No private/public visibility toggle (Phase 3)
- No import/export of word lists (future enhancement)
- No word suggestions or auto-complete
- No categories or tagging for groups

## Design Considerations

- Group list: card-based layout matching the dark industrial aesthetic
- Word list editor: chip/tag style for words, with clear visual affordances for add/remove/reorder
- Forms: minimal, clean inputs with inline validation messages
- Confirmation dialog: modal overlay, consistent with the app's dark theme

## Technical Considerations

- Reuse the existing API client pattern from Phase 1
- Word list editor should be a standalone reusable component
- Consider debouncing or batching for the word editor to avoid excessive re-renders
- Server validation should return structured error objects (field-level errors)

## Success Metrics

- Users can create a new word group and play with it in under 2 minutes
- Validation prevents saving invalid groups (fewer than 24 words)
- Delete confirmation prevents accidental data loss
- All CRUD operations reflected immediately in the UI

## Open Questions

- Should we support bulk word input (paste a comma-separated or newline-separated list)?
- Should there be a maximum word limit per group?
- Should deleted groups be soft-deleted (recoverable) or hard-deleted?
